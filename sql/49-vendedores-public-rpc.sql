-- sql/49-vendedores-public-rpc.sql
-- Safe vendor list for browser clients after locking down direct table reads.

CREATE OR REPLACE FUNCTION public.get_vendedores_public(p_include_inactive BOOLEAN DEFAULT false)
RETURNS TABLE(
  id UUID,
  nome TEXT,
  apelido TEXT,
  status TEXT,
  posicao_fila INT,
  ativo BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  tenant_id UUID,
  setor TEXT,
  foto_url TEXT,
  auth_user_id UUID,
  avatar_config JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id,
    v.nome,
    v.apelido,
    v.status::TEXT,
    v.posicao_fila,
    v.ativo,
    v.created_at,
    v.updated_at,
    v.tenant_id,
    v.setor,
    v.foto_url,
    v.auth_user_id,
    v.avatar_config
  FROM public.vendedores v
  WHERE v.tenant_id = public.get_my_tenant_id()
    AND (p_include_inactive OR v.ativo = true)
  ORDER BY v.nome;
$$;

REVOKE ALL ON FUNCTION public.get_vendedores_public(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vendedores_public(BOOLEAN) TO authenticated;
