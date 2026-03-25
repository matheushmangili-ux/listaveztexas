-- ============================================
-- Fotos dos vendedores — Storage setup
-- ============================================

-- Adicionar coluna foto_url se não existir
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS foto_url text;

-- Criar bucket público para avatares
-- (Execute no Supabase Dashboard > Storage > New Bucket)
-- Nome: avatars
-- Public: true

-- Policy para permitir upload autenticado
-- (No Supabase Dashboard > Storage > avatars > Policies)
-- INSERT: authenticated users can upload
-- SELECT: public access (allow read for everyone)
-- UPDATE: authenticated users can update (for upsert)
