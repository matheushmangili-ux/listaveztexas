-- ============================================
-- minhavez — Fase 2 do roadmap: Sistema de XP + Níveis
-- Aplicada no Supabase em 2026-04-11 como migration "xp_system_phase2"
--
-- Entregáveis:
-- - tabela vendor_xp_events (append-only ledger, idempotente por atendimento)
-- - coluna tenants.gamification_config JSONB (config de pontos por tenant)
-- - fórmulas: vendor_level_from_xp, vendor_xp_for_level
-- - RPCs vendor: get_my_xp(), list_my_xp_events()
-- - RPCs admin: admin_get_xp_config(), admin_set_xp_config()
-- - Hook non-blocking em vendor_finish_attendance via BEGIN/EXCEPTION
--
-- Fórmula: nível = floor(sqrt(xp/150)) → N1=150, N5=3750, N10=15k, N20=60k
-- Defaults: atendimento=20, venda=+50, troca=+15 (vendedor mediano ~550pts/dia)
-- ============================================

-- ─── 1. Coluna de config de gamificação por tenant ───
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS gamification_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── 2. Tabela de eventos XP (ledger append-only) ───
CREATE TABLE IF NOT EXISTS public.vendor_xp_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id  UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  points     INT  NOT NULL CHECK (points >= 0),
  source_id  UUID,
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xp_events_vendor_created
  ON public.vendor_xp_events(vendor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_events_tenant_created
  ON public.vendor_xp_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_events_vendor_type
  ON public.vendor_xp_events(vendor_id, event_type);

-- Idempotência: hook nunca grava 2x pro mesmo (vendor, source, type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_events_idempotent
  ON public.vendor_xp_events(vendor_id, source_id, event_type)
  WHERE source_id IS NOT NULL;

-- ─── 3. RLS: admin do tenant pode ler ranking/histórico; ninguém escreve via anon/auth ───
ALTER TABLE public.vendor_xp_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "xp_events_select" ON public.vendor_xp_events;
CREATE POLICY "xp_events_select" ON public.vendor_xp_events
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- Sem INSERT/UPDATE/DELETE policies: só funções SECURITY DEFINER gravam.

-- ─── 4. Fórmula de nível (IMMUTABLE pra usar em índice se precisar depois) ───
CREATE OR REPLACE FUNCTION public.vendor_level_from_xp(p_xp INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  -- floor(sqrt(xp/150)) — nível 1 em 150 pts (~3 atend), 10 em 15k, 20 em 60k
  SELECT GREATEST(0, FLOOR(SQRT(GREATEST(p_xp, 0)::numeric / 150.0))::int);
$$;

-- Helper inverso: quanto XP pra chegar no próximo nível
CREATE OR REPLACE FUNCTION public.vendor_xp_for_level(p_level INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT (GREATEST(p_level, 0) * GREATEST(p_level, 0) * 150)::int;
$$;

-- ─── 5. RPC consumida pelo vendor mobile: total + nível + progresso ───
CREATE OR REPLACE FUNCTION public.get_my_xp()
RETURNS TABLE(
  total_xp      INT,
  level         INT,
  level_xp      INT,
  next_level_xp INT,
  progress_pct  NUMERIC,
  breakdown     JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
  v_vid UUID;
  v_total INT;
  v_level INT;
  v_cur_level_xp INT;
  v_next_level_xp INT;
BEGIN
  SELECT v.id INTO v_vid FROM public.vendedores v WHERE v.auth_user_id = auth.uid() LIMIT 1;
  IF v_vid IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(e.points), 0)::int INTO v_total
    FROM public.vendor_xp_events e WHERE e.vendor_id = v_vid;

  v_level         := public.vendor_level_from_xp(v_total);
  v_cur_level_xp  := public.vendor_xp_for_level(v_level);
  v_next_level_xp := public.vendor_xp_for_level(v_level + 1);

  RETURN QUERY
    SELECT
      v_total,
      v_level,
      v_cur_level_xp,
      v_next_level_xp,
      CASE
        WHEN v_next_level_xp = v_cur_level_xp THEN 0::numeric
        ELSE ROUND(((v_total - v_cur_level_xp)::numeric / NULLIF(v_next_level_xp - v_cur_level_xp, 0)) * 100, 1)
      END,
      (
        SELECT COALESCE(jsonb_object_agg(x.event_type, x.pts), '{}'::jsonb)
        FROM (
          SELECT e.event_type, SUM(e.points)::int AS pts
            FROM public.vendor_xp_events e
            WHERE e.vendor_id = v_vid
              AND e.created_at >= now() - interval '30 days'
            GROUP BY e.event_type
        ) x
      );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_xp() TO authenticated;

-- ─── 6. RPC: últimos eventos pro sheet "Minha jornada" ───
CREATE OR REPLACE FUNCTION public.list_my_xp_events(p_limit INT DEFAULT 20)
RETURNS TABLE(
  id UUID,
  event_type TEXT,
  points INT,
  meta JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
  v_vid UUID;
BEGIN
  SELECT v.id INTO v_vid FROM public.vendedores v WHERE v.auth_user_id = auth.uid() LIMIT 1;
  IF v_vid IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT e.id, e.event_type, e.points, e.meta, e.created_at
      FROM public.vendor_xp_events e
      WHERE e.vendor_id = v_vid
      ORDER BY e.created_at DESC
      LIMIT GREATEST(p_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_xp_events(INT) TO authenticated;

-- ─── 7. Helper interno: insere XP por atendimento finalizado ───
-- Não é SECURITY DEFINER aqui — é privado, chamado só por vendor_finish_attendance
-- (que já é SECURITY DEFINER). Wrap EXCEPTION fica no caller.
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

  -- XP base por atendimento concluído (qualquer resultado não-cancelado)
  INSERT INTO public.vendor_xp_events(vendor_id, tenant_id, event_type, points, source_id, meta)
    VALUES (p_vendor_id, p_tenant_id, 'atendimento_concluido', v_base, p_atend_id,
            jsonb_build_object('resultado', p_resultado, 'valor', p_valor))
    ON CONFLICT (vendor_id, source_id, event_type) DO NOTHING;

  -- Bônus por venda
  IF p_resultado = 'venda' THEN
    INSERT INTO public.vendor_xp_events(vendor_id, tenant_id, event_type, points, source_id, meta)
      VALUES (p_vendor_id, p_tenant_id, 'venda_realizada', v_venda, p_atend_id,
              jsonb_build_object('valor', p_valor))
      ON CONFLICT (vendor_id, source_id, event_type) DO NOTHING;
  END IF;

  -- Bônus por troca
  IF p_resultado = 'troca' THEN
    INSERT INTO public.vendor_xp_events(vendor_id, tenant_id, event_type, points, source_id, meta)
      VALUES (p_vendor_id, p_tenant_id, 'troca_realizada', v_troca, p_atend_id,
              jsonb_build_object('valor', p_valor))
      ON CONFLICT (vendor_id, source_id, event_type) DO NOTHING;
  END IF;
END;
$$;

-- ─── 8. Hook em vendor_finish_attendance via BEGIN/EXCEPTION (non-blocking) ───
-- IMPORTANTE: esta CREATE OR REPLACE redefine a função original que estava em
-- 13-vendor-mobile.sql. O diff vs. a versão 13 é só o bloco BEGIN/EXCEPTION
-- no final chamando _grant_xp_for_attendance. Qualquer futura edição da
-- função precisa preservar o hook (ou mover o hook pra trigger separado).
CREATE OR REPLACE FUNCTION public.vendor_finish_attendance(
  p_atend_id UUID,
  p_resultado TEXT,
  p_valor NUMERIC DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL,
  p_detalhe TEXT DEFAULT NULL,
  p_produto TEXT DEFAULT NULL,
  p_fidelizado BOOLEAN DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_vendedor_id UUID;
  v_tenant UUID;
  v_setor TEXT;
  v_max_pos INT;
  v_inicio TIMESTAMPTZ;
  v_elapsed INT;
BEGIN
  SELECT v.id, v.tenant_id, v.setor INTO v_vendedor_id, v_tenant, v_setor
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid();

  IF v_vendedor_id IS NULL THEN RAISE EXCEPTION 'Vendedor não vinculado'; END IF;
  IF NOT public.tenant_has_vendor_mobile(v_tenant) THEN
    RAISE EXCEPTION 'Plano não permite';
  END IF;

  SELECT inicio INTO v_inicio FROM public.atendimentos
    WHERE id = p_atend_id AND vendedor_id = v_vendedor_id AND tenant_id = v_tenant;
  IF v_inicio IS NULL THEN
    RAISE EXCEPTION 'Atendimento não encontrado ou não pertence a você';
  END IF;

  v_elapsed := EXTRACT(EPOCH FROM (now() - v_inicio))::int;

  -- Anti-abuso: só cancelar passa antes de 2min
  IF v_elapsed < 120 AND p_resultado NOT IN ('cancelar') THEN
    RAISE EXCEPTION 'Aguarde pelo menos 2 minutos antes de finalizar (decorridos: %s)', v_elapsed;
  END IF;

  IF p_resultado = 'cancelar' THEN
    DELETE FROM public.atendimentos WHERE id = p_atend_id AND tenant_id = v_tenant;
  ELSE
    UPDATE public.atendimentos
      SET fim = now(),
          resultado = p_resultado::atendimento_resultado,
          valor_venda = p_valor,
          motivo_perda = CASE WHEN p_motivo IS NOT NULL THEN p_motivo::motivo_perda ELSE NULL END,
          motivo_detalhe = p_detalhe,
          produto_ruptura = p_produto,
          cliente_fidelizado = COALESCE(p_fidelizado, false)
      WHERE id = p_atend_id AND tenant_id = v_tenant;
  END IF;

  SELECT COALESCE(MAX(posicao_fila), 0) INTO v_max_pos
    FROM public.vendedores
    WHERE tenant_id = v_tenant
      AND COALESCE(setor, 'loja') = COALESCE(v_setor, 'loja')
      AND posicao_fila IS NOT NULL;

  UPDATE public.vendedores
    SET status = 'disponivel'::vendedor_status,
        posicao_fila = v_max_pos + 1,
        updated_at = now()
    WHERE id = v_vendedor_id AND tenant_id = v_tenant;

  -- Hook XP: savepoint implícito via BEGIN/EXCEPTION. Se _grant_xp_for_attendance
  -- falhar, rollback apenas do sub-bloco — atendimento segue finalizado.
  BEGIN
    PERFORM public._grant_xp_for_attendance(v_vendedor_id, v_tenant, p_atend_id, p_resultado, p_valor);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'xp grant failed for atend %: %', p_atend_id, SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_finish_attendance(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ─── 9. RPCs de admin pra editar config de pontos do tenant ───
CREATE OR REPLACE FUNCTION public.admin_get_xp_config()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_tid UUID;
  v_config JSONB;
BEGIN
  v_tid := public.get_my_tenant_id();
  IF v_tid IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;

  SELECT COALESCE(t.gamification_config->'xp', '{}'::jsonb) INTO v_config
    FROM public.tenants t WHERE t.id = v_tid;

  -- Retorna merged com defaults pro dashboard mostrar tudo
  RETURN jsonb_build_object(
    'atendimento_concluido', COALESCE((v_config->>'atendimento_concluido')::int, 20),
    'venda_realizada',       COALESCE((v_config->>'venda_realizada')::int, 50),
    'troca_realizada',       COALESCE((v_config->>'troca_realizada')::int, 15)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_xp_config() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_xp_config(p_config JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tid UUID;
  v_role TEXT;
BEGIN
  v_tid := public.get_my_tenant_id();
  IF v_tid IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;

  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Apenas owner/admin/gerente podem editar pontuação';
  END IF;

  -- Valida que todas as chaves são inteiros não-negativos
  IF NOT (
    (p_config->>'atendimento_concluido') ~ '^\d+$' AND
    (p_config->>'venda_realizada')       ~ '^\d+$' AND
    (p_config->>'troca_realizada')       ~ '^\d+$'
  ) THEN
    RAISE EXCEPTION 'Valores de XP devem ser inteiros não-negativos';
  END IF;

  UPDATE public.tenants
    SET gamification_config = jsonb_set(
          COALESCE(gamification_config, '{}'::jsonb),
          '{xp}',
          jsonb_build_object(
            'atendimento_concluido', (p_config->>'atendimento_concluido')::int,
            'venda_realizada',       (p_config->>'venda_realizada')::int,
            'troca_realizada',       (p_config->>'troca_realizada')::int
          )
        )
    WHERE id = v_tid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_xp_config(JSONB) TO authenticated;
