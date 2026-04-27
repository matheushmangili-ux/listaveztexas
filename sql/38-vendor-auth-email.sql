-- sql/38-vendor-auth-email.sql
-- RPC para o dashboard consultar o email do auth user vinculado a um vendedor.
-- Usado no modal de edição de vendedor (settings.html > Equipe) para mostrar
-- "Login: <email>" quando vendedores.auth_user_id está preenchido.

CREATE OR REPLACE FUNCTION public.get_vendor_auth_email(p_vendedor_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_tenant UUID;
  v_caller_role TEXT;
  v_vendedor_tenant UUID;
  v_auth_user_id UUID;
  v_email TEXT;
BEGIN
  v_caller_tenant := public.get_my_tenant_id();
  v_caller_role := public.get_my_tenant_role();

  IF v_caller_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Apenas owner/admin/gerente podem consultar credenciais de vendedor';
  END IF;

  SELECT tenant_id, auth_user_id
    INTO v_vendedor_tenant, v_auth_user_id
    FROM public.vendedores
    WHERE id = p_vendedor_id;

  IF v_vendedor_tenant IS NULL THEN
    RAISE EXCEPTION 'Vendedor não encontrado';
  END IF;
  IF v_vendedor_tenant != v_caller_tenant THEN
    RAISE EXCEPTION 'Vendedor não pertence ao seu tenant';
  END IF;
  IF v_auth_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_auth_user_id;
  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vendor_auth_email(UUID) TO authenticated;
