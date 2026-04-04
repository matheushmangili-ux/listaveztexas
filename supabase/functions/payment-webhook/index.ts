// payment-webhook Edge Function
// Processes Stripe webhooks: creates onboarding token + sends welcome email
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const BASE_URL = Deno.env.get('BASE_URL') || 'https://listaveztexas.vercel.app'

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

async function verifyStripeSignature(payload: string, signature: string): Promise<boolean> {
  // Parse the signature header
  const parts = signature.split(',').reduce((acc: Record<string, string>, part) => {
    const [key, value] = part.split('=')
    acc[key] = value
    return acc
  }, {})

  const timestamp = parts['t']
  const expectedSig = parts['v1']

  if (!timestamp || !expectedSig) return false

  // Replay protection: reject webhooks older than 300 seconds
  const webhookAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)
  if (webhookAge > 300 || webhookAge < -300) return false

  // Create signed payload
  const signedPayload = `${timestamp}.${payload}`

  // Compute HMAC-SHA256
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))

  // Timing-safe comparison of computed vs expected signature bytes
  const computedBytes = new Uint8Array(sig)
  const expectedBytes = hexToUint8Array(expectedSig)

  return timingSafeEqual(computedBytes, expectedBytes)
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'MinhaVez <noreply@minhavez.com.br>',
      to: [to],
      subject,
      html
    })
  })
  return res.json()
}

function welcomeEmailHTML(setupUrl: string, plano: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#09090B;font-family:'Inter',system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;padding:40px 20px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#18181B;border-radius:8px;border:1px solid rgba(255,255,255,.06)">
  <tr><td style="padding:40px 32px 24px;text-align:center">
    <h1 style="margin:0;font-size:24px;font-weight:800;color:#FAFAFA;font-family:'Inter',sans-serif">Minha Vez</h1>
    <p style="margin:4px 0 0;font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:2px">Bem-vindo</p>
  </td></tr>
  <tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,.06)"></div></td></tr>
  <tr><td style="padding:24px 32px">
    <p style="margin:0 0 16px;color:#A1A1AA;font-size:15px;line-height:1.6">
      Sua compra do plano <strong style="color:#E11D48">${plano.toUpperCase()}</strong> foi confirmada!
    </p>
    <p style="margin:0 0 24px;color:#A1A1AA;font-size:15px;line-height:1.6">
      Clique no botão abaixo para configurar sua loja. Você vai definir o nome, setores e cadastrar seus vendedores.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${setupUrl}" style="display:inline-block;padding:14px 32px;background:#E11D48;color:#09090B;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px">
          Configurar minha loja
        </a>
      </td></tr>
    </table>
    <p style="margin:24px 0 0;color:#71717A;font-size:12px;line-height:1.5">
      Este link expira em 7 dias. Se precisar de ajuda, responda este e-mail.
    </p>
  </td></tr>
  <tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,.06)"></div></td></tr>
  <tr><td style="padding:20px 32px;text-align:center">
    <p style="margin:0;color:#52525B;font-size:11px">&copy; ${new Date().getFullYear()} MinhaVez. Todos os direitos reservados.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function setupCompleteEmailHTML(slug: string) {
  const tabletUrl = `${BASE_URL}/${slug}/tablet`
  const dashUrl = `${BASE_URL}/${slug}/dashboard`
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#09090B;font-family:'Inter',system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;padding:40px 20px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#18181B;border-radius:8px;border:1px solid rgba(255,255,255,.06)">
  <tr><td style="padding:40px 32px 24px;text-align:center">
    <h1 style="margin:0;font-size:24px;font-weight:800;color:#FAFAFA">Minha Vez</h1>
    <p style="margin:4px 0 0;font-size:11px;color:#34D399;text-transform:uppercase;letter-spacing:2px">Loja Configurada</p>
  </td></tr>
  <tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,.06)"></div></td></tr>
  <tr><td style="padding:24px 32px">
    <p style="margin:0 0 20px;color:#A1A1AA;font-size:15px;line-height:1.6">
      Sua loja está pronta! Salve os links abaixo:
    </p>
    <div style="margin-bottom:12px;padding:12px 16px;background:#131316;border:1px solid rgba(255,255,255,.06);border-radius:6px">
      <p style="margin:0 0 4px;font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:1px;font-weight:600">Tablet (Recepção)</p>
      <a href="${tabletUrl}" style="color:#E11D48;font-size:13px;font-family:monospace;text-decoration:none">${tabletUrl}</a>
    </div>
    <div style="margin-bottom:12px;padding:12px 16px;background:#131316;border:1px solid rgba(255,255,255,.06);border-radius:6px">
      <p style="margin:0 0 4px;font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:1px;font-weight:600">Dashboard (Gerência)</p>
      <a href="${dashUrl}" style="color:#E11D48;font-size:13px;font-family:monospace;text-decoration:none">${dashUrl}</a>
    </div>
    <p style="margin:20px 0 0;color:#71717A;font-size:12px;line-height:1.5">
      Abra o link do Tablet no navegador do seu tablet e deixe no balcão. Boas vendas!
    </p>
  </td></tr>
  <tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,.06)"></div></td></tr>
  <tr><td style="padding:20px 32px;text-align:center">
    <p style="margin:0;color:#52525B;font-size:11px">&copy; ${new Date().getFullYear()} MinhaVez. Todos os direitos reservados.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const body = await req.text()
    const signature = req.headers.get('stripe-signature') || ''

    // Verify webhook signature
    const isValid = await verifyStripeSignature(body, signature)
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      })
    }

    const event = JSON.parse(body)

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const email = session.customer_email || session.metadata?.email
      const plano = session.metadata?.plano || 'pro'
      const stripeCustomerId = session.customer
      const stripeSubscriptionId = session.subscription

      if (!email) {
        return new Response(JSON.stringify({ error: 'No email in session' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        })
      }

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )

      // Idempotency: skip if a token for this Stripe session already exists
      const { data: existing } = await supabaseAdmin
        .from('onboarding_tokens')
        .select('token')
        .eq('stripe_session_id', session.id)
        .maybeSingle()

      if (existing) {
        return new Response(JSON.stringify({ received: true, token: existing.token }), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        })
      }

      // Generate onboarding token
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      const { error: insertErr } = await supabaseAdmin
        .from('onboarding_tokens')
        .insert({
          token,
          email,
          plano,
          stripe_session_id: session.id,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          used: false,
          expires_at: expiresAt.toISOString()
        })

      if (insertErr) {
        console.error('Error creating onboarding token:', insertErr)
        return new Response(JSON.stringify({ error: 'Failed to create token' }), {
          status: 500, headers: { 'Content-Type': 'application/json' }
        })
      }

      // Send welcome email with setup link
      const setupUrl = `${BASE_URL}/setup?token=${token}`
      await sendEmail(email, 'Bem-vindo ao MinhaVez! Configure sua loja', welcomeEmailHTML(setupUrl, plano))

      return new Response(JSON.stringify({ received: true, token }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    }

    // Handle invoice.payment_failed
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object
      const email = invoice.customer_email

      if (email) {
        await sendEmail(
          email,
          'MinhaVez — Problema com seu pagamento',
          `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#09090B;font-family:'Inter',system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#09090B;padding:40px 20px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#18181B;border-radius:8px;border:1px solid rgba(255,255,255,.06)">
  <tr><td style="padding:40px 32px 24px;text-align:center">
    <h1 style="margin:0;font-size:24px;font-weight:800;color:#FAFAFA">Minha Vez</h1>
    <p style="margin:4px 0 0;font-size:11px;color:#F87171;text-transform:uppercase;letter-spacing:2px">Atenção</p>
  </td></tr>
  <tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,.06)"></div></td></tr>
  <tr><td style="padding:24px 32px">
    <p style="margin:0 0 16px;color:#A1A1AA;font-size:15px;line-height:1.6">
      Houve um problema ao processar seu pagamento. Para evitar a suspensão do serviço, atualize seus dados de pagamento.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${BASE_URL}" style="display:inline-block;padding:14px 32px;background:#F87171;color:#09090B;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px">
          Atualizar pagamento
        </a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:20px 32px;text-align:center">
    <p style="margin:0;color:#52525B;font-size:11px">&copy; ${new Date().getFullYear()} MinhaVez</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
        )
      }
    }

    // Handle invoice.paid — reactivate tenant after a previously failed payment recovers
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object
      if (invoice.subscription) {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
        await supabaseAdmin
          .from('tenants')
          .update({ status: 'active' })
          .eq('stripe_subscription_id', invoice.subscription)
      }
    }

    // Handle customer.subscription.updated — reactivate tenant when subscription becomes active again
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object
      if (subscription.status === 'active') {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
        await supabaseAdmin
          .from('tenants')
          .update({ status: 'active' })
          .eq('stripe_subscription_id', subscription.id)
      }
    }

    // Handle customer.subscription.deleted (cancellation)
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )

      // Mark tenant as inactive
      await supabaseAdmin
        .from('tenants')
        .update({ status: 'inactive' })
        .eq('stripe_subscription_id', subscription.id)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})
