import { describe, it, expect } from 'vitest';
import {
  VENDEDOR_PUBLIC_COLUMNS,
  fetchRuptureLog,
  fetchPauseLog,
  fetchVendedores,
  fetchTodosVendedores,
  fetchCanalStats,
  fetchDrillMotivo
} from '../js/dashboard-api.js';

// Mock encadeável do client Supabase. Registra cada chamada do builder pra
// assert e resolve numa sentinel pra confirmar o passthrough de {data,error}.
const SENTINEL = { data: ['ROW'], error: null };

function makeSb() {
  const calls = { from: null, select: null, eqs: [], gte: null, lt: null, order: null, limit: null, rpc: null };
  const builder = {
    select(cols) {
      calls.select = cols;
      return builder;
    },
    eq(col, val) {
      calls.eqs.push([col, val]);
      return builder;
    },
    gte(col, val) {
      calls.gte = [col, val];
      return builder;
    },
    lt(col, val) {
      calls.lt = [col, val];
      return builder;
    },
    order(col, opts) {
      calls.order = [col, opts];
      return builder;
    },
    limit(n) {
      calls.limit = n;
      return builder;
    },
    // Thenable: qualquer fim de cadeia (await) resolve na sentinel.
    then(resolve) {
      resolve(SENTINEL);
    }
  };
  const sb = {
    from(table) {
      calls.from = table;
      return builder;
    },
    rpc(name, params) {
      calls.rpc = [name, params];
      return Promise.resolve(SENTINEL);
    }
  };
  return { sb, calls };
}

const RANGE = { start: '2026-05-01', end: '2026-05-28' };

describe('dashboard-api — RPC wrappers', () => {
  it('fetchRuptureLog chama get_rupture_log com o range', async () => {
    const { sb, calls } = makeSb();
    const res = await fetchRuptureLog(sb, RANGE);
    expect(calls.rpc).toEqual(['get_rupture_log', { p_inicio: RANGE.start, p_fim: RANGE.end }]);
    expect(res).toBe(SENTINEL);
  });

  it('fetchPauseLog chama get_pause_log com o range', async () => {
    const { sb, calls } = makeSb();
    await fetchPauseLog(sb, RANGE);
    expect(calls.rpc).toEqual(['get_pause_log', { p_inicio: RANGE.start, p_fim: RANGE.end }]);
  });

  it('fetchCanalStats chama get_canal_stats com o range', async () => {
    const { sb, calls } = makeSb();
    await fetchCanalStats(sb, RANGE);
    expect(calls.rpc).toEqual(['get_canal_stats', { p_inicio: RANGE.start, p_fim: RANGE.end }]);
  });
});

describe('dashboard-api — fetchVendedores', () => {
  it('filtra ativos + tenant e ordena por nome', async () => {
    const { sb, calls } = makeSb();
    await fetchVendedores(sb, 'tenant-1');
    expect(calls.from).toBe('vendedores');
    expect(calls.select).toBe(VENDEDOR_PUBLIC_COLUMNS);
    expect(calls.eqs).toContainEqual(['ativo', true]);
    expect(calls.eqs).toContainEqual(['tenant_id', 'tenant-1']);
    expect(calls.order).toEqual(['nome', undefined]);
  });

  it('sem tenantId não adiciona filtro de tenant', async () => {
    const { sb, calls } = makeSb();
    await fetchVendedores(sb, null);
    expect(calls.eqs).toContainEqual(['ativo', true]);
    expect(calls.eqs.find((e) => e[0] === 'tenant_id')).toBeUndefined();
  });
});

describe('dashboard-api — fetchTodosVendedores', () => {
  it('NÃO filtra por ativo (inclui inativos) mas respeita tenant', async () => {
    const { sb, calls } = makeSb();
    await fetchTodosVendedores(sb, 'tenant-9');
    expect(calls.from).toBe('vendedores');
    expect(calls.eqs.find((e) => e[0] === 'ativo')).toBeUndefined();
    expect(calls.eqs).toContainEqual(['tenant_id', 'tenant-9']);
  });
});

describe('dashboard-api — fetchDrillMotivo', () => {
  it('filtra motivo + janela de datas, ordena desc e limita a 50', async () => {
    const { sb, calls } = makeSb();
    await fetchDrillMotivo(sb, RANGE, 'preco', 'tenant-7');
    expect(calls.from).toBe('atendimentos');
    expect(calls.eqs).toContainEqual(['motivo_perda', 'preco']);
    expect(calls.eqs).toContainEqual(['tenant_id', 'tenant-7']);
    expect(calls.gte).toEqual(['inicio', RANGE.start]);
    expect(calls.lt).toEqual(['inicio', RANGE.end]);
    expect(calls.order).toEqual(['inicio', { ascending: false }]);
    expect(calls.limit).toBe(50);
  });

  it('sem tenantId omite o filtro de tenant mas mantém o resto', async () => {
    const { sb, calls } = makeSb();
    await fetchDrillMotivo(sb, RANGE, 'ruptura', null);
    expect(calls.eqs).toContainEqual(['motivo_perda', 'ruptura']);
    expect(calls.eqs.find((e) => e[0] === 'tenant_id')).toBeUndefined();
    expect(calls.limit).toBe(50);
  });
});
