// minhavez — Edge Function: ai-assist
// Proxy para Groq AI (free tier, Llama 3.3 70B). 5 features:
//   turno-summary, mission-suggestions, vendor-tips, vm-compliance, flow-prediction
// Cache em ai_cache, rate limit em memória.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const GROQ_VISION_MODEL = 'llama-3.2-90b-vision-preview'

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false }
})

let _groqKey: string | null = null
const _rateCounter = new Map<string, number>()
const _memCache = new Map<string, { data: unknown; exp: number }>()

async function getGroqKey(): Promise<string> {
  if (_groqKey) return _groqKey
  const { data } = await sb.from('app_secrets').select('value').eq('key', 'groq_api_key').single()
  if (!data?.value) throw new Error('groq_api_key not found in app_secrets')
  _groqKey = data.value
  return _groqKey!
}

function checkRateLimit(): boolean {
  const minute = Math.floor(Date.now() / 60000).toString()
  const count = _rateCounter.get(minute) || 0
  if (count >= 28) return false // Groq free: 30 RPM
  _rateCounter.set(minute, count + 1)
  for (const [k] of _rateCounter) { if (k !== minute) _rateCounter.delete(k) }
  return true
}

async function callGroq(prompt: string, images?: { mime: string; b64: string }[]): Promise<unknown> {
  const key = await getGroqKey()
  const model = images ? GROQ_VISION_MODEL : GROQ_MODEL

  const content: unknown[] = [{ type: 'text', text: prompt }]
  if (images) {
    for (const img of images) {
      content.push({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.b64}` } })
    }
  }

  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: images ? content : prompt }],
      temperature: images ? 0.3 : 0.7,
      max_tokens: images ? 800 : 500,
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(15000)
  })

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`Groq ${resp.status}: ${txt.slice(0, 200)}`)
  }

  const json = await resp.json()
  const text = json?.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty Groq response')
  return JSON.parse(text)
}

async function getCached(tenantId: string, key: string): Promise<unknown | null> {
  const memKey = `${tenantId}:${key}`
  const mem = _memCache.get(memKey)
  if (mem && mem.exp > Date.now()) return mem.data

  const { data } = await sb.from('ai_cache')
    .select('response')
    .eq('tenant_id', tenantId)
    .eq('cache_key', key)
    .gt('expires_at', new Date().toISOString())
    .single()
  if (data?.response) {
    _memCache.set(memKey, { data: data.response, exp: Date.now() + 3600000 })
    return data.response
  }
  return null
}

async function setCache(tenantId: string, key: string, response: unknown, ttlMs: number) {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString()
  await sb.from('ai_cache').upsert({
    tenant_id: tenantId,
    cache_key: key,
    response,
    expires_at: expiresAt
  }, { onConflict: 'tenant_id,cache_key' }).then(() => {})
  _memCache.set(`${tenantId}:${key}`, { data: response, exp: Date.now() + ttlMs })
}

// ─── Feature handlers ───

async function handleVendorTips(tenantId: string, payload: Record<string, unknown>) {
  const cacheKey = `vendor-tips:${payload.vendor_id}`
  const cached = await getCached(tenantId, cacheKey)
  if (cached) return cached

  const prompt = `Voce e um coach de vendas experiente em varejo brasileiro. Analise os dados deste vendedor e forneca 2-3 dicas praticas, curtas e motivadoras em portugues brasileiro. Tom amigavel, como um mentor. Se esta abaixo da media, encorajamento + acao concreta. Se acima, parabenize e sugira proximo nivel.

Dados do vendedor:
- Atendimentos hoje: ${payload.atendimentos}, Vendas: ${payload.vendas}, Conversao: ${payload.conversao}%
- Tempo medio: ${payload.tempo_medio}min
- Posicao no ranking: #${payload.rank} de ${payload.total_vendors}
- Media da loja: ${payload.store_conversao}% conversao

Responda APENAS em JSON valido: { "tips": [{ "emoji": "string", "tip": "string" }], "motivational": "string" }`

  const result = await callGroq(prompt)
  await setCache(tenantId, cacheKey, result, 3600000)
  return result
}

async function handleTurnoSummary(tenantId: string, payload: Record<string, unknown>) {
  const cacheKey = `turno-summary:${payload.turno_id}`
  const cached = await getCached(tenantId, cacheKey)
  if (cached) return cached

  const prompt = `Voce e um analista de varejo especializado. Analise os dados deste turno de uma loja e escreva um resumo executivo de 3-4 frases em portugues brasileiro, tom profissional mas acessivel. Destaque o ponto forte e uma oportunidade de melhoria.

Dados do turno:
- Duracao: ${payload.duracao}h
- Atendimentos: ${payload.total_atend}, Vendas: ${payload.vendas}, Conversao: ${payload.conversao}%
- Tempo medio: ${payload.tempo_medio}min
- Top vendedores: ${JSON.stringify(payload.ranking)}
- Motivos de perda: ${JSON.stringify(payload.motivos)}

Responda APENAS em JSON valido: { "resumo": "string", "destaque": "string", "oportunidade": "string" }`

  const result = await callGroq(prompt)
  await setCache(tenantId, cacheKey, result, 3600000)
  return result
}

async function handleMissionSuggestions(tenantId: string, payload: Record<string, unknown>) {
  const cacheKey = `mission-suggestions:${tenantId}`
  const cached = await getCached(tenantId, cacheKey)
  if (cached) return cached

  const prompt = `Voce e um game designer de um sistema de gamificacao para vendedores de varejo. Sugira 3 missoes calibradas para o proximo dia. Cada missao deve ter: titulo criativo em portugues, tipo de meta, valor da meta e XP (10-100).

Dados da semana:
- Media de atendimentos/dia: ${payload.avg_atend}
- Media de vendas/dia: ${payload.avg_vendas}
- Conversao media: ${payload.avg_conv}%
- Missoes ativas: ${JSON.stringify(payload.current_missions)}

Tipos validos: atendimentos_count, vendas_count, valor_vendido_total.
Metas alcancaveis (80-120% da media). Nomes criativos em portugues.

Responda APENAS em JSON valido: { "missions": [{ "title": "string", "goal_type": "string", "goal_value": number, "xp": number, "description": "string" }] }`

  const result = await callGroq(prompt)
  await setCache(tenantId, cacheKey, result, 3600000)
  return result
}

async function handleFlowPrediction(tenantId: string, payload: Record<string, unknown>) {
  const cacheKey = `flow-prediction:${payload.target_day}`
  const cached = await getCached(tenantId, cacheKey)
  if (cached) return cached

  const prompt = `Voce e um analista de dados de varejo. Com base no historico de fluxo, preveja o fluxo de atendimentos para cada hora (8h-22h). Identifique 2-3 horarios de pico.

Historico (ultimas 4 semanas, por hora):
${JSON.stringify(payload.hourly_data)}

Dia alvo: ${payload.target_day}

Responda APENAS em JSON valido: { "predictions": [{ "hour": number, "expected": number }], "peaks": [{ "hour": number, "expected": number, "suggestion": "string" }], "insight": "string" }`

  const result = await callGroq(prompt)
  await setCache(tenantId, cacheKey, result, 3600000)
  return result
}

async function handleVmCompliance(_tenantId: string, payload: Record<string, unknown>) {
  const [refResp, subResp] = await Promise.all([
    fetch(payload.ref_photo_url as string),
    fetch(payload.submission_photo_url as string)
  ])
  if (!refResp.ok || !subResp.ok) throw new Error('Failed to fetch VM images')

  const [refBuf, subBuf] = await Promise.all([refResp.arrayBuffer(), subResp.arrayBuffer()])
  const refB64 = btoa(String.fromCharCode(...new Uint8Array(refBuf)))
  const subB64 = btoa(String.fromCharCode(...new Uint8Array(subBuf)))

  const prompt = `Voce e um especialista em Visual Merchandising de varejo. Compare a foto de referencia (imagem 1) com a foto do vendedor (imagem 2). Avalie:
1. Similaridade geral (0-100%)
2. Organizacao dos produtos
3. Pontos positivos (lista)
4. Pontos a melhorar (lista)

Contexto: ${payload.task_description || ''}
Checklist: ${JSON.stringify(payload.checklist || [])}

Responda APENAS em JSON valido: { "score": number, "positivos": ["string"], "melhorias": ["string"], "resumo": "string" }`

  return await callGroq(prompt, [
    { mime: 'image/jpeg', b64: refB64 },
    { mime: 'image/jpeg', b64: subB64 }
  ])
}

// ─── Main handler ───

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) throw new Error('Invalid token')

    const tenantId = user.user_metadata?.tenant_id as string
    if (!tenantId) throw new Error('No tenant_id in user metadata')

    const { type, payload } = await req.json()
    if (!type || !payload) throw new Error('Missing type or payload')

    if (!checkRateLimit()) {
      return new Response(JSON.stringify({ ok: false, fallback: true, message: 'Rate limit — tente em 1 minuto' }),
        { headers: { ...cors, 'Content-Type': 'application/json' }, status: 429 })
    }

    let result: unknown
    switch (type) {
      case 'vendor-tips':         result = await handleVendorTips(tenantId, payload); break
      case 'turno-summary':       result = await handleTurnoSummary(tenantId, payload); break
      case 'mission-suggestions': result = await handleMissionSuggestions(tenantId, payload); break
      case 'flow-prediction':     result = await handleFlowPrediction(tenantId, payload); break
      case 'vm-compliance':       result = await handleVmCompliance(tenantId, payload); break
      default: throw new Error(`Unknown type: ${type}`)
    }

    return new Response(JSON.stringify({ ok: true, result }),
      { headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[ai-assist]', err)
    return new Response(JSON.stringify({ ok: false, fallback: true, message: (err as Error).message }),
      { headers: { ...cors, 'Content-Type': 'application/json' }, status: 500 })
  }
})
