// ============================================
// MinhaVez — Dashboard API Layer
// All Supabase queries are centralized here.
// Each function returns { data, error } consistently.
// Pass `sb` (supabase client) and `tenantId` where needed.
// ============================================

/** Ranking de vendedores por período */
export async function fetchSellerRanking(sb, range) {
  return sb.rpc('get_seller_ranking', { p_inicio: range.start, p_fim: range.end });
}

/** Estatísticas de conversão (KPIs) */
export async function fetchConversionStats(sb, range) {
  return sb.rpc('get_conversion_stats', { p_inicio: range.start, p_fim: range.end });
}

/** Atendimentos de troca com valor para calcular taxa de conversão correta */
export async function fetchTrocas(sb, range) {
  return sb.from('atendimentos')
    .select('valor_venda')
    .eq('resultado', 'troca')
    .gte('inicio', range.start)
    .lt('inicio', range.end);
}

/** Atendimentos brutos para KPIs filtrados (setor ou vendedor específico) */
export async function fetchAtendimentosFiltrados(sb, range, { tenantId, vendedorId, setorIds } = {}) {
  let q = sb.from('atendimentos')
    .select('resultado, valor_venda, inicio, fim')
    .gte('inicio', range.start)
    .lt('inicio', range.end)
    .neq('resultado', 'em_andamento');
  if (tenantId) q = q.eq('tenant_id', tenantId);
  if (vendedorId) q = q.eq('vendedor_id', vendedorId);
  else if (setorIds?.length) q = q.in('vendedor_id', setorIds);
  return q;
}

/** Motivos de perda (donut) */
export async function fetchLossReasons(sb, range) {
  return sb.rpc('get_loss_reasons', { p_inicio: range.start, p_fim: range.end });
}

/** Fluxo por hora (bar chart) */
export async function fetchHourlyFlow(sb, range) {
  return sb.rpc('get_hourly_flow', { p_inicio: range.start, p_fim: range.end });
}

/** Atendimentos para cálculo de preferenciais por vendedor */
export async function fetchPreferenciais(sb, range, tenantId) {
  let q = sb.from('atendimentos')
    .select('vendedor_id, preferencial')
    .gte('inicio', range.start)
    .lt('inicio', range.end)
    .neq('resultado', 'em_andamento');
  if (tenantId) q = q.eq('tenant_id', tenantId);
  return q;
}

/** Log de rupturas de estoque */
export async function fetchRuptureLog(sb, range) {
  return sb.rpc('get_rupture_log', { p_inicio: range.start, p_fim: range.end });
}

/** Log de pausas */
export async function fetchPauseLog(sb, range) {
  return sb.rpc('get_pause_log', { p_inicio: range.start, p_fim: range.end });
}

/** Vendedores ativos (usado em floor, ranking, filtros) */
export async function fetchVendedores(sb, tenantId) {
  let q = sb.from('vendedores').select('*').eq('ativo', true);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  return q.order('nome');
}

/** Todos os vendedores incluindo inativos (gestão) */
export async function fetchTodosVendedores(sb, tenantId) {
  let q = sb.from('vendedores').select('*');
  if (tenantId) q = q.eq('tenant_id', tenantId);
  return q.order('nome');
}

/** Origem dos clientes (canal) */
export async function fetchCanalStats(sb, range) {
  return sb.rpc('get_canal_stats', { p_inicio: range.start, p_fim: range.end });
}

/** Atendimentos de um motivo de perda (drill-down) */
export async function fetchDrillMotivo(sb, range, motivo, tenantId) {
  let q = sb.from('atendimentos')
    .select('vendedor_nome, vendedor_apelido, criado_em, motivo_perda')
    .eq('motivo_perda', motivo)
    .gte('criado_em', range.start)
    .lte('criado_em', range.end)
    .order('criado_em', { ascending: false })
    .limit(50);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  return q;
}

/** Dados para export (ranking + motivos) */
export async function fetchExportData(sb, range) {
  const [ranking, motivos] = await Promise.allSettled([
    sb.rpc('get_seller_ranking', { p_inicio: range.start, p_fim: range.end }),
    sb.rpc('get_loss_reasons', { p_inicio: range.start, p_fim: range.end })
  ]);
  return {
    ranking: ranking.status === 'fulfilled' ? (ranking.value.data || []) : [],
    motivos: motivos.status === 'fulfilled' ? (motivos.value.data || []) : []
  };
}

/** Tendência diária (evolução de conversão e tempo) */
export async function fetchTrend(sb, range) {
  return sb.rpc('get_daily_trend', { p_inicio: range.start, p_fim: range.end });
}

/** Scatter: dados por vendedor para análise de volume × conversão */
export async function fetchScatterData(sb, range) {
  return sb.rpc('get_seller_ranking', { p_inicio: range.start, p_fim: range.end });
}

/** Salva ou atualiza um vendedor */
export async function upsertVendedor(sb, payload, id = null, tenantId = null) {
  if (id) {
    let q = sb.from('vendedores').update(payload).eq('id', id);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    return q;
  }
  return sb.from('vendedores').insert(payload);
}

/** Alterna status ativo/inativo de um vendedor */
export async function toggleVendedorAtivo(sb, id, ativo, tenantId = null) {
  let q = sb.from('vendedores').update({ ativo }).eq('id', id);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  return q;
}

/** Upload de foto do vendedor */
export async function uploadFotoVendedor(sb, path, file) {
  return sb.storage.from('vendedor-fotos').upload(path, file, { upsert: true });
}
