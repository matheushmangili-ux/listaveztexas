// create-billing-portal Edge Function
// Creates a Stripe Customer Portal session for the caller's own tenant.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const BASE_URL = Deno.env.get('BASE_URL') || 'https://listaveztexas.vercel.app'

type TenantBilling = {
  id: string
  slug: string | null
  stripe_customer_id: string | null
  plano: string | null
  status: string | null
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

async function stripeRequest(endpoint: string, body: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(body).toString()
  })
  return res.json()
}

async function resolveBillingTenant(supabaseAdmin: ReturnType<typeof createClient>, userId: string) {
  const { data: ownedTenant } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, stripe_customer_id, plano, status')
    .eq('owner_user_id', userId)
    .limit(1)
    .maybeSingle()

  if (ownedTenant) return { tenant: ownedTenant as TenantBilling, role: 'owner' }

  const { data: membership } = await supabaseAdmin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .limit(1)
    .maybeSingle()

  if (!membership?.tenant_id) return null

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, stripe_customer_id, plano, status')
    .eq('id', membership.tenant_id)
    .single()

  if (!tenant) return null
  return { tenant: tenant as TenantBilling, role: membership.role as string }
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Nao autorizado' }, 401, cors)
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } }
    })

    const {
      data: { user },
      error: userErr
    } = await supabaseUser.auth.getUser()

    if (userErr || !user) {
      return json({ error: 'Sessao invalida' }, 401, cors)
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const resolved = await resolveBillingTenant(supabaseAdmin, user.id)
    if (!resolved) {
      return json({ error: 'Loja nao encontrada para esta sessao' }, 404, cors)
    }

    const { tenant } = resolved
    if (!tenant.stripe_customer_id) {
      return json({ error: 'Sem assinatura ativa para gerenciar' }, 400, cors)
    }

    const returnPath = tenant.slug ? `/${tenant.slug}/settings` : '/settings.html'
    const session = await stripeRequest('/billing_portal/sessions', {
      customer: tenant.stripe_customer_id,
      return_url: `${BASE_URL}${returnPath}`
    })

    if (session.error) {
      return json({ error: session.error.message }, 400, cors)
    }

    return json({ url: session.url }, 200, cors)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500, cors)
  }
})
