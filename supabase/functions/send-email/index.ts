// send-email Edge Function
// Authenticated transactional email sender via Resend.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const BASE_URL = Deno.env.get('BASE_URL') || 'https://listaveztexas.vercel.app'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  })
}

function normalizeEmail(email: unknown) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders)
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Nao autenticado' }, 401, corsHeaders)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } }
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser()
    const user = userData?.user
    if (userErr || !user) {
      return json({ error: 'Sessao invalida' }, 401, corsHeaders)
    }

    const { type, to, slug, plano } = await req.json()
    const normalizedTo = normalizeEmail(to)
    const userEmail = normalizeEmail(user.email)

    if (!type || !to) {
      return json({ error: 'type e to sao obrigatorios' }, 400, corsHeaders)
    }

    if (!userEmail || normalizedTo !== userEmail) {
      return json({ error: 'Destino nao autorizado' }, 403, corsHeaders)
    }

    if (type !== 'setup-complete') {
      return json({ error: 'Tipo de email desconhecido' }, 400, corsHeaders)
    }

    if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
      return json({ error: 'Slug invalido' }, 400, corsHeaders)
    }

    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('slug, plano, owner_email')
      .eq('slug', slug)
      .single()

    if (tenantErr || !tenant) {
      return json({ error: 'Loja nao encontrada para esta sessao' }, 404, corsHeaders)
    }

    if (normalizeEmail(tenant.owner_email) !== userEmail) {
      return json({ error: 'Apenas o owner pode enviar este email' }, 403, corsHeaders)
    }

    const tabletUrl = `${BASE_URL}/${slug}/tablet`
    const dashUrl = `${BASE_URL}/${slug}/dashboard`
    const planLabel = typeof plano === 'string' ? plano : tenant.plano
    const subject = 'MinhaVez - Sua loja esta pronta!'
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#09090B;font-family:'Inter',system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;padding:40px 20px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#18181B;border-radius:8px;border:1px solid rgba(255,255,255,.06)">
  <tr><td style="padding:40px 32px 24px;text-align:center">
    <h1 style="margin:0;font-size:24px;font-weight:800;color:#FAFAFA">Minha Vez</h1>
    <p style="margin:4px 0 0;font-size:11px;color:#aaeec4;text-transform:uppercase;letter-spacing:2px">Loja Configurada</p>
  </td></tr>
  <tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,.06)"></div></td></tr>
  <tr><td style="padding:24px 32px">
    <p style="margin:0 0 20px;color:#A1A1AA;font-size:15px;line-height:1.6">Sua loja esta pronta! Salve os links abaixo:</p>
    <div style="margin-bottom:12px;padding:12px 16px;background:#131316;border:1px solid rgba(255,255,255,.06);border-radius:6px">
      <p style="margin:0 0 4px;font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:1px;font-weight:600">Tablet (Recepcao)</p>
      <a href="${tabletUrl}" style="color:#E11D48;font-size:13px;font-family:monospace;text-decoration:none">${tabletUrl}</a>
    </div>
    <div style="margin-bottom:12px;padding:12px 16px;background:#131316;border:1px solid rgba(255,255,255,.06);border-radius:6px">
      <p style="margin:0 0 4px;font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:1px;font-weight:600">Dashboard (Gerencia)</p>
      <a href="${dashUrl}" style="color:#E11D48;font-size:13px;font-family:monospace;text-decoration:none">${dashUrl}</a>
    </div>
    <p style="margin:20px 0 0;color:#71717A;font-size:12px;line-height:1.5">Plano: ${planLabel}. Abra o link do Tablet no navegador do seu tablet e coloque no balcao. Boas vendas!</p>
  </td></tr>
  <tr><td style="padding:20px 32px;text-align:center">
    <p style="margin:0;color:#52525B;font-size:11px">&copy; ${new Date().getFullYear()} MinhaVez</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'MinhaVez <onboarding@resend.dev>',
        to: [normalizedTo],
        subject,
        html
      })
    })

    const result = await res.json().catch(() => ({}))

    if (!res.ok) {
      return json({ error: 'Falha ao enviar email', result }, 502, corsHeaders)
    }

    return json({ success: true, id: result?.id || null }, 200, corsHeaders)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500, corsHeaders)
  }
})
