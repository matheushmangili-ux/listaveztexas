-- ─────────────────────────────────────────────────────────────────────────
-- 54-demand-value.sql  (P1-1 · valor perdido no relatório de demanda)
-- get_demand_report passa a retornar valor_estimado = ticket MEDIANO do tenant
-- (vendas dos últimos 180d) × quantidade de pedidos do produto. Dá escala em R$
-- pro lojista ("perdeu ~R$ 4.2k em Bota Ariat") sem precisar de preço por item.
--
-- IMPORTANTE: mediana (percentile_cont 0.5), NÃO média — a média é destruída por
-- outliers de digitação (visto em prod: média R$3.926 vs mediana R$800, com um
-- valor_venda de R$142.960 puxando tudo). Mediana é robusta.
--
-- Mudança de assinatura de retorno (+ coluna) → precisa DROP antes do CREATE.
-- O caller (dashboard-charts.loadDemandReport) é compatível (campo extra).
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_demand_report(TIMESTAMPTZ, TIMESTAMPTZ, motivo_perda, INT);

CREATE OR REPLACE FUNCTION public.get_demand_report(
    p_inicio TIMESTAMPTZ,
    p_fim    TIMESTAMPTZ,
    p_motivo motivo_perda DEFAULT NULL,
    p_limit  INT DEFAULT 20
) RETURNS TABLE (produto TEXT, motivo motivo_perda, total BIGINT, valor_estimado NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH tkt AS (
    SELECT COALESCE(
             (percentile_cont(0.5) WITHIN GROUP (ORDER BY valor_venda) FILTER (WHERE valor_venda > 0))::numeric,
             0) AS ticket
    FROM public.atendimentos
    WHERE tenant_id = public.get_my_tenant_id()
      AND resultado = 'venda'
      AND inicio >= (now() - interval '180 days')
  )
  SELECT
    btrim(COALESCE(NULLIF(btrim(a.produto_desejado), ''), a.produto_ruptura)) AS produto,
    a.motivo_perda AS motivo,
    COUNT(*) AS total,
    ROUND(COUNT(*) * (SELECT ticket FROM tkt), 2) AS valor_estimado
  FROM public.atendimentos a
  WHERE a.tenant_id = public.get_my_tenant_id()
    AND a.resultado = 'nao_convertido'
    AND a.inicio >= p_inicio
    AND a.inicio < p_fim
    AND COALESCE(NULLIF(btrim(a.produto_desejado), ''), NULLIF(btrim(a.produto_ruptura), '')) IS NOT NULL
    AND (p_motivo IS NULL OR a.motivo_perda = p_motivo)
  GROUP BY 1, 2
  ORDER BY total DESC, produto ASC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_demand_report(TIMESTAMPTZ, TIMESTAMPTZ, motivo_perda, INT) TO authenticated;
