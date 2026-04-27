// ============================================
// MinhaVez — Dashboard API Layer
// Supabase queries centralizadas.
// Cada função retorna { data, error } consistentemente.
// ============================================

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
  const res = await sb.rpc('get_vendedores_public', { p_include_inactive: false });
  if (res.error || !tenantId) return res;
  return { ...res, data: (res.data || []).filter((v) => v.tenant_id === tenantId) };
}

/** Todos os vendedores incluindo inativos (gestão) */
export async function fetchTodosVendedores(sb, tenantId) {
  const res = await sb.rpc('get_vendedores_public', { p_include_inactive: true });
  if (res.error || !tenantId) return res;
  return { ...res, data: (res.data || []).filter((v) => v.tenant_id === tenantId) };
}

/** Origem dos clientes (canal) */
export async function fetchCanalStats(sb, range) {
  return sb.rpc('get_canal_stats', { p_inicio: range.start, p_fim: range.end });
}

/** Atendimentos de um motivo de perda (drill-down) */
export async function fetchDrillMotivo(sb, range, motivo, tenantId) {
  let q = sb
    .from('atendimentos')
    .select('vendedor_id, inicio, motivo_perda, vendedores(nome, apelido)')
    .eq('motivo_perda', motivo)
    .gte('inicio', range.start)
    .lt('inicio', range.end)
    .order('inicio', { ascending: false })
    .limit(50);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  return q;
}
