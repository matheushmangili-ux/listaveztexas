// vendor-login-pin Edge Function
// Login do VENDEDOR no app por PIN (slug + pin). Diferente do `login-pin` (que
// loga a recepção/tablet): aqui cria sessão para o auth user do PRÓPRIO vendedor
// cujo PIN bateu, via magiclink + verifyOtp (sem enviar email). Brute-force
// protegido por (slug com prefixo 'vendor:') na tabela pin_login_attempts.
//
// Pré-requisitos do vendedor: ter PIN (vendedores.pin/pin_hash) E login de app
// (auth_user_id, criado pelo create-vendor-auth). PIN é 4 dígitos.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const MAX_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { slug, pin } = await req.json()
    if (!slug || !pin || !/^\d{4}$/.test(pin)) {
      return json({ error: 'Loja e PIN (4 dígitos) são obrigatórios' }, 400, cors)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const attemptKey = `vendor:${slug}`
    const now = new Date()

    const { data: attemptRow } = await admin
      .from('pin_login_attempts')
      .select('attempts, locked_until')
      .eq('slug', attemptKey)
      .maybeSingle()

    if (attemptRow?.locked_until && now < new Date(attemptRow.locked_until)) {
      const min = Math.ceil((new Date(attemptRow.locked_until).getTime() - now.getTime()) / 60000)
      return json({ error: `Muitas tentativas. Tente novamente em ${min} minuto${min !== 1 ? 's' : ''}.` }, 429, cors)
    }

    const { data: tenant, error: tenantErr } = await admin
      .from('tenants')
      .select('id, status')
      .eq('slug', slug)
      .eq('status', 'active')
      .single()
    if (tenantErr || !tenant) return json({ error: 'Loja não encontrada' }, 404, cors)

    const { data: vendedor, error: vendErr } = await admin
      .rpc('find_vendedor_by_pin', { p_tenant_id: tenant.id, p_pin: pin })
      .maybeSingle()
    if (vendErr) return json({ error: 'Erro ao validar PIN' }, 500, cors)

    if (!vendedor) {
      const cur = (attemptRow?.attempts ?? 0) + 1
      const locked = cur >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MINUTES * 60000).toISOString() : null
      await admin
        .from('pin_login_attempts')
        .upsert({ slug: attemptKey, attempts: cur, locked_until: locked, updated_at: now.toISOString() }, { onConflict: 'slug' })
      if (cur >= MAX_ATTEMPTS) {
        return json({ error: `Muitas tentativas. Tente novamente em ${LOCKOUT_MINUTES} minutos.` }, 429, cors)
      }
      const left = MAX_ATTEMPTS - cur
      return json({ error: `PIN inválido. ${left} tentativa${left !== 1 ? 's' : ''} restante${left !== 1 ? 's' : ''}.` }, 401, cors)
    }

    // PIN correto — zera o contador
    await admin
      .from('pin_login_attempts')
      .upsert({ slug: attemptKey, attempts: 0, locked_until: null, updated_at: now.toISOString() }, { onConflict: 'slug' })

    // Pega o auth user do próprio vendedor (precisa ter login criado)
    const { data: vrow } = await admin
      .from('vendedores')
      .select('auth_user_id')
      .eq('id', vendedor.id)
      .single()
    if (!vrow?.auth_user_id) {
      return json({ error: 'Esse vendedor ainda não tem login de app. Peça pro gestor ativar o acesso.' }, 403, cors)
    }

    const { data: authUser } = await admin.auth.admin.getUserById(vrow.auth_user_id)
    if (!authUser?.user?.email) return json({ error: 'Erro ao recuperar credenciais' }, 500, cors)

    // Sessão sem email: gera magiclink e verifica o hashed_token (mesmo padrão do login-pin)
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.user.email
    })
    if (linkErr || !linkData) return json({ error: 'Erro ao gerar sessão' }, 500, cors)

    const { data: session, error: sErr } = await admin.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink'
    })
    if (sErr || !session?.session) {
      return json({ error: 'Erro ao criar sessão: ' + (sErr?.message || 'desconhecido') }, 500, cors)
    }

    return json(
      {
        access_token: session.session.access_token,
        refresh_token: session.session.refresh_token,
        user: session.user,
        vendedor_nome: vendedor.nome
      },
      200,
      cors
    )
  } catch (err) {
    return json({ error: (err as Error).message || String(err) }, 500, cors)
  }
})
