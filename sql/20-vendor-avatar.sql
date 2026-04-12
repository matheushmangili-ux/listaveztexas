-- ============================================
-- minhavez — Fase 5: Avatar RPG com Cosméticos
--
-- avatar_config JSONB no vendedores
-- vendor_save_avatar RPC
-- DROP + CREATE get_my_vendedor_context (adiciona avatar_config)
--
-- APLICAR VIA SUPABASE SQL EDITOR
-- ============================================

-- ─── 1. Coluna avatar_config ───
ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS avatar_config JSONB NOT NULL DEFAULT '{}';

-- ─── 2. RPC: salvar config do avatar ───
CREATE OR REPLACE FUNCTION public.vendor_save_avatar(p_config JSONB)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID := public._vendor_self_id();
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Vendedor não vinculado a esta conta';
  END IF;
  UPDATE public.vendedores
    SET avatar_config = COALESCE(p_config, '{}'::jsonb),
        updated_at = now()
    WHERE id = v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_save_avatar(JSONB) TO authenticated;

-- ─── 3. DROP + CREATE get_my_vendedor_context (adiciona avatar_config) ───
DROP FUNCTION IF EXISTS public.get_my_vendedor_context();

CREATE OR REPLACE FUNCTION public.get_my_vendedor_context()
RETURNS TABLE(
  vendedor_id UUID,
  tenant_id UUID,
  tenant_slug TEXT,
  tenant_nome TEXT,
  tenant_plano TEXT,
  has_access BOOLEAN,
  nome TEXT,
  apelido TEXT,
  foto_url TEXT,
  setor TEXT,
  status TEXT,
  posicao_fila INT,
  turno_aberto_id UUID,
  avatar_config JSONB
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
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
    v.avatar_config
  FROM public.vendedores v
  JOIN public.tenants t ON t.id = v.tenant_id
  WHERE v.auth_user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_vendedor_context() TO authenticated;
