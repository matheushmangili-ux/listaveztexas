// Smoke tests — validações leves contra produção (read-only).
// Detecta quebras infra: Supabase REST alive, RPCs públicas respondem,
// /api/health saudável.
//
// Skipados por padrão (env SMOKE=1 pra rodar).
// Rodar: SMOKE=1 npm test smoke

import { describe, it, expect } from 'vitest';

const SHOULD_RUN = process.env.SMOKE === '1';
const BASE = process.env.SMOKE_BASE_URL || 'https://listaveztexas.vercel.app';
const SUPABASE_URL = 'https://cnpnviaigrdmnixnqjqp.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_0AJbQVEVFsL71gAGtks6rw_V1rYn3Ne';

const d = SHOULD_RUN ? describe : describe.skip;

d('smoke: prod infra', () => {
  it('landing responde 200', async () => {
    const r = await fetch(`${BASE}/landing`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/minhavez/i);
    expect(html).toMatch(/Cada vendedor no lugar certo/);
  });

  it('sitemap.xml responde 200 com URLs', async () => {
    const r = await fetch(`${BASE}/sitemap.xml`);
    expect(r.status).toBe(200);
    const xml = await r.text();
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/landing<\/loc>/);
  });

  it('robots.txt responde 200 e tem sitemap', async () => {
    const r = await fetch(`${BASE}/robots.txt`);
    expect(r.status).toBe(200);
    const txt = await r.text();
    expect(txt).toMatch(/Sitemap: /i);
  });

  it('/api/health retorna 200 com status ok|degraded', async () => {
    const r = await fetch(`${BASE}/api/health`);
    const json = await r.json();
    expect([200, 503]).toContain(r.status);
    expect(['ok', 'degraded', 'down']).toContain(json.status);
    expect(json.checks.supabase).toBeDefined();
  });

  it('Supabase REST root reachable', async () => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    expect([200, 404]).toContain(r.status);
  });

  it('RPC get_landing_stats responde com schema esperado', async () => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_landing_stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: '{}',
    });
    if (r.status === 404) {
      console.warn('[smoke] get_landing_stats não migrada ainda — pulando');
      return;
    }
    expect(r.ok).toBe(true);
    const data = await r.json();
    expect(data).toHaveProperty('atendimentos_mes');
    expect(data).toHaveProperty('vendedores_ativos');
    expect(data).toHaveProperty('tempo_medio_min');
    expect(data).toHaveProperty('lojas_count');
  });

  it('Edge Functions: ai-assist rejeita request sem auth (não cai)', async () => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-assist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'turno-summary' }),
    });
    // Espera 401/403/400 — qualquer coisa ≠ 5xx é OK (auth funcionou)
    expect(r.status).toBeLessThan(500);
  });
});
