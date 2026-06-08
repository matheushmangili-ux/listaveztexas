-- ─────────────────────────────────────────────────────────────────────────
-- 61-lost-leads-report.sql  (F1 · recuperação de leads — lado do lojista)
-- get_lost_leads: lista as não-conversões com contato autorizado (capturadas
-- na F0), pro card "Leads Perdidos" do dashboard. Mesma segurança da
-- get_demand_report (SECURITY DEFINER + get_my_tenant_id()). Casa com o índice
-- parcial idx_atend_leads.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_lost_leads(
  p_inicio timestamptz,
  p_fim    timestamptz,
  p_limit  integer DEFAULT 50
)
RETURNS TABLE(
  atend_id         uuid,
  cliente_nome     text,
  cliente_telefone text,
  produto          text,
  motivo           motivo_perda,
  vendedor         text,
  quando           timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    a.id,
    a.cliente_nome,
    a.cliente_telefone,
    NULLIF(btrim(COALESCE(NULLIF(btrim(a.produto_desejado), ''), a.produto_ruptura)), '') AS produto,
    a.motivo_perda,
    COALESCE(NULLIF(btrim(v.apelido), ''), v.nome) AS vendedor,
    a.inicio
  FROM public.atendimentos a
  LEFT JOIN public.vendedores v ON v.id = a.vendedor_id
  WHERE a.tenant_id = public.get_my_tenant_id()
    AND a.resultado = 'nao_convertido'
    AND a.contato_autorizado = true
    AND NULLIF(btrim(a.cliente_telefone), '') IS NOT NULL
    AND a.inicio >= p_inicio
    AND a.inicio <  p_fim
  ORDER BY a.inicio DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$function$;

GRANT EXECUTE ON FUNCTION public.get_lost_leads(timestamptz, timestamptz, integer) TO authenticated;
