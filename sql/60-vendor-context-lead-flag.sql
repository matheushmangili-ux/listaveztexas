-- ─────────────────────────────────────────────────────────────────────────
-- 60-vendor-context-lead-flag.sql  (F0 · expõe a política de captura no contexto)
-- get_my_vendedor_context() passa a devolver tenants.exige_captura_lead, pro app
-- do vendedor decidir QUANDO forçar a folha de lead (sem um round-trip extra).
-- Muda o RETURNS TABLE → precisa DROP + CREATE (não dá CREATE OR REPLACE). Os
-- GRANTs (anon/authenticated/service_role) são recriados ao final.
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_my_vendedor_context();

CREATE FUNCTION public.get_my_vendedor_context()
  RETURNS TABLE(
    vendedor_id        uuid,
    tenant_id          uuid,
    tenant_slug        text,
    tenant_nome        text,
    tenant_plano       text,
    has_access         boolean,
    nome               text,
    apelido            text,
    foto_url           text,
    setor              text,
    status             text,
    posicao_fila       integer,
    turno_aberto_id    uuid,
    avatar_config      jsonb,
    exige_captura_lead boolean
  )
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
  SELECT
    v.id,
    v.tenant_id,
    t.slug,
    t.nome_loja,
    t.plano,
    public.tenant_has_vendor_mobile(v.tenant_id),
    v.nome,
    v.apelido,
    v.foto_url,
    v.setor,
    v.status::text,
    v.posicao_fila,
    (SELECT id FROM public.turnos
     WHERE tenant_id = v.tenant_id AND fechamento IS NULL
     ORDER BY abertura DESC LIMIT 1),
    v.avatar_config,
    COALESCE(t.exige_captura_lead, false)
  FROM public.vendedores v
  JOIN public.tenants t ON t.id = v.tenant_id
  WHERE v.auth_user_id = auth.uid()
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_vendedor_context() TO anon, authenticated, service_role;
