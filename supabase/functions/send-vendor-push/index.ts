// minhavez Vendedor — Edge Function: send-vendor-push
// Disparada por trigger Postgres (pg_net) quando vendedores.posicao_fila vira 1.
// Envia Web Push notificação pro(s) device(s) do vendedor.
//
// Input payload (webhook format compatível com Supabase Database Webhooks):
//   { type: 'UPDATE', table: 'vendedores', record: {...}, old_record: {...}, schema: 'public' }
//
// Trata: sem subscription → no-op; 410/404 → deleta subscription stale.
// verify_jwt=false: disparador é o Postgres interno, não tem JWT.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// Cache lazy de vapid keys + application server (uma instância por cold start)
let _appServer: webpush.ApplicationServer | null = null;

async function getAppServer(): Promise<webpush.ApplicationServer> {
  if (_appServer) return _appServer;

  const { data, error } = await sb
    .from('app_secrets')
    .select('key, value')
    .in('key', ['vapid_public_key', 'vapid_private_key', 'vapid_subject']);

  if (error || !data) throw new Error('Failed to load VAPID keys: ' + (error?.message || 'no data'));

  const map: Record<string, string> = {};
  for (const row of data) map[row.key] = row.value;

  const pubRaw = map['vapid_public_key'];
  const privRaw = map['vapid_private_key'];
  const subject = map['vapid_subject'] || 'mailto:admin@minhavez.app';

  if (!pubRaw || !privRaw) throw new Error('VAPID keys missing in app_secrets');

  // Converte raw base64url → JWK que a lib aceita
  const pubBytes = decodeB64Url(pubRaw); // 65 bytes: 0x04 + X(32) + Y(32)
  const x = encodeB64Url(pubBytes.slice(1, 33));
  const y = encodeB64Url(pubBytes.slice(33, 65));

  const vapidKeys = await webpush.importVapidKeys({
    publicKey: { kty: 'EC', crv: 'P-256', x, y },
    privateKey: { kty: 'EC', crv: 'P-256', x, y, d: privRaw }
  });

  _appServer = await webpush.ApplicationServer.new({
    contactInformation: subject,
    vapidKeys
  });
  return _appServer;
}

function decodeB64Url(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json();
    const type = body?.type;
    const record = body?.record;
    const oldRecord = body?.old_record;

    // Só age em UPDATE que fez posicao_fila virar 1 (de qualquer outro valor)
    if (type !== 'UPDATE' || !record) {
      return new Response(JSON.stringify({ skipped: 'not an update' }), { status: 200 });
    }
    if (record.posicao_fila !== 1) {
      return new Response(JSON.stringify({ skipped: 'not pos 1' }), { status: 200 });
    }
    if (oldRecord && oldRecord.posicao_fila === 1) {
      return new Response(JSON.stringify({ skipped: 'already pos 1' }), { status: 200 });
    }

    const vendedorId = record.id;
    const tenantId = record.tenant_id;
    if (!vendedorId || !tenantId) {
      return new Response(JSON.stringify({ error: 'missing ids' }), { status: 400 });
    }

    // Confere se o tenant tem o módulo ligado
    const { data: tenant } = await sb
      .from('tenants')
      .select('plano, vendor_mobile_enabled, status, nome_loja')
      .eq('id', tenantId)
      .maybeSingle();

    if (!tenant || tenant.plano !== 'elite' || !tenant.vendor_mobile_enabled || tenant.status !== 'active') {
      return new Response(JSON.stringify({ skipped: 'tenant not entitled' }), { status: 200 });
    }

    // Busca subscriptions do vendedor
    const { data: subs } = await sb
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('vendedor_id', vendedorId);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ skipped: 'no subscriptions' }), { status: 200 });
    }

    const appServer = await getAppServer();
    const payload = new TextEncoder().encode(JSON.stringify({
      title: 'Sua vez! 🎯',
      body: 'Você é o próximo da fila em ' + (tenant.nome_loja || 'sua loja'),
      tag: 'next-in-line',
      url: '/vendor.html',
      vendedor_id: vendedorId
    }));

    const results = await Promise.allSettled(subs.map(async (s) => {
      const subscriber = appServer.subscribe({
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth_key }
      } as webpush.PushSubscription);

      try {
        await subscriber.pushMessage(payload.buffer, {
          urgency: webpush.Urgency.High,
          ttl: 60 // 60s — se vendedor não receber rápido, perdeu a vez de qq jeito
        });
        return { id: s.id, ok: true };
      } catch (err: any) {
        const msg = String(err?.message || err);
        // 410 Gone / 404 = subscription morreu, limpa
        if (msg.includes('410') || msg.includes('404')) {
          await sb.from('push_subscriptions').delete().eq('id', s.id);
          return { id: s.id, ok: false, reason: 'stale-deleted' };
        }
        return { id: s.id, ok: false, reason: msg };
      }
    }));

    const summary = results.map((r) => r.status === 'fulfilled' ? r.value : { error: String(r.reason) });
    return new Response(JSON.stringify({ sent: summary.length, results: summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('send-vendor-push error:', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
