-- ─────────────────────────────────────────────────────────────────────────
-- 53-vendor-telefone.sql
-- Telefone (WhatsApp) do vendedor — usado pra enviar as credenciais de acesso
-- com um toque (wa.me) ao criar/resetar o login. Opcional, texto livre.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS telefone TEXT;
