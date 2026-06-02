-- ─────────────────────────────────────────────────────────────────────────
-- 56-xp-app-baseline.sql
-- "Baseline no app": o nível mostrado no app do vendedor passa a contar só o XP
-- ganho A PARTIR de um marco (xp_app_since), não o histórico todo. Assim o time
-- (que tem meses de atendimento via tablet → XP alto) recomeça a jornada do app
-- do zero no lançamento, SEM apagar o ledger (relatórios all-time intactos).
--
-- vendedores.xp_app_since DEFAULT now():
--   - ADD COLUMN seta os existentes pro instante da migração (baseline do time).
--   - novos vendedores nascem com xp_app_since = sua criação (fresh natural).
-- get_my_xp filtra vendor_xp_events.created_at >= xp_app_since (total + breakdown).
-- Return shape inalterado → o app não muda.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.vendedores ADD COLUMN IF NOT EXISTS xp_app_since TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION public.get_my_xp()
RETURNS TABLE(total_xp integer, level integer, level_xp integer, next_level_xp integer, progress_pct numeric, breakdown jsonb, tier jsonb, tier_major text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
DECLARE
  v_vid UUID;
  v_since TIMESTAMPTZ;
  v_total INT;
  v_level INT;
  v_cur_level_xp INT;
  v_next_level_xp INT;
  v_tier JSONB;
  v_tier_major TEXT;
BEGIN
  SELECT v.id, v.xp_app_since INTO v_vid, v_since
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid() LIMIT 1;
  IF v_vid IS NULL THEN RETURN; END IF;
  v_since := COALESCE(v_since, '-infinity'::timestamptz);

  SELECT COALESCE(SUM(e.points), 0)::int INTO v_total
    FROM public.vendor_xp_events e
    WHERE e.vendor_id = v_vid AND e.created_at >= v_since;

  v_level         := public.vendor_level_from_xp(v_total);
  v_cur_level_xp  := public.vendor_xp_for_level(v_level);
  v_next_level_xp := public.vendor_xp_for_level(v_level + 1);
  v_tier          := public.vendor_tier_from_level(v_level);
  v_tier_major    := v_tier->>'major_code';

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
              AND e.created_at >= GREATEST(v_since, now() - interval '30 days')
            GROUP BY e.event_type
        ) x
      ),
      v_tier,
      v_tier_major;
END;
$function$;
