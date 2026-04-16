-- ─────────────────────────────────────────────────────────────────────────
-- 35-ruptura-catalog.sql
-- Ruptura v2: catálogo estruturado por tenant (tipos + grades + marcas +
-- cores). Substitui o campo produto_ruptura TEXT livre por FKs opcionais,
-- mantém o TEXT legado pra backward compat dos 1.303 atendimentos antigos.
--
-- Modelo enxuto: ~15 tipos comuns (o JSON original tem 300 classes, 90%+
-- cobertas pelos nossos tipos + fallback OUTRO). Tamanho guardado como
-- TEXT no atendimento pra imutabilidade histórica; grades por tipo são
-- editáveis pelo admin sem afetar histórico.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ 1. Tabelas ═══

CREATE TABLE IF NOT EXISTS ruptura_tipos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  ordem      INT NOT NULL DEFAULT 0,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS ruptura_tipo_grades (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_id  UUID NOT NULL REFERENCES ruptura_tipos(id) ON DELETE CASCADE,
  tamanho  TEXT NOT NULL,
  ordem    INT NOT NULL DEFAULT 0,
  UNIQUE (tipo_id, tamanho)
);

CREATE TABLE IF NOT EXISTS ruptura_marcas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  destaque   BOOLEAN NOT NULL DEFAULT false,
  ordem      INT NOT NULL DEFAULT 0,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS ruptura_cores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  hex        TEXT,
  ordem      INT NOT NULL DEFAULT 0,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_ruptura_tipos_tenant     ON ruptura_tipos(tenant_id, ativo);
CREATE INDEX IF NOT EXISTS idx_ruptura_tipo_grades_tipo ON ruptura_tipo_grades(tipo_id);
CREATE INDEX IF NOT EXISTS idx_ruptura_marcas_tenant    ON ruptura_marcas(tenant_id, ativo);
CREATE INDEX IF NOT EXISTS idx_ruptura_marcas_destaque  ON ruptura_marcas(tenant_id, destaque, ativo) WHERE destaque = true;
CREATE INDEX IF NOT EXISTS idx_ruptura_cores_tenant     ON ruptura_cores(tenant_id, ativo);

-- ═══ 2. Colunas em atendimentos ═══

ALTER TABLE atendimentos
  ADD COLUMN IF NOT EXISTS ruptura_tipo_id  UUID REFERENCES ruptura_tipos(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ruptura_marca_id UUID REFERENCES ruptura_marcas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ruptura_cor_id   UUID REFERENCES ruptura_cores(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ruptura_tamanho  TEXT;

CREATE INDEX IF NOT EXISTS idx_atendimentos_ruptura_tipo  ON atendimentos(ruptura_tipo_id)  WHERE ruptura_tipo_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atendimentos_ruptura_marca ON atendimentos(ruptura_marca_id) WHERE ruptura_marca_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atendimentos_ruptura_cor   ON atendimentos(ruptura_cor_id)   WHERE ruptura_cor_id   IS NOT NULL;

-- ═══ 3. RLS ═══

ALTER TABLE ruptura_tipos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ruptura_tipo_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE ruptura_marcas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ruptura_cores       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ruptura_tipos_select" ON ruptura_tipos FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "ruptura_tipos_insert" ON ruptura_tipos FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "ruptura_tipos_update" ON ruptura_tipos FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "ruptura_tipos_delete" ON ruptura_tipos FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- Grades herdam RLS do tipo (join implícito via FK)
CREATE POLICY "ruptura_tipo_grades_select" ON ruptura_tipo_grades FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ruptura_tipos t WHERE t.id = tipo_id AND t.tenant_id = get_my_tenant_id()));
CREATE POLICY "ruptura_tipo_grades_insert" ON ruptura_tipo_grades FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ruptura_tipos t WHERE t.id = tipo_id AND t.tenant_id = get_my_tenant_id()));
CREATE POLICY "ruptura_tipo_grades_update" ON ruptura_tipo_grades FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM ruptura_tipos t WHERE t.id = tipo_id AND t.tenant_id = get_my_tenant_id()));
CREATE POLICY "ruptura_tipo_grades_delete" ON ruptura_tipo_grades FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ruptura_tipos t WHERE t.id = tipo_id AND t.tenant_id = get_my_tenant_id()));

CREATE POLICY "ruptura_marcas_select" ON ruptura_marcas FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "ruptura_marcas_insert" ON ruptura_marcas FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "ruptura_marcas_update" ON ruptura_marcas FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "ruptura_marcas_delete" ON ruptura_marcas FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "ruptura_cores_select" ON ruptura_cores FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "ruptura_cores_insert" ON ruptura_cores FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY "ruptura_cores_update" ON ruptura_cores FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "ruptura_cores_delete" ON ruptura_cores FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- ═══ 4. Seed Texas Center ═══
-- Tenant: texascenter (e84eb289-9f6d-4bc9-82f3-ebba93759f66)

DO $$
DECLARE
  v_tenant UUID;
  v_tipo_camisa_ml UUID;
  v_tipo_camisa_mc UUID;
  v_tipo_camiseta UUID;
  v_tipo_polo UUID;
  v_tipo_vestido UUID;
  v_tipo_bata UUID;
  v_tipo_calca UUID;
  v_tipo_bermuda UUID;
  v_tipo_casaco UUID;
  v_tipo_bota UUID;
  v_tipo_botina UUID;
  v_tipo_tenis UUID;
  v_tipo_chapeu UUID;
  v_tipo_cinto UUID;
  v_tipo_outro UUID;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug = 'texascenter';
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant texascenter não encontrado — pulando seed.';
    RETURN;
  END IF;

  -- Idempotência: se já existe qualquer tipo pro tenant, não faz seed (apagar manualmente pra resetar)
  IF EXISTS (SELECT 1 FROM ruptura_tipos WHERE tenant_id = v_tenant) THEN
    RAISE NOTICE 'Catálogo já seeded para texascenter — pulando.';
    RETURN;
  END IF;

  -- Tipos (15)
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'CAMISA ML',       10) RETURNING id INTO v_tipo_camisa_ml;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'CAMISA MC',       20) RETURNING id INTO v_tipo_camisa_mc;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'CAMISETA',        30) RETURNING id INTO v_tipo_camiseta;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'POLO',            40) RETURNING id INTO v_tipo_polo;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'VESTIDO',         50) RETURNING id INTO v_tipo_vestido;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'BATA',            60) RETURNING id INTO v_tipo_bata;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'CALÇA JEANS',     70) RETURNING id INTO v_tipo_calca;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'BERMUDA',         80) RETURNING id INTO v_tipo_bermuda;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'CASACO/JAQUETA',  90) RETURNING id INTO v_tipo_casaco;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'BOTA',           100) RETURNING id INTO v_tipo_bota;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'BOTINA',         110) RETURNING id INTO v_tipo_botina;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'TÊNIS',          120) RETURNING id INTO v_tipo_tenis;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'CHAPÉU',         130) RETURNING id INTO v_tipo_chapeu;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'CINTO',          140) RETURNING id INTO v_tipo_cinto;
  INSERT INTO ruptura_tipos (tenant_id, nome, ordem) VALUES
    (v_tenant, 'OUTRO',          999) RETURNING id INTO v_tipo_outro;

  -- Grades vestuário topo (PP P M G GG XG)
  INSERT INTO ruptura_tipo_grades (tipo_id, tamanho, ordem)
  SELECT t_id, g.tam, g.ord
  FROM unnest(ARRAY[v_tipo_camisa_ml, v_tipo_camisa_mc, v_tipo_camiseta,
                    v_tipo_polo, v_tipo_bata, v_tipo_casaco, v_tipo_vestido]) AS t_id
  CROSS JOIN (VALUES ('PP', 1), ('P', 2), ('M', 3), ('G', 4), ('GG', 5), ('XG', 6)) AS g(tam, ord);

  -- Grades calça jeans + bermuda (US: 26 28 30 32 34 36 38 40 42 44)
  INSERT INTO ruptura_tipo_grades (tipo_id, tamanho, ordem)
  SELECT t_id, g.tam, g.ord
  FROM unnest(ARRAY[v_tipo_calca, v_tipo_bermuda]) AS t_id
  CROSS JOIN (VALUES ('26', 1), ('28', 2), ('30', 3), ('32', 4), ('34', 5),
                     ('36', 6), ('38', 7), ('40', 8), ('42', 9), ('44', 10)) AS g(tam, ord);

  -- Grades calçados (33..44)
  INSERT INTO ruptura_tipo_grades (tipo_id, tamanho, ordem)
  SELECT t_id, g.tam, g.ord
  FROM unnest(ARRAY[v_tipo_bota, v_tipo_botina, v_tipo_tenis]) AS t_id
  CROSS JOIN (VALUES ('33', 1), ('34', 2), ('35', 3), ('36', 4), ('37', 5), ('38', 6),
                     ('39', 7), ('40', 8), ('41', 9), ('42', 10), ('43', 11), ('44', 12)) AS g(tam, ord);

  -- Grades chapéu (55..61)
  INSERT INTO ruptura_tipo_grades (tipo_id, tamanho, ordem)
  VALUES (v_tipo_chapeu, '55', 1), (v_tipo_chapeu, '56', 2), (v_tipo_chapeu, '57', 3),
         (v_tipo_chapeu, '58', 4), (v_tipo_chapeu, '59', 5), (v_tipo_chapeu, '60', 6),
         (v_tipo_chapeu, '61', 7);

  -- (CINTO e OUTRO ficam sem grade)

  -- Marcas (130 do JSON — 20 destaque pra Texas Center)
  INSERT INTO ruptura_marcas (tenant_id, nome, destaque, ordem) VALUES
    (v_tenant, 'ARIAT',             true,  10),
    (v_tenant, 'TXC',                true,  20),
    (v_tenant, 'STETSON',            true,  30),
    (v_tenant, 'DURANGO',            true,  40),
    (v_tenant, 'WRANGLER',           true,  50),
    (v_tenant, 'AMERICAN HAT',       true,  60),
    (v_tenant, 'KING FARM',          true,  70),
    (v_tenant, 'TONY LAMA',          true,  80),
    (v_tenant, 'RESISTOL',           true,  90),
    (v_tenant, 'NOCONA',             true, 100),
    (v_tenant, 'CINCH',              true, 110),
    (v_tenant, 'RIVERS EDGE',        true, 120),
    (v_tenant, 'MONTANA',            true, 130),
    (v_tenant, 'TASSA',              true, 140),
    (v_tenant, 'LEVIS',              true, 150),
    (v_tenant, 'CAPODARTE',          true, 160),
    (v_tenant, 'RANCH WEAR',         true, 170),
    (v_tenant, 'GOYAZES',            true, 180),
    (v_tenant, 'INDIANA RANCH',      true, 190),
    (v_tenant, 'TEXAS CENTER',       true, 200);

  -- Resto das 110 marcas (não destaque)
  INSERT INTO ruptura_marcas (tenant_id, nome, destaque, ordem)
  SELECT v_tenant, m, false, 1000
  FROM unnest(ARRAY[
    '3D','7 FOR ALL MANKIND','ALL HUNTER','ALVORADA','AMI-CELL','ANATOMIC GEL','ANZETUTTO',
    'ATR','AUSTIN','BAIANO','BEX','BIDAYA PARFUMS','BOB AVILA','BOOTS HORSE','BOSS',
    'BRENE HORSE','BUCK','CALIBER','CALIBER PRO','CAMINHOS DA ROCA','CANIVETE SMITH WESSON',
    'CHARLIE 1 HORSE','CLASSIC','COLD STELL','COLUMBIA','COPENHAGEN','CRINACHICK','CRKT',
    'CROSS FIRE','CRUMRINE','DANDY','DAVIS','DODGE ROPE','DOUBLE J SANDDLERY','EQUITECH',
    'FAST BACK','FERNANDO ACUNA','FOX KNIVES','GANZO','GENUINE','GENUINE DI','HAMMER',
    'HORSEMAN','JACOMO','JHON COUNTRY','JUSTIN','KARANDA','KELLDRIN','KINGS SADDLERY',
    'LACOSTE','LEATHERMAN','LINEAK','LONE STAR','LONGHORN BUCKLES','LUZ CAMILA',
    'LYLES LARIATS','MARCATTO','MF WESTERN','MISS COUNTRY','MREIS','MUSTANG','NEW ERA',
    'NOBLE OUTFITTERS','NRS','OAKLEY','OX HORNS','OZARK','PARTRADE','PAUL WESTERN',
    'PROF CHOICE','PYRAMID','RALPH LAUREN','RATTLER','REVOLUTION BUCKLES','RUBBER BANDS',
    'SCHRADE','SG','SLONE','SPRINGER','SPURS','SPYDERCO','SS DOUBLE','STANLEY','STOKERS',
    'STS','TAC FORCE','TOMAHAWK ROPES','TOMMY BLESSING','TOMMY HILFIGER','TOUGH-1',
    'TRAIAS FERREIRAS','TROXEL','TWISTER','VICTORINOX','VIMAR BOOTS','VINAGRE','WEAVER',
    'WILLARD ROPES','ZENZ'
  ]) AS m;

  -- Cores (24)
  INSERT INTO ruptura_cores (tenant_id, nome, hex, ordem) VALUES
    (v_tenant, 'PRETO',          '#0d0d0d', 10),
    (v_tenant, 'BRANCO',         '#ffffff', 20),
    (v_tenant, 'OFF-WHITE',      '#f5f0e6', 25),
    (v_tenant, 'MARROM',         '#5c3a21', 30),
    (v_tenant, 'CARAMELO',       '#8a5a2b', 40),
    (v_tenant, 'WHISKY',         '#a0622a', 45),
    (v_tenant, 'TABACO',         '#6d4b2f', 50),
    (v_tenant, 'FERRUGEM',       '#8a4b2a', 55),
    (v_tenant, 'BEGE',           '#d9c6a5', 60),
    (v_tenant, 'NATURAL',        '#e6d4b5', 65),
    (v_tenant, 'CINZA',          '#7a7a7a', 70),
    (v_tenant, 'GRAFITE',        '#3a3a3a', 75),
    (v_tenant, 'AZUL',           '#2b5fa6', 80),
    (v_tenant, 'AZUL MARINHO',   '#1a2a4a', 85),
    (v_tenant, 'VERDE',          '#3a7a4a', 90),
    (v_tenant, 'VERMELHO',       '#b83a2a', 100),
    (v_tenant, 'VINHO',          '#5a1a2a', 105),
    (v_tenant, 'BORDO',          '#6a1a2a', 110),
    (v_tenant, 'ROXO',           '#5a3a6a', 115),
    (v_tenant, 'ROSA',           '#d67a8a', 120),
    (v_tenant, 'LARANJA',        '#e6702a', 125),
    (v_tenant, 'AMARELO',        '#e6c23a', 130),
    (v_tenant, 'XADREZ AZUL',    NULL, 200),
    (v_tenant, 'XADREZ VERMELHO',NULL, 210);
END $$;
