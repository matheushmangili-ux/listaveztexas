-- ============================================
-- Schema Drift Fix — documentar colunas e tabela
-- que existem no banco mas não estavam versionadas
-- ============================================

-- Tabela pausas (já existe no banco, documentada aqui)
CREATE TABLE IF NOT EXISTS pausas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendedor_id UUID NOT NULL REFERENCES vendedores(id),
    turno_id UUID NOT NULL REFERENCES turnos(id),
    motivo TEXT,
    inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
    fim TIMESTAMPTZ,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colunas adicionadas por migrations não versionadas
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS setor TEXT DEFAULT 'loja';
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS preferencial BOOLEAN DEFAULT false;
ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS canal_origem_id UUID;

-- ─── Indexes faltantes ───
CREATE INDEX IF NOT EXISTS idx_vendedores_pin ON vendedores(tenant_id, pin);
CREATE INDEX IF NOT EXISTS idx_vendedores_setor ON vendedores(setor);
CREATE INDEX IF NOT EXISTS idx_pausas_vendedor_open ON pausas(vendedor_id) WHERE fim IS NULL;
CREATE INDEX IF NOT EXISTS idx_pausas_inicio ON pausas(inicio);
CREATE INDEX IF NOT EXISTS idx_atendimentos_turno_resultado ON atendimentos(turno_id, resultado);

-- ─── Corrigir RLS: pausas_log (se existir) com USING(true) → restringir ───
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pausas_log') THEN
    DROP POLICY IF EXISTS "pausas_select" ON pausas_log;
    DROP POLICY IF EXISTS "pausas_insert" ON pausas_log;
    DROP POLICY IF EXISTS "pausas_update" ON pausas_log;
    -- Restringir ao tenant
    EXECUTE 'CREATE POLICY "pausas_log_select" ON pausas_log FOR SELECT TO authenticated USING (tenant_id = get_my_tenant_id())';
    EXECUTE 'CREATE POLICY "pausas_log_insert" ON pausas_log FOR INSERT TO authenticated WITH CHECK (tenant_id = get_my_tenant_id())';
  END IF;
END $$;
