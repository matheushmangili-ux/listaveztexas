-- ============================================
-- minhavez — Fase 3: Missões Diárias (schema base)
-- Aplicada no Supabase em 2026-04-11 como migration "missions_phase3_schema"
--
-- Entregáveis:
-- - tenants.timezone TEXT DEFAULT 'America/Sao_Paulo' (sem constraint de
--   lookup porque CHECK não aceita subquery; validação fica no app layer)
-- - mission_templates: admin cria templates por tenant
-- - vendor_mission_progress: 1 linha por (vendor, template, dia local)
-- - goal_type: atendimentos_count | vendas_count | vendas_canal_count |
--   valor_vendido_total
-- - active_days: SMALLINT bitmask (bit 0=dom ... bit 6=sáb, default 127)
-- - _today_for_tenant: helper pro reset on-demand via (now() AT TIME ZONE t.timezone)
-- - get_my_missions_today: RPC vendor que lista missões do dia com progresso
-- - admin_list/upsert/delete_mission_templates: CMS pro dashboard
--
-- Reset diário é ON-DEMAND: quando vendedor abre o app, get_my_missions_today
-- resolve a data local do tenant e filtra. Sem pg_cron, sem jobs globais.
-- ============================================

-- ─── 1. Timezone por tenant ───
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- ─── 2. Templates de missão ───
CREATE TABLE IF NOT EXISTS public.mission_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  goal_type   TEXT NOT NULL CHECK (goal_type IN (
    'atendimentos_count',
    'vendas_count',
    'vendas_canal_count',
    'valor_vendido_total'
  )),
  goal_value  NUMERIC NOT NULL CHECK (goal_value > 0),
  reward_xp   INT NOT NULL CHECK (reward_xp >= 0) DEFAULT 50,
  icon        TEXT NOT NULL DEFAULT 'fa-bullseye',
  active_days SMALLINT NOT NULL DEFAULT 127 CHECK (active_days BETWEEN 1 AND 127),
  active      BOOLEAN NOT NULL DEFAULT true,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_templates_tenant_active
  ON public.mission_templates(tenant_id, active) WHERE active = true;

-- ─── 3. Progresso por vendedor/dia ───
CREATE TABLE IF NOT EXISTS public.vendor_mission_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id   UUID NOT NULL REFERENCES public.mission_templates(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  progress      NUMERIC NOT NULL DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, template_id, date)
);

CREATE INDEX IF NOT EXISTS idx_mission_progress_vendor_date
  ON public.vendor_mission_progress(vendor_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_mission_progress_tenant_date
  ON public.vendor_mission_progress(tenant_id, date DESC);

-- ─── 4. RLS ───
ALTER TABLE public.mission_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_mission_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mission_templates_select" ON public.mission_templates;
CREATE POLICY "mission_templates_select" ON public.mission_templates
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "mission_progress_select" ON public.vendor_mission_progress;
CREATE POLICY "mission_progress_select" ON public.vendor_mission_progress
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ─── 5. Helper: data local do tenant ───
CREATE OR REPLACE FUNCTION public._today_for_tenant(p_tenant_id UUID)
RETURNS DATE LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE COALESCE(
    (SELECT timezone FROM public.tenants WHERE id = p_tenant_id),
    'America/Sao_Paulo'
  ))::date;
$$;

-- ─── 6. RPC vendor: missões do dia ───
CREATE OR REPLACE FUNCTION public.get_my_missions_today()
RETURNS TABLE(
  template_id  UUID,
  title        TEXT,
  description  TEXT,
  goal_type    TEXT,
  goal_value   NUMERIC,
  reward_xp    INT,
  icon         TEXT,
  meta         JSONB,
  progress     NUMERIC,
  completed    BOOLEAN,
  progress_pct NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
  v_vid UUID;
  v_tid UUID;
  v_today DATE;
  v_dow INT;
  v_bit INT;
BEGIN
  SELECT v.id, v.tenant_id INTO v_vid, v_tid
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid() LIMIT 1;
  IF v_vid IS NULL THEN RETURN; END IF;

  v_today := public._today_for_tenant(v_tid);
  v_dow := EXTRACT(DOW FROM v_today)::int;
  v_bit := 1 << v_dow;

  RETURN QUERY
    SELECT
      t.id,
      t.title,
      t.description,
      t.goal_type,
      t.goal_value,
      t.reward_xp,
      t.icon,
      t.meta,
      COALESCE(p.progress, 0)::numeric AS progress,
      (p.completed_at IS NOT NULL) AS completed,
      CASE
        WHEN t.goal_value = 0 THEN 0::numeric
        ELSE LEAST(100, ROUND((COALESCE(p.progress, 0) / t.goal_value) * 100, 1))
      END AS progress_pct
    FROM public.mission_templates t
    LEFT JOIN public.vendor_mission_progress p
      ON p.template_id = t.id AND p.vendor_id = v_vid AND p.date = v_today
    WHERE t.tenant_id = v_tid
      AND t.active = true
      AND (t.active_days & v_bit) <> 0
    ORDER BY (p.completed_at IS NOT NULL) ASC, t.reward_xp DESC
    LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_missions_today() TO authenticated;

-- ─── 7. RPCs admin ───
CREATE OR REPLACE FUNCTION public.admin_list_mission_templates()
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  goal_type TEXT,
  goal_value NUMERIC,
  reward_xp INT,
  icon TEXT,
  active_days SMALLINT,
  active BOOLEAN,
  meta JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_tid UUID;
BEGIN
  v_tid := public.get_my_tenant_id();
  IF v_tid IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;

  RETURN QUERY
    SELECT t.id, t.title, t.description, t.goal_type, t.goal_value,
           t.reward_xp, t.icon, t.active_days, t.active, t.meta, t.created_at
    FROM public.mission_templates t
    WHERE t.tenant_id = v_tid
    ORDER BY t.active DESC, t.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_mission_templates() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_mission_template(p_payload JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tid UUID;
  v_role TEXT;
  v_id UUID;
BEGIN
  v_tid := public.get_my_tenant_id();
  IF v_tid IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;

  v_role := (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'user_role');
  IF v_role NOT IN ('owner','admin','gerente') THEN
    RAISE EXCEPTION 'Apenas owner/admin/gerente podem editar missões';
  END IF;

  v_id := NULLIF(p_payload->>'id','')::uuid;

  IF v_id IS NULL THEN
    INSERT INTO public.mission_templates(
      tenant_id, title, description, goal_type, goal_value, reward_xp,
      icon, active_days, active, meta, created_by
    ) VALUES (
      v_tid,
      COALESCE(p_payload->>'title', ''),
      COALESCE(p_payload->>'description', ''),
      p_payload->>'goal_type',
      COALESCE((p_payload->>'goal_value')::numeric, 1),
      COALESCE((p_payload->>'reward_xp')::int, 50),
      COALESCE(p_payload->>'icon', 'fa-bullseye'),
      COALESCE((p_payload->>'active_days')::smallint, 127),
      COALESCE((p_payload->>'active')::boolean, true),
      COALESCE(p_payload->'meta', '{}'::jsonb),
      auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.mission_templates SET
      title       = COALESCE(p_payload->>'title', title),
      description = COALESCE(p_payload->>'description', description),
      goal_type   = COALESCE(p_payload->>'goal_type', goal_type),
      goal_value  = COALESCE((p_payload->>'goal_value')::numeric, goal_value),
      reward_xp   = COALESCE((p_payload->>'reward_xp')::int, reward_xp),
      icon        = COALESCE(p_payload->>'icon', icon),
      active_days = COALESCE((p_payload->>'active_days')::smallint, active_days),
      active      = COALESCE((p_payload->>'active')::boolean, active),
      meta        = COALESCE(p_payload->'meta', meta),
      updated_at  = now()
    WHERE id = v_id AND tenant_id = v_tid;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_mission_template(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_mission_template(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tid UUID;
  v_role TEXT;
BEGIN
  v_tid := public.get_my_tenant_id();
  IF v_tid IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;

  v_role := (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'user_role');
  IF v_role NOT IN ('owner','admin','gerente') THEN
    RAISE EXCEPTION 'Apenas owner/admin/gerente podem apagar missões';
  END IF;

  DELETE FROM public.mission_templates WHERE id = p_id AND tenant_id = v_tid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_mission_template(UUID) TO authenticated;
