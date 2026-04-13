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
  const cacheKey = `turno-summary:${payload.turno_id}:${payload.snapshot_hash || ''}`
  const cached = await getCached(tenantId, cacheKey)
  if (cached) return cached

  const prompt = `Você é um consultor sênior de operações de varejo brasileiro com 15+ anos de experiência. Sua função é entregar análise EXECUTIVA acionável a um gestor que tem 30 segundos pra ler.

BENCHMARKS DE VARELO BRASILEIRO (use pra comparar):
- Conversão saudável loja física moda/calçado: 28-38%. Acima de 40% é excelente. Abaixo de 25% precisa intervenção.
- Tempo médio de atendimento ideal: 8-15min. Abaixo de 5 = atropelo. Acima de 20 = ineficiência.
- Distribuição saudável: top vendedor não deve passar de 35% das vendas (concentração de risco).

REGRAS DE ESCRITA:
- Use NÚMEROS específicos (não "muitos" ou "alguns")
- Use VERBOS DE AÇÃO (treinar X, realocar Y, abordar Z)
- ZERO frases tipo "considere", "talvez", "pode ser interessante"
- Tom: direto, executivo, sem floreio
- Português brasileiro coloquial profissional

DADOS DO TURNO ATUAL:
- Duração: ${payload.duracao}h
- Atendimentos: ${payload.total_atend} | Vendas: ${payload.vendas} | Conversão: ${payload.conversao}%
- Tempo médio: ${payload.tempo_medio}min
- Top 3 vendedores: ${JSON.stringify(payload.ranking?.slice(0, 3) || [])}
- Top 3 motivos de perda: ${JSON.stringify(payload.motivos?.slice(0, 3) || [])}
- Vs ontem: conversão ${payload.delta_conv > 0 ? '+' : ''}${payload.delta_conv || 0}%, vendas ${payload.delta_vendas > 0 ? '+' : ''}${payload.delta_vendas || 0}

EXEMPLO DE BOA RESPOSTA (estrutura — você adapta com os dados reais):
{
  "headline": "Conversão 32% (acima da média do setor de 28%), mas 1 vendedor segura 41% das vendas",
  "destaque": { "titulo": "Karol entregou", "detalhe": "12 vendas em 28 atendimentos (43% conversão) — destaque acima do esperado." },
  "alerta": { "titulo": "Concentração de risco", "detalhe": "Karol = 41% das vendas. Se faltar amanhã, projeção cai pra 22 vendas (vs 35 hoje). Distribua leads mais." },
  "acao_imediata": "Próxima hora: realocar Marcos pra atender clientes preço-sensível (3 perdas por preço hoje, ele tem desconto liberado)",
  "score": 78
}

Responda APENAS em JSON válido: {
  "headline": "string (1 frase, max 110 chars, com numero principal)",
  "destaque": { "titulo": "string (max 30 chars)", "detalhe": "string com nome+numero" },
  "alerta": { "titulo": "string (max 30 chars)", "detalhe": "string com numero+ação" },
  "acao_imediata": "string (1 ação concreta pra executar HOJE, com nome se aplicável)",
  "score": number (0-100, score geral do turno comparado ao benchmark)
}`

  const result = await callGroq(prompt)
  await setCache(tenantId, cacheKey, result, 1800000) // 30min cache
  return result
}

async function handleMissionSuggestions(tenantId: string, payload: Record<string, unknown>) {
  const cacheKey = `mission-suggestions:${tenantId}:${payload.snapshot_hash || ''}`
  const cached = await getCached(tenantId, cacheKey)
  if (cached) return cached

  const prompt = `Você é um game designer de gamificação aplicada a varejo brasileiro. Cria missões diárias pra vendedores que sejam: ESPECÍFICAS (meta clara), DESAFIADORAS mas atingíveis (75-115% da média), VARIADAS (mix volume + qualidade + comportamento), e com nomes que motivem (referencias pop, gírias do time).

REGRAS DE CALIBRAÇÃO:
- Missão FÁCIL (80% da média): XP 30-50 — pra animar o time todo
- Missão MÉDIA (100% da média): XP 60-80 — desafio padrão
- Missão DIFÍCIL (115% da média): XP 100-150 — pros top performers
- Sempre balancear: 1 fácil + 1 média + 1 difícil

TIPOS VÁLIDOS (use exatamente esses):
- atendimentos_count (quantidade de atendimentos)
- vendas_count (quantidade de vendas)
- vendas_canal_count (vendas por canal específico)
- valor_vendido_total (faturamento individual em R$)

NOMES CRIATIVOS (exemplos do tom):
- "Sequência Brasileiríssima" (5 vendas seguidas)
- "Operação Tríplice" (3 atendimentos em 1h)
- "Ticket de Ouro" (venda > R$ 500)
- "Maratonista do Balcão" (10 atendimentos no dia)
- "Closer da Hora" (2 vendas na primeira hora)

DADOS REAIS DO TIME (últimos 7 dias):
- Média de atendimentos/vendedor/dia: ${payload.avg_atend}
- Média de vendas/vendedor/dia: ${payload.avg_vendas}
- Conversão média: ${payload.avg_conv}%
- Ticket médio: R$ ${payload.avg_ticket || 0}
- Vendedores ativos: ${payload.total_vendors || 'N/A'}
- Missões já ativas (não sugira parecidas): ${JSON.stringify(payload.current_missions || [])}

EXEMPLO DE BOA RESPOSTA:
{
  "missions": [
    {
      "title": "Largada Acelerada",
      "description": "5 atendimentos completados antes do meio-dia. Quem chega cedo, fatura cedo.",
      "goal_type": "atendimentos_count",
      "goal_value": 5,
      "xp": 40,
      "difficulty": "easy",
      "rationale": "80% da média (6 atend/dia), focado na manhã pra puxar o ritmo"
    },
    { "title": "Closer Brasileirão", "description": "3 vendas no dia. Ritmo de top performer.", "goal_type": "vendas_count", "goal_value": 3, "xp": 70, "difficulty": "medium", "rationale": "Igual à média de 3.2 vendas/dia" },
    { "title": "Ticket de Ouro", "description": "1 venda acima de R$ 600 — mostra que sabe vender o premium.", "goal_type": "valor_vendido_total", "goal_value": 600, "xp": 120, "difficulty": "hard", "rationale": "115% do ticket médio R$ 520 — empurra pra produtos top" }
  ]
}

Responda APENAS em JSON válido seguindo exatamente o schema acima. Sempre 3 missões: easy + medium + hard.`

  const result = await callGroq(prompt)
  await setCache(tenantId, cacheKey, result, 21600000) // 6h cache (sugestões diárias)
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
