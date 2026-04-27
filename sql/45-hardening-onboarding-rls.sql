-- Hardening: onboarding tokens are no longer readable by anon/authenticated.
-- setup.html resolves tokens through the resolve-onboarding-token Edge Function.

DROP POLICY IF EXISTS "onboarding_tokens_read_anon" ON public.onboarding_tokens;
REVOKE ALL ON public.onboarding_tokens FROM anon, authenticated;

-- Resolve tenant from server-side membership instead of trusting mutable JWT
-- user_metadata. Every provisioned owner/manager/receptionist/vendor should be
-- represented in tenant_users or linked from vendedores.
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (SELECT tu.tenant_id FROM public.tenant_users tu WHERE tu.user_id = auth.uid() LIMIT 1),
    (SELECT t.id FROM public.tenants t WHERE t.owner_user_id = auth.uid() LIMIT 1),
    (SELECT v.tenant_id FROM public.vendedores v WHERE v.auth_user_id = auth.uid() LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_tenant_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (SELECT tu.role FROM public.tenant_users tu WHERE tu.user_id = auth.uid() LIMIT 1),
    (SELECT 'owner' FROM public.tenants t WHERE t.owner_user_id = auth.uid() LIMIT 1),
    (SELECT 'vendedor' FROM public.vendedores v WHERE v.auth_user_id = auth.uid() LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_tenant_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT public.get_my_tenant_role() IN ('owner', 'admin', 'gerente');
$$;

GRANT EXECUTE ON FUNCTION public.is_tenant_manager() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_tenant_operator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT public.get_my_tenant_role() IN ('owner', 'admin', 'gerente', 'recepcionista');
$$;

GRANT EXECUTE ON FUNCTION public.is_tenant_operator() TO authenticated;

DROP POLICY IF EXISTS "vendedores_update" ON public.vendedores;
DROP POLICY IF EXISTS "vendedores_insert" ON public.vendedores;
DROP POLICY IF EXISTS "vendedores_delete" ON public.vendedores;
CREATE POLICY "vendedores_update" ON public.vendedores FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id() AND public.is_tenant_operator())
  WITH CHECK (tenant_id = public.get_my_tenant_id() AND public.is_tenant_operator());
CREATE POLICY "vendedores_insert" ON public.vendedores FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id() AND public.is_tenant_manager());
CREATE POLICY "vendedores_delete" ON public.vendedores FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id() AND public.is_tenant_manager());

DROP POLICY IF EXISTS "tenant_users_insert" ON public.tenant_users;
DROP POLICY IF EXISTS "tenant_users_update" ON public.tenant_users;
DROP POLICY IF EXISTS "tenant_users_delete" ON public.tenant_users;
CREATE POLICY "tenant_users_insert" ON public.tenant_users FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id() AND public.is_tenant_manager());
CREATE POLICY "tenant_users_update" ON public.tenant_users FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id() AND public.is_tenant_manager())
  WITH CHECK (tenant_id = public.get_my_tenant_id() AND public.is_tenant_manager());
CREATE POLICY "tenant_users_delete" ON public.tenant_users FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id() AND public.is_tenant_manager());

DROP POLICY IF EXISTS "atendimentos_delete" ON public.atendimentos;
CREATE POLICY "atendimentos_delete" ON public.atendimentos FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id() AND public.is_tenant_manager());

DROP POLICY IF EXISTS "canais_origem_insert" ON public.canais_origem;
DROP POLICY IF EXISTS "canais_origem_update" ON public.canais_origem;
DROP POLICY IF EXISTS "canais_origem_delete" ON public.canais_origem;
CREATE POLICY "canais_origem_insert" ON public.canais_origem FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id() AND public.is_tenant_manager());
CREATE POLICY "canais_origem_update" ON public.canais_origem FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id() AND public.is_tenant_manager())
  WITH CHECK (tenant_id = public.get_my_tenant_id() AND public.is_tenant_manager());
CREATE POLICY "canais_origem_delete" ON public.canais_origem FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id() AND public.is_tenant_manager());
