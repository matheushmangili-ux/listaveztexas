-- ─────────────────────────────────────────────────────────────────────────
-- 34-resolve-tenant-white-label.sql
-- White-label Elite v1: resolve_tenant devolve plano (pra UI decidir se
-- mostra picker ou lock) e gateia cor_primaria/logo_url server-side —
-- só devolve pra tenants elite. Cliente pode confiar: se veio não-null,
-- é porque é elite. Sem gate client-side pra rebranding.
-- ─────────────────────────────────────────────────────────────────────────
-- DROP necessário porque mudamos o return type (adicionamos coluna plano).
DROP FUNCTION IF EXISTS public.resolve_tenant(TEXT);

CREATE OR REPLACE FUNCTION public.resolve_tenant(p_slug TEXT)
RETURNS TABLE(
  id UUID,
  nome_loja TEXT,
  logo_url TEXT,
  cor_primaria TEXT,
  setores JSONB,
  plano TEXT
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT t.id,
         t.nome_loja,
         CASE WHEN t.plano = 'elite' THEN t.logo_url END,
         CASE WHEN t.plano = 'elite' THEN t.cor_primaria END,
         t.setores,
         t.plano
  FROM tenants t
  WHERE t.slug = p_slug AND t.status = 'active'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tenant(TEXT) TO anon, authenticated;
