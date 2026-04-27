// resolve-onboarding-token Edge Function
// Validates a post-checkout onboarding token or Stripe session id without
// exposing onboarding_tokens through anon RLS.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false }
})

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  try {
    const body = await req.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    const sessionId = typeof body?.session_id === 'string' ? body.session_id.trim() : ''

    if (!token && !sessionId) {
      return json({ error: 'Token ou sessao de pagamento obrigatoria' }, 400, cors)
    }

    let query = sb
      .from('onboarding_tokens')
      .select('token')
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .limit(1)

    query = token ? query.eq('token', token) : query.eq('stripe_session_id', sessionId)

    const { data, error } = await query.maybeSingle()
    if (error || !data?.token) {
      return json({ error: 'Token invalido, expirado ou ainda nao processado' }, 404, cors)
    }

    return json({ token: data.token }, 200, cors)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500, cors)
  }
})
