-- ============================================
-- minhavez — Fase 2b: Tiers de Ranking estilo RPG
-- Aplicada no Supabase em 2026-04-11 como migration "tier_ranking_phase2b"
--
-- Aditivo sobre a Fase 2: não muda vendor_xp_events, vendor_level_from_xp,
-- vendor_finish_attendance. Só adiciona funções IMMUTABLE pra mapear
-- level→tier e estende get_my_xp() pra retornar tier + tier_major.
--
-- Mapa de tiers (20 no total, com sub-divisões I-III nos intermediários):
--   N0-1   Pedra
--   N2-3   Madeira
--   N4-6   Ferro I-III
--   N7-9   Bronze I-III
--   N10-12 Prata I-III
--   N13-15 Ouro I-III
--   N16-18 Platina I-III
--   N19-21 Diamante I-III
--   N22-24 Mestre
--   N25-29 Grão-Mestre
--   N30-34 Rubi
--   N35-44 Lendário
--   N45+   Mítico
--
-- Majors pra fanfarra (mudança de tier maior dispara modal épico):
--   pedra, madeira, ferro, bronze, prata, ouro, platina, diamante,
--   mestre, grao_mestre, rubi, lendario, mitico (13 transições)
-- ============================================

-- ─── 1. Tier completo (code, label, short, major, icon, color, sub_roman) ───
CREATE OR REPLACE FUNCTION public.vendor_tier_from_level(p_level INT)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_level <= 1 THEN
      jsonb_build_object('code','pedra','label','Pedra','short','PED',
        'major_code','pedra','icon','fa-mountain','color','#9ca3af','sub_roman','')
    WHEN p_level <= 3 THEN
      jsonb_build_object('code','madeira','label','Madeira','short','MAD',
        'major_code','madeira','icon','fa-tree','color','#92400e','sub_roman','')
    WHEN p_level = 4 THEN
      jsonb_build_object('code','ferro_1','label','Ferro I','short','FER I',
        'major_code','ferro','icon','fa-shield','color','#64748b','sub_roman','I')
    WHEN p_level = 5 THEN
      jsonb_build_object('code','ferro_2','label','Ferro II','short','FER II',
        'major_code','ferro','icon','fa-shield','color','#64748b','sub_roman','II')
    WHEN p_level = 6 THEN
      jsonb_build_object('code','ferro_3','label','Ferro III','short','FER III',
        'major_code','ferro','icon','fa-shield','color','#64748b','sub_roman','III')
    WHEN p_level = 7 THEN
      jsonb_build_object('code','bronze_1','label','Bronze I','short','BRZ I',
        'major_code','bronze','icon','fa-medal','color','#b8875a','sub_roman','I')
    WHEN p_level = 8 THEN
      jsonb_build_object('code','bronze_2','label','Bronze II','short','BRZ II',
        'major_code','bronze','icon','fa-medal','color','#b8875a','sub_roman','II')
    WHEN p_level = 9 THEN
      jsonb_build_object('code','bronze_3','label','Bronze III','short','BRZ III',
        'major_code','bronze','icon','fa-medal','color','#b8875a','sub_roman','III')
    WHEN p_level = 10 THEN
      jsonb_build_object('code','prata_1','label','Prata I','short','PRA I',
        'major_code','prata','icon','fa-medal','color','#cbd5e1','sub_roman','I')
    WHEN p_level = 11 THEN
      jsonb_build_object('code','prata_2','label','Prata II','short','PRA II',
        'major_code','prata','icon','fa-medal','color','#cbd5e1','sub_roman','II')
    WHEN p_level = 12 THEN
      jsonb_build_object('code','prata_3','label','Prata III','short','PRA III',
        'major_code','prata','icon','fa-medal','color','#cbd5e1','sub_roman','III')
    WHEN p_level = 13 THEN
      jsonb_build_object('code','ouro_1','label','Ouro I','short','OUR I',
        'major_code','ouro','icon','fa-medal','color','#d4a373','sub_roman','I')
    WHEN p_level = 14 THEN
      jsonb_build_object('code','ouro_2','label','Ouro II','short','OUR II',
        'major_code','ouro','icon','fa-medal','color','#d4a373','sub_roman','II')
    WHEN p_level = 15 THEN
      jsonb_build_object('code','ouro_3','label','Ouro III','short','OUR III',
        'major_code','ouro','icon','fa-medal','color','#d4a373','sub_roman','III')
    WHEN p_level = 16 THEN
      jsonb_build_object('code','platina_1','label','Platina I','short','PLA I',
        'major_code','platina','icon','fa-shield-halved','color','#a8c4d4','sub_roman','I')
    WHEN p_level = 17 THEN
      jsonb_build_object('code','platina_2','label','Platina II','short','PLA II',
        'major_code','platina','icon','fa-shield-halved','color','#a8c4d4','sub_roman','II')
    WHEN p_level = 18 THEN
      jsonb_build_object('code','platina_3','label','Platina III','short','PLA III',
        'major_code','platina','icon','fa-shield-halved','color','#a8c4d4','sub_roman','III')
    WHEN p_level = 19 THEN
      jsonb_build_object('code','diamante_1','label','Diamante I','short','DIA I',
        'major_code','diamante','icon','fa-gem','color','#8ea5c9','sub_roman','I')
    WHEN p_level = 20 THEN
      jsonb_build_object('code','diamante_2','label','Diamante II','short','DIA II',
        'major_code','diamante','icon','fa-gem','color','#8ea5c9','sub_roman','II')
    WHEN p_level = 21 THEN
      jsonb_build_object('code','diamante_3','label','Diamante III','short','DIA III',
        'major_code','diamante','icon','fa-gem','color','#8ea5c9','sub_roman','III')
    WHEN p_level <= 24 THEN
      jsonb_build_object('code','mestre','label','Mestre','short','MES',
        'major_code','mestre','icon','fa-crown','color','#b8a8d4','sub_roman','')
    WHEN p_level <= 29 THEN
      jsonb_build_object('code','grao_mestre','label','Grão-Mestre','short','GMS',
        'major_code','grao_mestre','icon','fa-crown','color','#9488b8','sub_roman','')
    WHEN p_level <= 34 THEN
      jsonb_build_object('code','rubi','label','Rubi','short','RUB',
        'major_code','rubi','icon','fa-gem','color','#d47a68','sub_roman','')
    WHEN p_level <= 44 THEN
      jsonb_build_object('code','lendario','label','Lendário','short','LEN',
        'major_code','lendario','icon','fa-trophy','color','#e89b8a','sub_roman','')
    ELSE
      jsonb_build_object('code','mitico','label','Mítico','short','MIT',
        'major_code','mitico','icon','fa-dragon','color','#7fd9a0','sub_roman','')
  END;
$$;

-- ─── 2. Só o major code (pra detectar mudança de tier maior no frontend) ───
CREATE OR REPLACE FUNCTION public.vendor_tier_major_from_level(p_level INT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT public.vendor_tier_from_level(p_level)->>'major_code';
$$;

-- ─── 3. Estende get_my_xp() com tier + tier_major ───
-- DROP obrigatório porque Postgres não permite alterar RETURNS TABLE shape
-- via CREATE OR REPLACE (erro 42P13).
DROP FUNCTION IF EXISTS public.get_my_xp();

CREATE FUNCTION public.get_my_xp()
RETURNS TABLE(
  total_xp      INT,
  level         INT,
  level_xp      INT,
  next_level_xp INT,
  progress_pct  NUMERIC,
  breakdown     JSONB,
  tier          JSONB,
  tier_major    TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
  v_vid UUID;
  v_total INT;
  v_level INT;
  v_cur_level_xp INT;
  v_next_level_xp INT;
  v_tier JSONB;
  v_tier_major TEXT;
BEGIN
  SELECT v.id INTO v_vid FROM public.vendedores v WHERE v.auth_user_id = auth.uid() LIMIT 1;
  IF v_vid IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(e.points), 0)::int INTO v_total
    FROM public.vendor_xp_events e WHERE e.vendor_id = v_vid;

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
              AND e.created_at >= now() - interval '30 days'
            GROUP BY e.event_type
        ) x
      ),
      v_tier,
      v_tier_major;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_xp() TO authenticated;
