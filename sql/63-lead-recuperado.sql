-- ─────────────────────────────────────────────────────────────────────────
-- 63-lead-recuperado.sql  (F2-A · fecha o loop de recuperação de leads)
-- Lojista/vendedor marca um lead como "recuperado" depois de chamar o cliente.
-- get_lost_leads (dashboard) passa a trazer o flag (pendentes primeiro, mostra
-- recuperados pra virar métrica); get_my_lost_leads (vendedor) some os já
-- recuperados (lista vira to-do focado). mark via get_my_tenant_id (resolve pros
-- dois tipos de usuário).
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Colunas de recuperação
ALTER TABLE public.atendimentos ADD COLUMN IF NOT EXISTS lead_recuperado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.atendimentos ADD COLUMN IF NOT EXISTS lead_recuperado_em TIMESTAMPTZ;

-- 2) Marcar/desmarcar (lojista ou vendedor; tenant via get_my_tenant_id)
CREATE OR REPLACE FUNCTION public.mark_lead_recuperado(p_atend_id uuid, p_recuperado boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.get_my_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sem acesso'; END IF;
  UPDATE public.atendimentos
     SET lead_recuperado    = COALESCE(p_recuperado, true),
         lead_recuperado_em = CASE WHEN COALESCE(p_recuperado, true) THEN now() ELSE NULL END
   WHERE id = p_atend_id
     AND tenant_id = v_tenant
     AND resultado = 'nao_convertido'
     AND contato_autorizado = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead nao encontrado'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_lead_recuperado(uuid, boolean) TO authenticated;

-- 3) get_lost_leads (dashboard): + coluna recuperado, pendentes primeiro,
--    inclui recuperados (pra contar "X recuperados"). DROP+CREATE: muda RETURNS.
DROP FUNCTION IF EXISTS public.get_lost_leads(timestamptz, timestamptz, integer);
CREATE FUNCTION public.get_lost_leads(p_inicio timestamptz, p_fim timestamptz, p_limit integer DEFAULT 50)
RETURNS TABLE(
  atend_id         uuid,
  cliente_nome     text,
  cliente_telefone text,
  produto          text,
  motivo           motivo_perda,
  vendedor         text,
  quando           timestamptz,
  recuperado       boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT
    a.id,
    a.cliente_nome,
    a.cliente_telefone,
    NULLIF(btrim(COALESCE(NULLIF(btrim(a.produto_desejado), ''), a.produto_ruptura)), '') AS produto,
    a.motivo_perda,
    COALESCE(NULLIF(btrim(v.apelido), ''), v.nome) AS vendedor,
    a.inicio,
    a.lead_recuperado
  FROM public.atendimentos a
  LEFT JOIN public.vendedores v ON v.id = a.vendedor_id
  WHERE a.tenant_id = public.get_my_tenant_id()
    AND a.resultado = 'nao_convertido'
    AND a.contato_autorizado = true
    AND NULLIF(btrim(a.cliente_telefone), '') IS NOT NULL
    AND a.inicio >= p_inicio
    AND a.inicio <  p_fim
  ORDER BY a.lead_recuperado ASC, a.inicio DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$function$;
GRANT EXECUTE ON FUNCTION public.get_lost_leads(timestamptz, timestamptz, integer) TO authenticated;

-- 4) get_my_lost_leads (vendedor): só pendentes (some o que já recuperou)
CREATE OR REPLACE FUNCTION public.get_my_lost_leads(p_limit integer DEFAULT 30)
RETURNS TABLE(
  atend_id         uuid,
  cliente_nome     text,
  cliente_telefone text,
  produto          text,
  motivo           motivo_perda,
  quando           timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
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
    AND a.lead_recuperado = false
    AND NULLIF(btrim(a.cliente_telefone), '') IS NOT NULL
  ORDER BY a.inicio DESC
  LIMIT GREATEST(COALESCE(p_limit, 30), 1);
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_lost_leads(integer) TO authenticated;
