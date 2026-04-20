-- 43-subpage-rpcs.sql
-- 5 RPCs novas pra alimentar dashboard-vendedor.html e dashboard-operacional.html
-- (novas sub-páginas do redesign Stripe-style, via sidebar dropdown).
--
-- Todas SECURITY DEFINER com SET search_path=public,extensions (advisor 0011
-- mutable fix), GRANT EXECUTE TO authenticated, tenant-scoped via
-- get_my_tenant_id().

-- ─────────────────────────────────────────────────────────────
-- 1) get_seller_hourly_heatmap
-- Retorna atendimentos por vendedor × hora do dia (0-23)
-- Usado em: dashboard-vendedor.html zona "heat map hora × vendedor"
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_seller_hourly_heatmap(
  p_inicio timestamptz,
  p_fim timestamptz
)
RETURNS TABLE (
  vendedor_id uuid,
  vendedor_nome text,
  hora int,
  atendimentos int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    v.id AS vendedor_id,
    COALESCE(v.apelido, v.nome) AS vendedor_nome,
    EXTRACT(HOUR FROM a.inicio AT TIME ZONE COALESCE(t.timezone, 'America/Sao_Paulo'))::int AS hora,
    COUNT(a.id)::int AS atendimentos
  FROM public.atendimentos a
  JOIN public.vendedores v ON v.id = a.vendedor_id
  LEFT JOIN public.tenants t ON t.id = a.tenant_id
  WHERE a.tenant_id = public.get_my_tenant_id()
    AND a.inicio >= p_inicio
    AND a.inicio < p_fim
    AND a.resultado <> 'em_andamento'
    AND v.ativo = true
  GROUP BY v.id, v.apelido, v.nome, hora
  ORDER BY v.nome, hora;
$$;
GRANT EXECUTE ON FUNCTION public.get_seller_hourly_heatmap(timestamptz, timestamptz) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) get_seller_comparison
-- Retorna métricas de 2 vendedores side-by-side para o comparador 2-up
-- Usado em: dashboard-vendedor.html zona "comparador radar chart"
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_seller_comparison(
  p_vendedor_a uuid,
  p_vendedor_b uuid,
  p_inicio timestamptz,
  p_fim timestamptz
)
RETURNS TABLE (
  vendedor_id uuid,
  nome text,
  apelido text,
  foto_url text,
  total_atendimentos int,
  total_vendas int,
  total_nao_convertido int,
  taxa_conversao numeric,
  tempo_medio_min numeric,
  total_fidelizados int,
  total_xp bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH v AS (
    SELECT * FROM public.vendedores
    WHERE id IN (p_vendedor_a, p_vendedor_b)
      AND tenant_id = public.get_my_tenant_id()
  ),
  a AS (
    SELECT
      vendedor_id,
      COUNT(*) AS total_atend,
      COUNT(*) FILTER (WHERE resultado = 'venda') AS total_vendas,
      COUNT(*) FILTER (WHERE resultado = 'sem_venda') AS total_nao,
      COUNT(*) FILTER (WHERE cliente_fidelizado = true) AS total_fidel,
      AVG(EXTRACT(EPOCH FROM (fim - inicio))/60.0) FILTER (WHERE fim IS NOT NULL) AS tempo_med
    FROM public.atendimentos
    WHERE tenant_id = public.get_my_tenant_id()
      AND vendedor_id IN (p_vendedor_a, p_vendedor_b)
      AND inicio >= p_inicio AND inicio < p_fim
      AND resultado <> 'em_andamento'
    GROUP BY vendedor_id
  ),
  xp AS (
    -- vendor_xp_events usa colunas vendor_id + points (não vendedor_id/xp_amount)
    SELECT vendor_id AS vendedor_id, SUM(points)::bigint AS xp
    FROM public.vendor_xp_events
    WHERE tenant_id = public.get_my_tenant_id()
      AND vendor_id IN (p_vendedor_a, p_vendedor_b)
      AND created_at >= p_inicio AND created_at < p_fim
    GROUP BY vendor_id
  )
  SELECT
    v.id,
    v.nome,
    v.apelido,
    v.foto_url,
    COALESCE(a.total_atend, 0)::int,
    COALESCE(a.total_vendas, 0)::int,
    COALESCE(a.total_nao, 0)::int,
    CASE WHEN COALESCE(a.total_atend, 0) > 0
      THEN ROUND((a.total_vendas::numeric / a.total_atend) * 100, 1)
      ELSE 0
    END AS taxa_conversao,
    COALESCE(ROUND(a.tempo_med::numeric, 1), 0) AS tempo_medio_min,
    COALESCE(a.total_fidel, 0)::int,
    COALESCE(xp.xp, 0)::bigint
  FROM v
  LEFT JOIN a ON a.vendedor_id = v.id
  LEFT JOIN xp ON xp.vendedor_id = v.id;
$$;
GRANT EXECUTE ON FUNCTION public.get_seller_comparison(uuid, uuid, timestamptz, timestamptz) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3) get_pause_reasons
-- Agrupa pausas do período por motivo: count, duração total e média
-- Usado em: dashboard-operacional.html zona "motivos de pausa donut"
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pause_reasons(
  p_inicio timestamptz,
  p_fim timestamptz
)
RETURNS TABLE (
  motivo text,
  total int,
  duracao_total_min numeric,
  duracao_media_min numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    COALESCE(p.motivo, 'sem_motivo') AS motivo,
    COUNT(*)::int AS total,
    ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(p.fim, now()) - p.inicio))/60.0)::numeric, 1) AS duracao_total_min,
    ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(p.fim, now()) - p.inicio))/60.0)::numeric, 1) AS duracao_media_min
  FROM public.pausas p
  WHERE p.tenant_id = public.get_my_tenant_id()
    AND p.inicio >= p_inicio
    AND p.inicio < p_fim
  GROUP BY COALESCE(p.motivo, 'sem_motivo')
  ORDER BY total DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_pause_reasons(timestamptz, timestamptz) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4) get_rupture_impact
-- Top produtos com mais rupturas + impacto (count de atendimentos perdidos
-- por motivo=ruptura). Usa ruptura_tipo_id (+ marca/cor) OU produto_ruptura
-- (text legacy) com prioridade no estruturado.
-- Usado em: dashboard-operacional.html zona "top 10 rupturas impacto"
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_rupture_impact(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  produto text,
  tipo_id uuid,
  marca_nome text,
  total_rupturas int,
  ultima_ocorrencia timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    COALESCE(
      CASE
        WHEN a.ruptura_tipo_id IS NOT NULL THEN
          COALESCE(rt.nome, '???') ||
          CASE WHEN a.ruptura_tamanho IS NOT NULL THEN ' · ' || a.ruptura_tamanho ELSE '' END
        ELSE
          NULLIF(trim(a.produto_ruptura), '')
      END,
      'Não especificado'
    ) AS produto,
    a.ruptura_tipo_id AS tipo_id,
    rm.nome AS marca_nome,
    COUNT(*)::int AS total_rupturas,
    MAX(a.inicio) AS ultima_ocorrencia
  FROM public.atendimentos a
  LEFT JOIN public.ruptura_tipos rt ON rt.id = a.ruptura_tipo_id
  LEFT JOIN public.ruptura_marcas rm ON rm.id = a.ruptura_marca_id
  WHERE a.tenant_id = public.get_my_tenant_id()
    AND a.inicio >= p_inicio
    AND a.inicio < p_fim
    AND a.motivo_perda = 'ruptura'
  GROUP BY produto, a.ruptura_tipo_id, rm.nome
  ORDER BY total_rupturas DESC, ultima_ocorrencia DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_rupture_impact(timestamptz, timestamptz, int) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5) get_shift_timeline
-- Retorna eventos (atendimentos + pausas) do período como timeline,
-- pra renderizar gantt-like mostrando o "ritmo" do turno.
-- Usado em: dashboard-operacional.html zona "timeline do turno"
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_shift_timeline(
  p_inicio timestamptz,
  p_fim timestamptz
)
RETURNS TABLE (
  vendedor_id uuid,
  vendedor_nome text,
  evento_tipo text,  -- 'atendimento' | 'pausa'
  evento_motivo text,  -- motivo_perda (atend) | motivo (pausa)
  inicio timestamptz,
  fim timestamptz,
  duracao_min numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  -- Atendimentos
  SELECT
    v.id AS vendedor_id,
    COALESCE(v.apelido, v.nome) AS vendedor_nome,
    'atendimento'::text AS evento_tipo,
    COALESCE(a.resultado::text, '') AS evento_motivo,
    a.inicio,
    a.fim,
    ROUND(EXTRACT(EPOCH FROM (COALESCE(a.fim, now()) - a.inicio))/60.0, 1) AS duracao_min
  FROM public.atendimentos a
  JOIN public.vendedores v ON v.id = a.vendedor_id
  WHERE a.tenant_id = public.get_my_tenant_id()
    AND a.inicio >= p_inicio
    AND a.inicio < p_fim
    AND a.resultado <> 'em_andamento'

  UNION ALL

  -- Pausas
  SELECT
    v.id AS vendedor_id,
    COALESCE(v.apelido, v.nome) AS vendedor_nome,
    'pausa'::text AS evento_tipo,
    COALESCE(p.motivo, '') AS evento_motivo,
    p.inicio,
    p.fim,
    ROUND(EXTRACT(EPOCH FROM (COALESCE(p.fim, now()) - p.inicio))/60.0, 1) AS duracao_min
  FROM public.pausas p
  JOIN public.vendedores v ON v.id = p.vendedor_id
  WHERE p.tenant_id = public.get_my_tenant_id()
    AND p.inicio >= p_inicio
    AND p.inicio < p_fim

  ORDER BY vendedor_nome, inicio;
$$;
GRANT EXECUTE ON FUNCTION public.get_shift_timeline(timestamptz, timestamptz) TO authenticated;
