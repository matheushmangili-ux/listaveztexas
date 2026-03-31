-- ============================================================
-- 09 - Canais de Origem (Customer Acquisition Channels)
-- ============================================================
-- Tracks how customers found the store: fixed channels
-- (Instagram, Google, Indicacao...) and temporary events.
-- ============================================================

-- 1. Table: canais_origem
CREATE TABLE IF NOT EXISTS canais_origem (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  icone       TEXT NOT NULL DEFAULT 'fa-circle-question',
  tipo        TEXT NOT NULL DEFAULT 'fixo' CHECK (tipo IN ('fixo', 'evento')),
  ativo       BOOLEAN NOT NULL DEFAULT true,
  ordem       INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_canais_origem_tenant ON canais_origem(tenant_id);
CREATE INDEX idx_canais_origem_ativo  ON canais_origem(tenant_id, ativo) WHERE ativo = true;

-- 2. Add canal_origem_id to atendimentos
ALTER TABLE atendimentos
  ADD COLUMN IF NOT EXISTS canal_origem_id UUID REFERENCES canais_origem(id) ON DELETE SET NULL;

CREATE INDEX idx_atendimentos_canal ON atendimentos(canal_origem_id);

-- 3. RLS for canais_origem
ALTER TABLE canais_origem ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canais_origem_select" ON canais_origem
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY "canais_origem_insert" ON canais_origem
  FOR INSERT WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "canais_origem_update" ON canais_origem
  FOR UPDATE USING (tenant_id = get_my_tenant_id());

CREATE POLICY "canais_origem_delete" ON canais_origem
  FOR DELETE USING (tenant_id = get_my_tenant_id());

-- 4. Seed default fixed channels for existing tenants
INSERT INTO canais_origem (tenant_id, nome, icone, tipo, ordem)
SELECT t.id, c.nome, c.icone, 'fixo', c.ordem
FROM tenants t
CROSS JOIN (VALUES
  ('Meta',            'fa-brands fa-meta',      1),
  ('TikTok',          'fa-brands fa-tiktok',    2),
  ('E-mail',          'fa-envelope',            3),
  ('SMS',             'fa-comment-sms',         4),
  ('Indicação',       'fa-handshake',           5),
  ('Já sou cliente',  'fa-user-check',          6)
) AS c(nome, icone, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM canais_origem co WHERE co.tenant_id = t.id AND co.nome = c.nome
);

-- 5. Function to seed defaults for a NEW tenant (call during onboarding)
CREATE OR REPLACE FUNCTION seed_canais_padrao(p_tenant_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO canais_origem (tenant_id, nome, icone, tipo, ordem) VALUES
    (p_tenant_id, 'Meta',            'fa-brands fa-meta',      'fixo', 1),
    (p_tenant_id, 'TikTok',          'fa-brands fa-tiktok',    'fixo', 2),
    (p_tenant_id, 'E-mail',          'fa-envelope',            'fixo', 3),
    (p_tenant_id, 'SMS',             'fa-comment-sms',         'fixo', 4),
    (p_tenant_id, 'Indicação',       'fa-handshake',           'fixo', 5),
    (p_tenant_id, 'Já sou cliente',  'fa-user-check',          'fixo', 6);
END;
$$;

-- 6. RPC: get channel stats for dashboard
CREATE OR REPLACE FUNCTION get_canal_stats(p_inicio TIMESTAMPTZ, p_fim TIMESTAMPTZ)
RETURNS TABLE(canal_id UUID, canal_nome TEXT, canal_icone TEXT, total BIGINT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    co.id,
    co.nome,
    co.icone,
    COUNT(a.id)::BIGINT AS total
  FROM atendimentos a
  LEFT JOIN canais_origem co ON co.id = a.canal_origem_id
  WHERE a.tenant_id = get_my_tenant_id()
    AND a.inicio >= p_inicio
    AND a.inicio <= p_fim
    AND a.canal_origem_id IS NOT NULL
  GROUP BY co.id, co.nome, co.icone
  ORDER BY total DESC;
END;
$$;
