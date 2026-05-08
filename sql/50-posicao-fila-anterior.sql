-- sql/50-posicao-fila-anterior.sql
-- Persiste a posição original do vendedor ao entrar em pausa.
--
-- Histórico do bug: ao voltar de pausa "operacional" (e qualquer outra que
-- preserva fila), vendedor caía no fim em vez de voltar à posição original.
-- Causa-raiz: posição original ficava num Map em memória do tablet
-- (state.savedPositions) — perdida em reload, kiosk reinicia ou retorno via
-- vendor mobile. Solução: gravar no banco na transição pra pausa, ler na volta.
--
-- A coluna é nullable (vendedor que nunca foi pra pausa não tem posição
-- anterior). É limpa ao voltar pra fila pra evitar reuso de valor stale.

ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS posicao_fila_anterior INT;

-- Atualiza get_vendedores_public pra expor a nova coluna ao client.
-- Mantém assinatura compatível com 49-vendedores-public-rpc.sql; só adiciona
-- o campo no final.
DROP FUNCTION IF EXISTS public.get_vendedores_public(BOOLEAN);

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
  avatar_config JSONB,
  posicao_fila_anterior INT
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
    v.avatar_config,
    v.posicao_fila_anterior
  FROM public.vendedores v
  WHERE v.tenant_id = public.get_my_tenant_id()
    AND (p_include_inactive OR v.ativo = true)
  ORDER BY v.nome;
$$;

REVOKE ALL ON FUNCTION public.get_vendedores_public(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vendedores_public(BOOLEAN) TO authenticated;
