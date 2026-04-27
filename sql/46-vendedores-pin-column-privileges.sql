-- Hardening: vendor PINs can be written by authorized flows but not read by
-- browser clients through PostgREST. RLS still decides which rows are visible;
-- this migration narrows which columns authenticated clients may SELECT.

DO $$
DECLARE
  selectable_columns text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO selectable_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'vendedores'
    AND column_name <> 'pin';

  IF selectable_columns IS NULL THEN
    RAISE EXCEPTION 'public.vendedores not found';
  END IF;

  REVOKE SELECT ON public.vendedores FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.vendedores TO authenticated', selectable_columns);
END $$;
