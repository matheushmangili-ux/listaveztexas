-- ============================================
-- minhavez — Fase 4: Conquistas / Badges
--
-- achievement_definitions: seeds de ~25 conquistas com tiers
-- vendor_achievements: unlocks por vendedor (idempotente)
-- _check_achievements: engine chamada dentro de _grant_xp_for_attendance
-- get_my_achievements: RPC vendor com progresso
--
-- APLICAR VIA SUPABASE SQL EDITOR (MCP indisponível no momento do dev)
-- ============================================

-- ─── 1. Tabela de definições ───
CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  tier             TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','prata','ouro','lendario')),
  requirement_type TEXT NOT NULL,
  requirement_value NUMERIC NOT NULL DEFAULT 1,
  icon             TEXT NOT NULL DEFAULT 'fa-trophy',
  sort_order       INT NOT NULL DEFAULT 0
);

-- ─── 2. Unlocks por vendedor ───
CREATE TABLE IF NOT EXISTS public.vendor_achievements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  achievement_code TEXT NOT NULL REFERENCES public.achievement_definitions(code) ON DELETE CASCADE,
  unlocked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, achievement_code)
);

CREATE INDEX IF NOT EXISTS idx_vendor_achievements_vendor
  ON public.vendor_achievements(vendor_id);

-- ─── 3. RLS ───
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_achievements ENABLE ROW LEVEL SECURITY;

-- Definições são globais (todos podem ler)
DROP POLICY IF EXISTS "achievement_defs_select" ON public.achievement_definitions;
CREATE POLICY "achievement_defs_select" ON public.achievement_definitions
  FOR SELECT TO authenticated USING (true);

-- Unlocks filtrados por tenant
DROP POLICY IF EXISTS "vendor_achievements_select" ON public.vendor_achievements;
CREATE POLICY "vendor_achievements_select" ON public.vendor_achievements
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ─── 4. Seeds: ~25 conquistas iniciais ───
INSERT INTO public.achievement_definitions (code, title, description, tier, requirement_type, requirement_value, icon, sort_order) VALUES
  -- Bronze (primeiros passos)
  ('primeiro_atendimento', 'Primeiro Passo', 'Finalize seu primeiro atendimento', 'bronze', 'total_atendimentos', 1, 'fa-shoe-prints', 10),
  ('primeira_venda', 'Primeira Venda', 'Realize sua primeira venda', 'bronze', 'total_vendas', 1, 'fa-bag-shopping', 20),
  ('atendimentos_10', 'Dedicado', '10 atendimentos finalizados', 'bronze', 'total_atendimentos', 10, 'fa-handshake', 30),
  ('vendas_5', 'Vendedor Nato', '5 vendas realizadas', 'bronze', 'total_vendas', 5, 'fa-star', 40),
  ('nivel_3', 'Aprendiz', 'Alcance o nível 3', 'bronze', 'level', 3, 'fa-seedling', 50),
  ('missao_1', 'Missionário', 'Complete sua primeira missão diária', 'bronze', 'total_missoes', 1, 'fa-bullseye', 60),

  -- Prata (engajamento)
  ('atendimentos_50', 'Consistente', '50 atendimentos finalizados', 'prata', 'total_atendimentos', 50, 'fa-handshake', 110),
  ('vendas_25', 'Máquina de Vendas', '25 vendas realizadas', 'prata', 'total_vendas', 25, 'fa-fire', 120),
  ('nivel_7', 'Guerreiro', 'Alcance o nível 7 (Bronze)', 'prata', 'level', 7, 'fa-shield', 130),
  ('missoes_10', 'Focado', 'Complete 10 missões diárias', 'prata', 'total_missoes', 10, 'fa-bullseye', 140),
  ('xp_5000', 'Acumulador', 'Acumule 5.000 XP', 'prata', 'total_xp', 5000, 'fa-bolt', 150),
  ('conversao_alta', 'Persuasivo', 'Tenha 3 vendas consecutivas', 'prata', 'vendas_consecutivas', 3, 'fa-comments', 160),

  -- Ouro (maestria)
  ('atendimentos_200', 'Veterano', '200 atendimentos finalizados', 'ouro', 'total_atendimentos', 200, 'fa-medal', 210),
  ('vendas_100', 'Top Seller', '100 vendas realizadas', 'ouro', 'total_vendas', 100, 'fa-crown', 220),
  ('nivel_15', 'Elite', 'Alcance o nível 15 (Ouro III)', 'ouro', 'level', 15, 'fa-gem', 230),
  ('missoes_50', 'Implacável', 'Complete 50 missões diárias', 'ouro', 'total_missoes', 50, 'fa-crosshairs', 240),
  ('xp_30000', 'Lenda em Construção', 'Acumule 30.000 XP', 'ouro', 'total_xp', 30000, 'fa-mountain', 250),
  ('vendas_dia_5', 'Dia Perfeito', '5 vendas em um único dia', 'ouro', 'vendas_dia', 5, 'fa-sun', 260),

  -- Lendário (end-game)
  ('atendimentos_500', 'Incansável', '500 atendimentos finalizados', 'lendario', 'total_atendimentos', 500, 'fa-infinity', 310),
  ('vendas_300', 'Hall da Fama', '300 vendas realizadas', 'lendario', 'total_vendas', 300, 'fa-trophy', 320),
  ('nivel_25', 'Grão-Mestre', 'Alcance o nível 25', 'lendario', 'level', 25, 'fa-dragon', 330),
  ('missoes_100', 'Disciplina Total', 'Complete 100 missões diárias', 'lendario', 'total_missoes', 100, 'fa-flag-checkered', 340),
  ('xp_100000', 'Centurião XP', 'Acumule 100.000 XP', 'lendario', 'total_xp', 100000, 'fa-fire-flame-curved', 350),
  ('nivel_45', 'Mítico', 'Alcance o tier Mítico (nível 45)', 'lendario', 'level', 45, 'fa-hat-wizard', 360)
ON CONFLICT (code) DO NOTHING;

-- ─── 5. Engine de avaliação ───
CREATE OR REPLACE FUNCTION public._check_achievements(
  p_vendor_id UUID,
  p_tenant_id UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_total_xp INT;
  v_level INT;
  v_total_atend INT;
  v_total_vendas INT;
  v_total_missoes INT;
  rec RECORD;
  v_current NUMERIC;
BEGIN
  -- Carrega métricas do vendedor em uma passada
  SELECT COALESCE(SUM(points), 0)::int INTO v_total_xp
    FROM public.vendor_xp_events WHERE vendor_id = p_vendor_id;

  v_level := public.vendor_level_from_xp(v_total_xp);

  SELECT COUNT(*)::int INTO v_total_atend
    FROM public.vendor_xp_events
    WHERE vendor_id = p_vendor_id AND event_type = 'atendimento_concluido';

  SELECT COUNT(*)::int INTO v_total_vendas
    FROM public.vendor_xp_events
    WHERE vendor_id = p_vendor_id AND event_type = 'venda_realizada';

  SELECT COUNT(*)::int INTO v_total_missoes
    FROM public.vendor_xp_events
    WHERE vendor_id = p_vendor_id AND event_type = 'missao_completada';

  FOR rec IN
    SELECT code, requirement_type, requirement_value
      FROM public.achievement_definitions
      WHERE code NOT IN (
        SELECT achievement_code FROM public.vendor_achievements WHERE vendor_id = p_vendor_id
      )
  LOOP
    v_current := CASE rec.requirement_type
      WHEN 'total_atendimentos' THEN v_total_atend
      WHEN 'total_vendas' THEN v_total_vendas
      WHEN 'total_xp' THEN v_total_xp
      WHEN 'level' THEN v_level
      WHEN 'total_missoes' THEN v_total_missoes
      ELSE 0
    END;

    IF v_current >= rec.requirement_value THEN
      INSERT INTO public.vendor_achievements(vendor_id, tenant_id, achievement_code)
      VALUES (p_vendor_id, p_tenant_id, rec.code)
      ON CONFLICT (vendor_id, achievement_code) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- ─── 6. RPC vendor: lista conquistas com progresso ───
CREATE OR REPLACE FUNCTION public.get_my_achievements()
RETURNS TABLE(
  code TEXT,
  title TEXT,
  description TEXT,
  tier TEXT,
  icon TEXT,
  requirement_type TEXT,
  requirement_value NUMERIC,
  sort_order INT,
  unlocked BOOLEAN,
  unlocked_at TIMESTAMPTZ,
  progress NUMERIC,
  progress_pct NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
  v_vid UUID;
  v_tid UUID;
  v_total_xp INT;
  v_level INT;
  v_total_atend INT;
  v_total_vendas INT;
  v_total_missoes INT;
BEGIN
  SELECT v.id, v.tenant_id INTO v_vid, v_tid
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid() LIMIT 1;
  IF v_vid IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(e.points), 0)::int INTO v_total_xp
    FROM public.vendor_xp_events e WHERE e.vendor_id = v_vid;
  v_level := public.vendor_level_from_xp(v_total_xp);
  SELECT COUNT(*)::int INTO v_total_atend
    FROM public.vendor_xp_events e WHERE e.vendor_id = v_vid AND e.event_type = 'atendimento_concluido';
  SELECT COUNT(*)::int INTO v_total_vendas
    FROM public.vendor_xp_events e WHERE e.vendor_id = v_vid AND e.event_type = 'venda_realizada';
  SELECT COUNT(*)::int INTO v_total_missoes
    FROM public.vendor_xp_events e WHERE e.vendor_id = v_vid AND e.event_type = 'missao_completada';

  RETURN QUERY
    SELECT
      d.code,
      d.title,
      d.description,
      d.tier,
      d.icon,
      d.requirement_type,
      d.requirement_value,
      d.sort_order,
      (a.id IS NOT NULL) AS unlocked,
      a.unlocked_at,
      LEAST(
        CASE d.requirement_type
          WHEN 'total_atendimentos' THEN v_total_atend
          WHEN 'total_vendas' THEN v_total_vendas
          WHEN 'total_xp' THEN v_total_xp
          WHEN 'level' THEN v_level
          WHEN 'total_missoes' THEN v_total_missoes
          ELSE 0
        END::numeric,
        d.requirement_value
      ) AS progress,
      LEAST(100, ROUND(
        (CASE d.requirement_type
          WHEN 'total_atendimentos' THEN v_total_atend
          WHEN 'total_vendas' THEN v_total_vendas
          WHEN 'total_xp' THEN v_total_xp
          WHEN 'level' THEN v_level
          WHEN 'total_missoes' THEN v_total_missoes
          ELSE 0
        END::numeric / NULLIF(d.requirement_value, 0)) * 100, 1
      )) AS progress_pct
    FROM public.achievement_definitions d
    LEFT JOIN public.vendor_achievements a
      ON a.achievement_code = d.code AND a.vendor_id = v_vid
    ORDER BY d.sort_order ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_achievements() TO authenticated;

-- ─── 7. Plugar _check_achievements no hook de XP ───
-- Re-CREATE _grant_xp_for_attendance com mais um BEGIN/EXCEPTION
CREATE OR REPLACE FUNCTION public._grant_xp_for_attendance(
  p_vendor_id UUID,
  p_tenant_id UUID,
  p_atend_id  UUID,
  p_resultado TEXT,
  p_valor     NUMERIC
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_config  JSONB;
  v_base    INT;
  v_venda   INT;
  v_troca   INT;
BEGIN
  IF p_resultado IS NULL OR p_resultado IN ('cancelar', 'em_andamento') THEN
    RETURN;
  END IF;

  SELECT t.gamification_config INTO v_config
    FROM public.tenants t WHERE t.id = p_tenant_id;

  v_base  := COALESCE((v_config->'xp'->>'atendimento_concluido')::int, 20);
  v_venda := COALESCE((v_config->'xp'->>'venda_realizada')::int, 50);
  v_troca := COALESCE((v_config->'xp'->>'troca_realizada')::int, 15);

  INSERT INTO public.vendor_xp_events(vendor_id, tenant_id, event_type, points, source_id, meta)
    VALUES (p_vendor_id, p_tenant_id, 'atendimento_concluido', v_base, p_atend_id,
            jsonb_build_object('resultado', p_resultado, 'valor', p_valor))
    ON CONFLICT (vendor_id, source_id, event_type) DO NOTHING;

  IF p_resultado = 'venda' THEN
    INSERT INTO public.vendor_xp_events(vendor_id, tenant_id, event_type, points, source_id, meta)
      VALUES (p_vendor_id, p_tenant_id, 'venda_realizada', v_venda, p_atend_id,
              jsonb_build_object('valor', p_valor))
      ON CONFLICT (vendor_id, source_id, event_type) DO NOTHING;
  END IF;

  IF p_resultado = 'troca' THEN
    INSERT INTO public.vendor_xp_events(vendor_id, tenant_id, event_type, points, source_id, meta)
      VALUES (p_vendor_id, p_tenant_id, 'troca_realizada', v_troca, p_atend_id,
              jsonb_build_object('valor', p_valor))
      ON CONFLICT (vendor_id, source_id, event_type) DO NOTHING;
  END IF;

  -- Fase 3: avalia missões ativas
  BEGIN
    PERFORM public._evaluate_missions(p_vendor_id, p_tenant_id, p_atend_id, p_resultado, p_valor);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_evaluate_missions failed for atend %: %', p_atend_id, SQLERRM;
  END;

  -- Fase 4: checa conquistas desbloqueáveis
  BEGIN
    PERFORM public._check_achievements(p_vendor_id, p_tenant_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_check_achievements failed for vendor %: %', p_vendor_id, SQLERRM;
  END;
END;
$$;
