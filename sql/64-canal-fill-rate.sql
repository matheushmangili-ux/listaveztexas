-- ─────────────────────────────────────────────────────────────────────────
-- 64-canal-fill-rate.sql  (métrica: % de atendimentos com canal informado)
-- Munição objetiva pro teste "vendor-only": com o tablet fora, o canal passa a
-- ser auto-reportado pelo vendedor — esse KPI mede se o dado se mantém. Conta
-- TODOS os atendimentos do período (denominador) vs. os que têm canal (numerador).
-- get_canal_stats só traz quem tem canal, então precisa de fonte própria.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_canal_fill_rate(p_inicio timestamptz, p_fim timestamptz)
RETURNS TABLE(total bigint, com_canal bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT
    count(*)::bigint AS total,
    count(*) FILTER (WHERE canal_origem_id IS NOT NULL)::bigint AS com_canal
  FROM public.atendimentos
  WHERE tenant_id = public.get_my_tenant_id()
    AND inicio >= p_inicio
    AND inicio <= p_fim;
$function$;

GRANT EXECUTE ON FUNCTION public.get_canal_fill_rate(timestamptz, timestamptz) TO authenticated;
