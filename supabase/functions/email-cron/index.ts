// email-cron Edge Function
// Roda 1x/dia (via pg_cron). Manda emails do drip:
//   - setup-tips: tenants com setup_tips_sent_at NULL e created_at <= now() - 1 day
//   - first-week: tenants com first_week_sent_at NULL e created_at <= now() - 7 days
//
// Auth: Bearer token deve match CRON_SECRET (env var no Supabase Functions).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const CRON_SECRET   = Deno.env.get('CRON_SECRET') || ''
const BASE_URL      = Deno.env.get('BASE_URL') || 'https://listaveztexas.vercel.app'

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

function emailShell(title: string, body: string, ctaLabel: string, ctaUrl: string, footer?: string) {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:'Inter',system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 20px">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#18181B;border-radius:12px;border:1px solid rgba(255,255,255,.06)">
      <tr><td style="padding:40px 32px 8px;text-align:center">
        <h1 style="margin:0;font-size:22px;font-weight:800;color:#aaeec4;letter-spacing:-0.02em">minhavez</h1>
      </td></tr>
      <tr><td style="padding:24px 32px">
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#fafafa;line-height:1.3">${title}</h2>
        <div style="color:#a1a1aa;font-size:15px;line-height:1.6">${body}</div>
        <div style="margin-top:28px;text-align:center">
          <a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;background:#aaeec4;color:#0d0d0d;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px">${ctaLabel}</a>
        </div>
        ${footer ? `<p style="margin:32px 0 0;font-size:12px;color:#71717a;text-align:center">${footer}</p>` : ''}
      </td></tr>
      <tr><td style="padding:24px 32px;border-top:1px solid rgba(255,255,255,.06);text-align:center">
        <p style="margin:0;font-size:11px;color:#52525b">Você está recebendo isso porque criou uma conta no minhavez. <a href="${BASE_URL}/landing#unsubscribe" style="color:#71717a">Cancelar</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

const TEMPLATES = {
  'setup-tips': (slug: string) => ({
    subject: '3 dicas pra seu primeiro dia no minhavez',
    html: emailShell(
      'Seu tablet vai dominar o balcão',
      `<p style="margin:0 0 16px">Você passou ontem pelo setup. Aqui vão 3 coisas que separam quem usa de quem aproveita:</p>
       <ol style="margin:0 0 20px;padding-left:20px">
         <li style="margin-bottom:12px"><strong style="color:#fafafa">Coloca o tablet num suporte fixo</strong> — vendedor não pode tirar a mão do cliente pra ir buscar tablet. Suporte de R$30 resolve.</li>
         <li style="margin-bottom:12px"><strong style="color:#fafafa">Define o setor inicial logo no começo do turno</strong> — isso garante que o rodízio comece certo. Aba Setor no canto superior.</li>
         <li style="margin-bottom:12px"><strong style="color:#fafafa">Use o motivo de pausa real (não "outro")</strong> — depois você vai querer saber quanto tempo gasta em almoço vs operacional. Os dados ficam no dashboard.</li>
       </ol>`,
      'Abrir tablet',
      `${BASE_URL}/${slug}/tablet`,
      'Dúvida? Responde esse email — eu (Matheus) leio tudo.'
    ),
  }),
  'first-week': (slug: string) => ({
    subject: 'Sua primeira semana — vamos olhar os números?',
    html: emailShell(
      'Uma semana de dados. O que aprender deles.',
      `<p style="margin:0 0 16px">Hoje você completa 7 dias usando o minhavez. Já deu pra ter alguma leitura inicial:</p>
       <ul style="margin:0 0 20px;padding-left:20px">
         <li style="margin-bottom:10px">Quem é o vendedor com maior <strong style="color:#fafafa">conversão</strong> da semana?</li>
         <li style="margin-bottom:10px">Em qual <strong style="color:#fafafa">horário</strong> você está mais lotado?</li>
         <li style="margin-bottom:10px">Qual <strong style="color:#fafafa">motivo de perda</strong> mais aparece (preço, ruptura, indecisão)?</li>
       </ul>
       <p style="margin:0 0 16px">Tudo isso está no dashboard. Quer um call rápido (15min) pra eu te ajudar a interpretar? <strong style="color:#aaeec4">Responde esse email com 2-3 horários</strong> que combinamos.</p>`,
      'Ver dashboard',
      `${BASE_URL}/${slug}/dashboard`
    ),
  }),
}

async function send(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'minhavez <hello@minhavez.com.br>',
      to: [to],
      subject,
      html,
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Resend ${res.status}: ${t}`)
  }
}

Deno.serve(async (req) => {
  // Auth: Bearer == CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const summary = { setup_tips: 0, first_week: 0, errors: [] as string[] }

  // setup-tips: D+1
  const { data: tipsTargets } = await sb
    .from('tenants')
    .select('id, slug, owner_email, created_at')
    .is('setup_tips_sent_at', null)
    .lte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .not('owner_email', 'is', null)
    .limit(50)

  for (const t of tipsTargets || []) {
    try {
      const tpl = TEMPLATES['setup-tips'](t.slug)
      await send(t.owner_email!, tpl.subject, tpl.html)
      await sb.from('tenants').update({ setup_tips_sent_at: new Date().toISOString() }).eq('id', t.id)
      summary.setup_tips++
    } catch (e) {
      summary.errors.push(`tips/${t.slug}: ${(e as Error).message}`)
    }
  }

  // first-week: D+7
  const { data: weekTargets } = await sb
    .from('tenants')
    .select('id, slug, owner_email, created_at')
    .is('first_week_sent_at', null)
    .lte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .not('owner_email', 'is', null)
    .limit(50)

  for (const t of weekTargets || []) {
    try {
      const tpl = TEMPLATES['first-week'](t.slug)
      await send(t.owner_email!, tpl.subject, tpl.html)
      await sb.from('tenants').update({ first_week_sent_at: new Date().toISOString() }).eq('id', t.id)
      summary.first_week++
    } catch (e) {
      summary.errors.push(`week/${t.slug}: ${(e as Error).message}`)
    }
  }

  return new Response(JSON.stringify(summary), {
    headers: { 'Content-Type': 'application/json' },
  })
})
