-- ============================================
-- minhavez — Comunicados/Anúncios (Fase 1 do roadmap gamificação)
-- Suporta tipos: comunicado, corrida, evento, treinamento
-- Vendedor lê via RPCs SECURITY DEFINER; admin gerencia via RLS de tenant_id
-- Aplicada no Supabase em 2026-04-11 como migration "announcements_phase1"
-- ============================================

-- ─── 1. Enum de tipos ───
DO $$ BEGIN
  CREATE TYPE public.announcement_type AS ENUM ('comunicado','corrida','evento','treinamento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Tabela principal ───
CREATE TABLE IF NOT EXISTS public.tenant_announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type         public.announcement_type NOT NULL DEFAULT 'comunicado',
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  icon         TEXT,                       -- emoji ou classe fa-*
  color        TEXT,                       -- hex opcional pra destaque
  urgent       BOOLEAN NOT NULL DEFAULT false,  -- dispara push
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  archived_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_announcements_tenant_active
  ON public.tenant_announcements(tenant_id, published_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_type
  ON public.tenant_announcements(tenant_id, type, published_at DESC);

-- ─── 3. Leituras (tracking por vendedor) ───
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.tenant_announcements(id) ON DELETE CASCADE,
  vendedor_id     UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, vendedor_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reads_ann
  ON public.announcement_reads(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_vendedor
  ON public.announcement_reads(vendedor_id, read_at DESC);

-- ─── 4. RLS (admin do tenant) ───
ALTER TABLE public.tenant_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select" ON public.tenant_announcements;
CREATE POLICY "announcements_select" ON public.tenant_announcements
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "announcements_insert" ON public.tenant_announcements;
CREATE POLICY "announcements_insert" ON public.tenant_announcements
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "announcements_update" ON public.tenant_announcements;
CREATE POLICY "announcements_update" ON public.tenant_announcements
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "announcements_delete" ON public.tenant_announcements;
CREATE POLICY "announcements_delete" ON public.tenant_announcements
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "announcement_reads_select_own_tenant" ON public.announcement_reads;
CREATE POLICY "announcement_reads_select_own_tenant" ON public.announcement_reads
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ─── 5. RPCs consumidas pelo vendor mobile (SECURITY DEFINER) ───

-- Lista comunicados ativos do tenant do vendedor com flag de lido
CREATE OR REPLACE FUNCTION public.list_announcements(p_limit INT DEFAULT 20)
RETURNS TABLE(
  id UUID,
  type TEXT,
  title TEXT,
  body TEXT,
  icon TEXT,
  color TEXT,
  urgent BOOLEAN,
  metadata JSONB,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_read BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
  v_vid UUID;
  v_tid UUID;
BEGIN
  SELECT v.id, v.tenant_id INTO v_vid, v_tid
  FROM public.vendedores v
  WHERE v.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_vid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      a.id,
      a.type::text,
      a.title,
      a.body,
      a.icon,
      a.color,
      a.urgent,
      a.metadata,
      a.published_at,
      a.expires_at,
      (r.id IS NOT NULL) AS is_read
    FROM public.tenant_announcements a
    LEFT JOIN public.announcement_reads r
      ON r.announcement_id = a.id AND r.vendedor_id = v_vid
    WHERE a.tenant_id = v_tid
      AND a.archived_at IS NULL
      AND (a.expires_at IS NULL OR a.expires_at > now())
      AND a.published_at <= now()
    ORDER BY a.urgent DESC, a.published_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_announcements(INT) TO authenticated;

-- Marca comunicado como lido pelo vendedor caller
CREATE OR REPLACE FUNCTION public.mark_announcement_read(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
  v_vid UUID;
  v_tid UUID;
  v_ann_tid UUID;
BEGIN
  SELECT v.id, v.tenant_id INTO v_vid, v_tid
  FROM public.vendedores v
  WHERE v.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_vid IS NULL THEN
    RAISE EXCEPTION 'no vendor for caller';
  END IF;

  SELECT a.tenant_id INTO v_ann_tid
  FROM public.tenant_announcements a
  WHERE a.id = p_id;

  IF v_ann_tid IS NULL OR v_ann_tid <> v_tid THEN
    RAISE EXCEPTION 'announcement not visible to caller';
  END IF;

  INSERT INTO public.announcement_reads(announcement_id, vendedor_id, tenant_id)
  VALUES (p_id, v_vid, v_tid)
  ON CONFLICT (announcement_id, vendedor_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_announcement_read(UUID) TO authenticated;

-- Admin-side: contagem de leituras por comunicado do tenant caller
CREATE OR REPLACE FUNCTION public.admin_announcement_read_stats(p_id UUID)
RETURNS TABLE(total_vendedores INT, total_reads INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_tid UUID;
  v_ann_tid UUID;
BEGIN
  v_tid := public.get_my_tenant_id();
  SELECT tenant_id INTO v_ann_tid FROM public.tenant_announcements WHERE id = p_id;
  IF v_ann_tid IS NULL OR v_ann_tid <> v_tid THEN
    RAISE EXCEPTION 'announcement not accessible';
  END IF;

  RETURN QUERY
    SELECT
      (SELECT COUNT(*)::INT FROM public.vendedores WHERE tenant_id = v_tid AND auth_user_id IS NOT NULL),
      (SELECT COUNT(*)::INT FROM public.announcement_reads WHERE announcement_id = p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_announcement_read_stats(UUID) TO authenticated;

-- ─── 6. Realtime pros comunicados aparecerem instantaneamente no vendor ───
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_announcements;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN others THEN NULL; END $$;
