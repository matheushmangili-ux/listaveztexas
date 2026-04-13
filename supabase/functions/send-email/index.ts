// send-email Edge Function
// Generic email sender via Resend — called after setup completion
import { getCorsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const BASE_URL = Deno.env.get('BASE_URL') || 'https://listaveztexas.vercel.app'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { type, to, slug, plano } = await req.json()

    if (!type || !to) {
      return new Response(JSON.stringify({ error: 'type e to são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let subject = ''
    let html = ''

    if (type === 'setup-complete') {
      const tabletUrl = `${BASE_URL}/${slug}/tablet`
      const dashUrl = `${BASE_URL}/${slug}/dashboard`
      subject = 'MinhaVez — Sua loja está pronta!'
      html = `
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
    <p style="margin:0 0 20px;color:#A1A1AA;font-size:15px;line-height:1.6">Sua loja está pronta! Salve os links abaixo:</p>
    <div style="margin-bottom:12px;padding:12px 16px;background:#131316;border:1px solid rgba(255,255,255,.06);border-radius:6px">
      <p style="margin:0 0 4px;font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:1px;font-weight:600">Tablet (Recepção)</p>
      <a href="${tabletUrl}" style="color:#E11D48;font-size:13px;font-family:monospace;text-decoration:none">${tabletUrl}</a>
    </div>
    <div style="margin-bottom:12px;padding:12px 16px;background:#131316;border:1px solid rgba(255,255,255,.06);border-radius:6px">
      <p style="margin:0 0 4px;font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:1px;font-weight:600">Dashboard (Gerência)</p>
      <a href="${dashUrl}" style="color:#E11D48;font-size:13px;font-family:monospace;text-decoration:none">${dashUrl}</a>
    </div>
    <p style="margin:20px 0 0;color:#71717A;font-size:12px;line-height:1.5">Abra o link do Tablet no navegador do seu tablet e coloque no balcão. Boas vendas!</p>
  </td></tr>
  <tr><td style="padding:20px 32px;text-align:center">
    <p style="margin:0;color:#52525B;font-size:11px">&copy; ${new Date().getFullYear()} MinhaVez</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
    } else {
      return new Response(JSON.stringify({ error: 'Tipo de email desconhecido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'MinhaVez <onboarding@resend.dev>',
        to: [to],
        subject,
        html
      })
    })

    const result = await res.json()

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
