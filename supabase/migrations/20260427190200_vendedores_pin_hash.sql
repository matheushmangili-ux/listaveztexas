-- Hardening: store vendor PINs as hashes instead of plaintext.
-- Browser clients can write a new PIN, but cannot read pin or pin_hash.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

CREATE OR REPLACE FUNCTION public.hash_vendedor_pin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.pin IS NULL THEN
    RETURN NEW;
  END IF;

  IF btrim(NEW.pin) = '' THEN
    NEW.pin := NULL;
    RETURN NEW;
  END IF;

  IF NEW.pin !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'PIN deve ter exatamente 4 digitos';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vendedores v
    WHERE v.tenant_id = NEW.tenant_id
      AND (NEW.id IS NULL OR v.id <> NEW.id)
      AND (
        (v.pin_hash IS NOT NULL AND v.pin_hash = crypt(NEW.pin, v.pin_hash))
        OR (v.pin_hash IS NULL AND v.pin = NEW.pin)
      )
  ) THEN
    RAISE EXCEPTION 'PIN ja cadastrado para este tenant';
  END IF;

  NEW.pin_hash := crypt(NEW.pin, gen_salt('bf'));
  NEW.pin := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendedores_hash_pin ON public.vendedores;
CREATE TRIGGER vendedores_hash_pin
  BEFORE INSERT OR UPDATE OF pin ON public.vendedores
  FOR EACH ROW
  EXECUTE FUNCTION public.hash_vendedor_pin();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.vendedores
    WHERE pin IS NOT NULL
      AND btrim(pin) <> ''
    GROUP BY tenant_id, pin
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem PINs duplicados antes da migracao. Corrija-os antes de aplicar sql/47.';
  END IF;
END $$;

UPDATE public.vendedores
SET pin_hash = crypt(pin, gen_salt('bf')),
    pin = NULL
WHERE pin IS NOT NULL
  AND btrim(pin) <> ''
  AND pin_hash IS NULL;

UPDATE public.vendedores
SET pin = NULL
WHERE pin IS NOT NULL;

CREATE OR REPLACE FUNCTION public.find_vendedor_by_pin(p_tenant_id UUID, p_pin TEXT)
RETURNS TABLE(id UUID, nome TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT v.id, v.nome
  FROM public.vendedores v
  WHERE v.tenant_id = p_tenant_id
    AND v.ativo = true
    AND p_pin ~ '^\d{4}$'
    AND (
      (v.pin_hash IS NOT NULL AND v.pin_hash = crypt(p_pin, v.pin_hash))
      OR (v.pin_hash IS NULL AND v.pin = p_pin)
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_vendedor_by_pin(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_vendedor_by_pin(UUID, TEXT) TO service_role;

DO $$
DECLARE
  selectable_columns text;
  insertable_columns text;
  updatable_columns text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO selectable_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'vendedores'
    AND column_name NOT IN ('pin', 'pin_hash');

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO insertable_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'vendedores'
    AND column_name NOT IN ('id', 'created_at', 'updated_at', 'pin_hash', 'auth_user_id');

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO updatable_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'vendedores'
    AND column_name NOT IN ('id', 'created_at', 'tenant_id', 'pin_hash', 'auth_user_id');

  REVOKE SELECT ON public.vendedores FROM anon, authenticated;
  REVOKE INSERT, UPDATE ON public.vendedores FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.vendedores TO authenticated', selectable_columns);
  EXECUTE format('GRANT INSERT (%s) ON public.vendedores TO authenticated', insertable_columns);
  EXECUTE format('GRANT UPDATE (%s) ON public.vendedores TO authenticated', updatable_columns);
END $$;
