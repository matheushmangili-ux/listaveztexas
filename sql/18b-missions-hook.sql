-- ============================================
-- minhavez — Fase 3 hook: _evaluate_missions dentro do _grant_xp_for_attendance
-- Aplicada no Supabase em 2026-04-11 como migration "missions_phase3_hook"
--
-- _evaluate_missions percorre todos os templates ativos no dia (respeitando
-- active_days bitmask) e atualiza/cria vendor_mission_progress baseado no
-- goal_type. Quando progresso bate goal_value pela primeira vez, marca
-- completed_at e concede XP via vendor_xp_events (idempotente via UNIQUE
-- index source_id).
--
-- O chamador (_grant_xp_for_attendance) envolve a chamada em BEGIN/EXCEPTION
-- WHEN OTHERS pra garantir que falha em missões não rollbackea o XP base
-- do atendimento (savepoint implícito do PL/pgSQL).
-- ============================================

CREATE OR REPLACE FUNCTION public._evaluate_missions(
  p_vendor_id UUID,
  p_tenant_id UUID,
  p_atend_id  UUID,
  p_resultado TEXT,
  p_valor     NUMERIC
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_today DATE;
  v_dow INT;
  v_bit INT;
  v_canal UUID;
  rec RECORD;
  v_delta NUMERIC;
  v_new_progress NUMERIC;
  v_progress_id UUID;
  v_was_completed BOOLEAN;
BEGIN
  IF p_resultado IN ('cancelar','em_andamento') THEN RETURN; END IF;

  v_today := public._today_for_tenant(p_tenant_id);
  v_dow   := EXTRACT(DOW FROM v_today)::int;
  v_bit   := 1 << v_dow;

  -- Carrega canal do atendimento uma vez (pode ser NULL)
  SELECT canal_origem_id INTO v_canal FROM public.atendimentos WHERE id = p_atend_id;

  FOR rec IN
    SELECT id, goal_type, goal_value, reward_xp, meta
      FROM public.mission_templates
      WHERE tenant_id = p_tenant_id
        AND active = true
        AND (active_days & v_bit) <> 0
  LOOP
    v_delta := 0;
    IF rec.goal_type = 'atendimentos_count' THEN
      v_delta := 1;
    ELSIF rec.goal_type = 'vendas_count' AND p_resultado = 'venda' THEN
      v_delta := 1;
    ELSIF rec.goal_type = 'vendas_canal_count' AND p_resultado = 'venda' THEN
      IF v_canal IS NOT NULL
         AND rec.meta->>'canal_id' IS NOT NULL
         AND v_canal::text = (rec.meta->>'canal_id') THEN
        v_delta := 1;
      END IF;
    ELSIF rec.goal_type = 'valor_vendido_total' AND p_resultado = 'venda' THEN
      v_delta := COALESCE(p_valor, 0);
    END IF;

    CONTINUE WHEN v_delta = 0;

    INSERT INTO public.vendor_mission_progress(vendor_id, tenant_id, template_id, date, progress)
    VALUES (p_vendor_id, p_tenant_id, rec.id, v_today, v_delta)
    ON CONFLICT (vendor_id, template_id, date)
    DO UPDATE SET progress = public.vendor_mission_progress.progress + EXCLUDED.progress
    RETURNING id, progress, (completed_at IS NOT NULL) INTO v_progress_id, v_new_progress, v_was_completed;

    IF NOT v_was_completed AND v_new_progress >= rec.goal_value THEN
      UPDATE public.vendor_mission_progress
        SET completed_at = now()
        WHERE id = v_progress_id AND completed_at IS NULL;

      INSERT INTO public.vendor_xp_events(vendor_id, tenant_id, event_type, points, source_id, meta)
      VALUES (
        p_vendor_id, p_tenant_id, 'missao_completada',
        rec.reward_xp, v_progress_id,
        jsonb_build_object(
          'template_id', rec.id,
          'title_at_grant', (SELECT title FROM public.mission_templates WHERE id = rec.id)
        )
      )
      ON CONFLICT (vendor_id, source_id, event_type) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Re-CREATE do helper de XP adicionando chamada non-blocking ao _evaluate_missions.
-- Manter compatível com a versão anterior — só adiciona o bloco final.
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

  BEGIN
    PERFORM public._evaluate_missions(p_vendor_id, p_tenant_id, p_atend_id, p_resultado, p_valor);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_evaluate_missions failed for atend %: %', p_atend_id, SQLERRM;
  END;
END;
$$;
