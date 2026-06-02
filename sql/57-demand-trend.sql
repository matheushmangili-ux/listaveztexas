-- ─────────────────────────────────────────────────────────────────────────
-- 57-demand-trend.sql  (P1-2 · tendência no relatório de demanda)
-- get_demand_report retorna `recentes` = pedidos do produto na 2ª metade do
-- período. O card marca "↑ subindo" quando a maioria é recente (momentum de
-- demanda → sinal de compra: "Bota Ariat pedida 6×, subindo").
--
-- + coluna no retorno → DROP antes do CREATE. Caller compatível (campo extra).
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_demand_report(TIMESTAMPTZ, TIMESTAMPTZ, motivo_perda, INT);

CREATE OR REPLACE FUNCTION public.get_demand_report(
    p_inicio TIMESTAMPTZ,
    p_fim    TIMESTAMPTZ,
    p_motivo motivo_perda DEFAULT NULL,
    p_limit  INT DEFAULT 20
) RETURNS TABLE (produto TEXT, motivo motivo_perda, total BIGINT, valor_estimado NUMERIC, recentes BIGINT)
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
  ),
  mid AS (SELECT p_inicio + (p_fim - p_inicio) / 2 AS m)
  SELECT
    btrim(COALESCE(NULLIF(btrim(a.produto_desejado), ''), a.produto_ruptura)) AS produto,
    a.motivo_perda AS motivo,
    COUNT(*) AS total,
    ROUND(COUNT(*) * (SELECT ticket FROM tkt), 2) AS valor_estimado,
    COUNT(*) FILTER (WHERE a.inicio >= (SELECT m FROM mid)) AS recentes
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
