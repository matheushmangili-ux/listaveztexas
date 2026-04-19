-- 40-storage-tighten-select.sql
-- Remove policies de SELECT amplas em storage.objects (advisor 0025).
-- `public_read 1o8xd4k_0` dava SELECT em QUALQUER bucket para role public.
-- `vm_photos_select` dava SELECT no bucket vm-photos para role public.
-- A app usa apenas .upload() e .getPublicUrl() — nunca .list() — e buckets
-- públicos servem arquivos por URL direta sem passar por RLS, então a SELECT
-- policy só servia para listagem (que ninguém usa). Drop impede enumeração.

DROP POLICY IF EXISTS "public_read 1o8xd4k_0" ON storage.objects;
DROP POLICY IF EXISTS "vm_photos_select" ON storage.objects;
