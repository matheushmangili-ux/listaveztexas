-- ─────────────────────────────────────────────────────────────────────────
-- 62-vendor-my-lost-leads.sql  (F1 · recuperação de leads — lado do vendedor)
-- get_my_lost_leads: os leads que ESTE vendedor capturou (nao_convertido +
-- contato_autorizado), pra ele mesmo recuperar pelo app. Resolve o vendedor por
-- auth.uid() (igual get_my_vendedor_context). SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_lost_leads(p_limit integer DEFAULT 30)
RETURNS TABLE(
  atend_id         uuid,
  cliente_nome     text,
  cliente_telefone text,
  produto          text,
  motivo           motivo_perda,
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
    a.inicio
  FROM public.atendimentos a
  JOIN public.vendedores v ON v.id = a.vendedor_id
  WHERE v.auth_user_id = auth.uid()
    AND a.resultado = 'nao_convertido'
    AND a.contato_autorizado = true
    AND NULLIF(btrim(a.cliente_telefone), '') IS NOT NULL
  ORDER BY a.inicio DESC
  LIMIT GREATEST(COALESCE(p_limit, 30), 1);
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_lost_leads(integer) TO authenticated;
