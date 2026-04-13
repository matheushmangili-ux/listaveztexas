-- ============================================
-- minhavez — RPC pública pro bloco "Texas Center hoje" da landing
-- Retorna agregados anônimos. SECURITY DEFINER pra ler dados de tenants
-- sem expor row-level. Cache de 5min via materialized view (opcional).
-- ============================================

CREATE OR REPLACE FUNCTION public.get_landing_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_atendimentos_mes INT;
  v_vendedores_ativos INT;
  v_tempo_medio_min  NUMERIC;
  v_lojas_count      INT;
BEGIN
  -- Total de atendimentos finalizados nos últimos 30 dias (todos tenants agregados)
  SELECT COUNT(*)::int INTO v_atendimentos_mes
  FROM public.atendimentos
  WHERE finalizado_em >= now() - interval '30 days'
    AND finalizado_em IS NOT NULL;

  -- Vendedores que atenderam algo no mês (proxy de "ativos")
  SELECT COUNT(DISTINCT vendedor_id)::int INTO v_vendedores_ativos
  FROM public.atendimentos
  WHERE finalizado_em >= now() - interval '30 days';

  -- Tempo médio em minutos
  SELECT ROUND(
    AVG(EXTRACT(EPOCH FROM (finalizado_em - inicio_em)) / 60)::numeric,
    1
  ) INTO v_tempo_medio_min
  FROM public.atendimentos
  WHERE finalizado_em >= now() - interval '30 days'
    AND inicio_em IS NOT NULL
    AND finalizado_em IS NOT NULL
    AND finalizado_em > inicio_em;

  -- Lojas distintas usando o sistema (proxy: tenants com pelo menos 1 atendimento no mês)
  SELECT COUNT(DISTINCT tenant_id)::int INTO v_lojas_count
  FROM public.atendimentos
  WHERE finalizado_em >= now() - interval '30 days';

  RETURN jsonb_build_object(
    'atendimentos_mes', COALESCE(v_atendimentos_mes, 0),
    'vendedores_ativos', COALESCE(v_vendedores_ativos, 0),
    'tempo_medio_min', COALESCE(v_tempo_medio_min, 0),
    'lojas_count', GREATEST(COALESCE(v_lojas_count, 0), 1),  -- minimum 1 (Texas Center)
    'updated_at', extract(epoch from now())::int
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_landing_stats() TO anon, authenticated;

COMMENT ON FUNCTION public.get_landing_stats() IS
  'Retorna agregados anônimos (sem identificar tenants) pra bloco social proof da landing. Pode ser chamada por anon.';
