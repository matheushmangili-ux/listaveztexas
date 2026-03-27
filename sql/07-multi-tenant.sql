-- ============================================
-- ListaVez — Multi-Tenant Migration
-- Sprint 1: Schema changes for SaaS conversion
--
-- SAFE TO RUN ON LIVE DATABASE:
-- All changes are additive (new tables, nullable columns)
-- Existing queries continue working unchanged
-- ============================================

-- ─── PART 1: New tables ─────────────────────

-- Tenants (cada loja é um tenant)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  nome_loja TEXT NOT NULL,
  plano TEXT NOT NULL DEFAULT 'pro',
  max_vendedores INT NOT NULL DEFAULT 999,
  owner_email TEXT NOT NULL,
  owner_user_id UUID REFERENCES auth.users(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  logo_url TEXT,
  cor_primaria TEXT DEFAULT '#E11D48',
  setores JSONB DEFAULT '["loja"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Tenant users (associa auth users a tenants com role e PIN)
CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'recepcionista',
  pin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id),
  UNIQUE(tenant_id, pin)
);

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- Onboarding tokens (link pós-compra para setup)
CREATE TABLE IF NOT EXISTS onboarding_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  email TEXT NOT NULL,
  plano TEXT NOT NULL DEFAULT 'pro',
  stripe_session_id TEXT,
  used BOOLEAN NOT NULL DEFAULT false,
  tenant_id UUID REFERENCES tenants(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE onboarding_tokens ENABLE ROW LEVEL SECURITY;


-- ─── PART 2: Add tenant_id to existing tables (NULLABLE first) ───

ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE turno_vendedores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE pausas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);


-- ─── PART 3: Indexes for tenant-scoped queries ───

CREATE INDEX IF NOT EXISTS idx_vendedores_tenant ON vendedores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_turnos_tenant ON turnos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_turno_vendedores_tenant ON turno_vendedores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_atendimentos_tenant ON atendimentos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pausas_tenant ON pausas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_config_tenant ON configuracoes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_token ON onboarding_tokens(token);


-- ─── PART 4: Helper function to extract tenant_id from JWT ───

-- Nota: não é possível criar funções no schema auth via SQL Editor do Supabase
-- Usamos public.get_my_tenant_id() no lugar de auth.tenant_id()
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'tenant_id')::UUID,
    NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_my_tenant_id() TO authenticated;


-- ─── PART 5: Public RPC to resolve tenant by slug (pre-auth) ───

CREATE OR REPLACE FUNCTION resolve_tenant(p_slug TEXT)
RETURNS TABLE(id UUID, nome_loja TEXT, logo_url TEXT, cor_primaria TEXT, setores JSONB)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT t.id, t.nome_loja, t.logo_url, t.cor_primaria, t.setores
  FROM tenants t
  WHERE t.slug = p_slug AND t.status = 'active'
  LIMIT 1;
$$;

-- Permitir chamada anônima (antes do login)
GRANT EXECUTE ON FUNCTION resolve_tenant(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION resolve_tenant(TEXT) TO authenticated;


-- ─── PART 6: Backfill & enforce NOT NULL ───
-- Run AFTER creating the first tenant and backfilling tenant_id on all rows.
-- Example for Texas Center (replace UUID with actual tenant id):
--
-- INSERT INTO tenants (slug, nome_loja, plano, owner_email, owner_user_id, setores)
-- VALUES ('texascenter', 'Texas Center', 'pro', 'gerencial@texascenter.com.br',
--         '<gerente_user_id>', '["loja","chapelaria","selaria"]');
--
-- UPDATE vendedores SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
-- UPDATE turnos SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
-- UPDATE turno_vendedores SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
-- UPDATE atendimentos SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
-- UPDATE pausas SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
-- UPDATE configuracoes SET tenant_id = '<tenant_id>' WHERE tenant_id IS NULL;
--
-- ALTER TABLE vendedores ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE turnos ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE turno_vendedores ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE atendimentos ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE pausas ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE configuracoes ALTER COLUMN tenant_id SET NOT NULL;
