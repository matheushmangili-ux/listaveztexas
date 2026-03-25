-- ============================================
-- ListaVez Texas — Row-Level Security
-- Executar no Supabase SQL Editor APÓS schema.sql
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE turno_vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

-- Vendedores: todos autenticados podem ler e atualizar
CREATE POLICY "vendedores_select" ON vendedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendedores_update" ON vendedores FOR UPDATE TO authenticated USING (true);
CREATE POLICY "vendedores_insert" ON vendedores FOR INSERT TO authenticated WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'user_role') IN ('gerente', 'admin')
);
CREATE POLICY "vendedores_delete" ON vendedores FOR DELETE TO authenticated USING (
    (auth.jwt() -> 'user_metadata' ->> 'user_role') IN ('gerente', 'admin')
);

-- Turnos: todos autenticados podem ler; recep e gerente podem criar/atualizar
CREATE POLICY "turnos_select" ON turnos FOR SELECT TO authenticated USING (true);
CREATE POLICY "turnos_insert" ON turnos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "turnos_update" ON turnos FOR UPDATE TO authenticated USING (true);

-- Turno vendedores: mesma regra
CREATE POLICY "turno_vend_select" ON turno_vendedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "turno_vend_insert" ON turno_vendedores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "turno_vend_update" ON turno_vendedores FOR UPDATE TO authenticated USING (true);

-- Atendimentos: todos autenticados podem ler e inserir/atualizar
CREATE POLICY "atendimentos_select" ON atendimentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "atendimentos_insert" ON atendimentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "atendimentos_update" ON atendimentos FOR UPDATE TO authenticated USING (true);

-- Configurações: todos leem; só gerente/admin escrevem
CREATE POLICY "config_select" ON configuracoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_upsert" ON configuracoes FOR ALL TO authenticated USING (
    (auth.jwt() -> 'user_metadata' ->> 'user_role') IN ('gerente', 'admin')
);

-- DELETE policies para limpeza de FKs ao excluir vendedores
CREATE POLICY "turno_vend_delete" ON turno_vendedores FOR DELETE TO authenticated USING (true);
CREATE POLICY "atendimentos_delete" ON atendimentos FOR DELETE TO authenticated USING (true);
CREATE POLICY "pausas_delete" ON pausas_log FOR DELETE TO authenticated USING (true);

-- Habilitar Realtime nas tabelas que o tablet precisa
ALTER PUBLICATION supabase_realtime ADD TABLE vendedores;
ALTER PUBLICATION supabase_realtime ADD TABLE atendimentos;
