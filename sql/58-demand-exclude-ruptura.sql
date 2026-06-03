-- ─────────────────────────────────────────────────────────────────────────
-- 58-demand-exclude-ruptura.sql  (P1-5 · unificar / separar histórias)
-- O card "Demanda Perdida" e o card "Rupturas" se sobrepunham: ruptura aparecia
-- nos dois (o report fazia COALESCE de produto_ruptura). Decisão: separar.
--   - Rupturas (get_rupture_log)  → o que repor no estoque.
--   - Demanda Perdida (este)      → o que o cliente queria e perdemos por motivos
--     que NÃO são falta de estoque (preço/indecisão/só_olhando/outro + sem motivo).
-- Fix: excluir motivo_perda = 'ruptura'. `IS DISTINCT FROM` mantém os de motivo
-- NULL (não-conversões do app do vendedor, que não capturam motivo).
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
    AND a.motivo_perda IS DISTINCT FROM 'ruptura'::motivo_perda
    AND a.inicio >= p_inicio
    AND a.inicio < p_fim
    AND COALESCE(NULLIF(btrim(a.produto_desejado), ''), NULLIF(btrim(a.produto_ruptura), '')) IS NOT NULL
    AND (p_motivo IS NULL OR a.motivo_perda = p_motivo)
  GROUP BY 1, 2
  ORDER BY total DESC, produto ASC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_demand_report(TIMESTAMPTZ, TIMESTAMPTZ, motivo_perda, INT) TO authenticated;
