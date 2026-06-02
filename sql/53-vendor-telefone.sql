-- ─────────────────────────────────────────────────────────────────────────
-- 53-vendor-telefone.sql
-- Telefone (WhatsApp) do vendedor — usado pra enviar as credenciais de acesso
-- com um toque (wa.me) ao criar/resetar o login. Opcional, texto livre.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS telefone TEXT;

-- CRÍTICO: vendedores usa GRANTs por COLUNA (vide sql/47, que concede cada coluna
-- exceto pin/pin_hash). Colunas novas NÃO herdam o grant automaticamente, então
-- sem isto o `select(...,telefone)` retorna 403 e a lista de vendedores vem vazia.
GRANT SELECT (telefone), INSERT (telefone), UPDATE (telefone) ON public.vendedores TO authenticated;
