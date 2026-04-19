-- 42-rls-auth-wrap.sql
-- Wrap de auth.uid() em (SELECT auth.uid()) para evitar reavaliação por linha
-- em RLS policies (advisor 0003_auth_rls_initplan). Sem o SELECT, Postgres
-- trata como volatile e chama a função para cada tupla candidata.

DROP POLICY IF EXISTS tenant_update ON public.tenants;
CREATE POLICY tenant_update ON public.tenants
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT public.get_my_tenant_id())
    AND owner_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS push_subs_select_own ON public.push_subscriptions;
CREATE POLICY push_subs_select_own ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (
    vendedor_id IN (
      SELECT id FROM public.vendedores
      WHERE auth_user_id = (SELECT auth.uid())
    )
  );
