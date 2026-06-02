-- ─────────────────────────────────────────────────────────────────────────
-- 54-demand-suggestions.sql  (Demanda Perdida · P0-1 autocomplete)
-- Sugestões de produto pra autocomplete no tablet + vendor: produtos distintos
-- já digitados (produto_desejado/produto_ruptura) nas não-conversões, por
-- frequência. Vira a "memória" da loja → entradas consistentes (menos duplicata).
-- Tenant resolvido por get_my_tenant_id() (recepção) ou pelo vínculo do vendedor.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_demand_suggestions(p_limit INT DEFAULT 50)
RETURNS TABLE(produto TEXT, freq BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  v_tenant := public.get_my_tenant_id();
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.vendedores WHERE auth_user_id = auth.uid() LIMIT 1;
  END IF;
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT s.p AS produto, count(*) AS freq
    FROM (
      SELECT btrim(regexp_replace(
               COALESCE(NULLIF(btrim(a.produto_desejado), ''), a.produto_ruptura), '\s+', ' ', 'g'
             )) AS p
      FROM public.atendimentos a
      WHERE a.tenant_id = v_tenant
        AND a.resultado = 'nao_convertido'
        AND a.inicio >= now() - interval '180 days'
        AND COALESCE(NULLIF(btrim(a.produto_desejado), ''), NULLIF(btrim(a.produto_ruptura), '')) IS NOT NULL
    ) s
    WHERE s.p IS NOT NULL AND length(s.p) >= 2
    GROUP BY s.p
    ORDER BY count(*) DESC, s.p ASC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_demand_suggestions(INT) TO authenticated;
