// /api/health — endpoint pra uptime monitors (Better Uptime, UptimeRobot, etc).
// Checa: API alive + Supabase REST reachable + (opcional) RPC responding.
// Retorna 200 com JSON detalhado, ou 503 se algo crítico falhar.

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || 'https://cnpnviaigrdmnixnqjqp.supabase.co';
const SUPABASE_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || '';
const TIMEOUT_MS   = 4000;

async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms)),
  ]);
}

export default async function handler() {
  const t0 = Date.now();
  const checks = {};
  let overall = 'ok';

  // Check 1: Supabase REST alcançável
  try {
    const r = await withTimeout(
      fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: SUPABASE_KEY ? { apikey: SUPABASE_KEY } : {},
      }),
      TIMEOUT_MS,
      'supabase'
    );
    checks.supabase = { status: r.ok || r.status === 404 ? 'ok' : 'degraded', http: r.status };
    if (!r.ok && r.status !== 404) overall = 'degraded';
  } catch (e) {
    checks.supabase = { status: 'error', error: e.message };
    overall = 'down';
  }

  // Check 2: RPC pública (get_landing_stats) — só se key disponível
  if (SUPABASE_KEY) {
    try {
      const r = await withTimeout(
        fetch(`${SUPABASE_URL}/rest/v1/rpc/get_landing_stats`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: '{}',
        }),
        TIMEOUT_MS,
        'rpc'
      );
      checks.rpc = { status: r.ok ? 'ok' : 'degraded', http: r.status };
      if (!r.ok) overall = overall === 'down' ? 'down' : 'degraded';
    } catch (e) {
      checks.rpc = { status: 'error', error: e.message };
      overall = overall === 'down' ? 'down' : 'degraded';
    }
  }

  const body = {
    status: overall,
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - t0,
    region: process.env.VERCEL_REGION || 'unknown',
    checks,
  };

  return new Response(JSON.stringify(body), {
    status: overall === 'down' ? 503 : 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
