-- ============================================
-- ListaVez — Row-Level Security (Multi-Tenant)
-- Todas as policies filtram por tenant_id
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE turno_vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pausas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- ─── Vendedores ───
CREATE POLICY "vendedores_select" ON vendedores FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "vendedores_update" ON vendedores FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "vendedores_insert" ON vendedores FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "vendedores_delete" ON vendedores FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- ─── Turnos ───
CREATE POLICY "turnos_select" ON turnos FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "turnos_insert" ON turnos FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "turnos_update" ON turnos FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- ─── Turno Vendedores ───
CREATE POLICY "turno_vend_select" ON turno_vendedores FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "turno_vend_insert" ON turno_vendedores FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "turno_vend_update" ON turno_vendedores FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "turno_vend_delete" ON turno_vendedores FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- ─── Atendimentos ───
CREATE POLICY "atendimentos_select" ON atendimentos FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "atendimentos_insert" ON atendimentos FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "atendimentos_update" ON atendimentos FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "atendimentos_delete" ON atendimentos FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- ─── Pausas ───
CREATE POLICY "pausas_select" ON pausas FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "pausas_insert" ON pausas FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "pausas_update" ON pausas FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "pausas_delete" ON pausas FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- ─── Configurações ───
CREATE POLICY "config_select" ON configuracoes FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "config_insert" ON configuracoes FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "config_update" ON configuracoes FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- ─── Tenants (dono pode ver/editar seu próprio tenant) ───
CREATE POLICY "tenant_select" ON tenants FOR SELECT TO authenticated
  USING (id = get_my_tenant_id());
CREATE POLICY "tenant_update" ON tenants FOR UPDATE TO authenticated
  USING (id = get_my_tenant_id() AND owner_user_id = auth.uid());

-- ─── Tenant Users ───
CREATE POLICY "tenant_users_select" ON tenant_users FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "tenant_users_insert" ON tenant_users FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "tenant_users_update" ON tenant_users FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "tenant_users_delete" ON tenant_users FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- ─── Onboarding Tokens (leitura pública para setup pós-compra) ───
-- Permite que setup.html faça polling por session_id antes do usuário estar autenticado
ALTER TABLE onboarding_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_tokens_read_anon" ON onboarding_tokens
  FOR SELECT TO anon
  USING (used = false AND expires_at > now());

-- Habilitar Realtime nas tabelas que o tablet precisa
ALTER PUBLICATION supabase_realtime ADD TABLE vendedores;
ALTER PUBLICATION supabase_realtime ADD TABLE atendimentos;
