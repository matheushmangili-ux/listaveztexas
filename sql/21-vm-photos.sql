-- ============================================
-- minhavez — Fase 6: VM Photos (Visual Merchandising)
--
-- vm_submissions: fotos de VM com workflow de aprovação
-- RPCs: submit, list own, gallery, admin queue, admin review
-- XP concedido ao aprovar (idempotente)
--
-- APLICAR VIA SUPABASE SQL EDITOR
-- Storage bucket "vm-photos" deve ser criado via Dashboard (public read)
-- ============================================

-- ─── 1. Tabela de submissões ───
CREATE TABLE IF NOT EXISTS public.vm_submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  photo_url   TEXT NOT NULL,
  photo_path  TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('vitrine','gondola','display','prateleira','checkout','fachada','outro')),
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  feedback    TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  xp_granted  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vm_submissions_tenant_status
  ON public.vm_submissions(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vm_submissions_vendor
  ON public.vm_submissions(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vm_submissions_gallery
  ON public.vm_submissions(tenant_id, created_at DESC) WHERE status = 'approved';

-- ─── 2. RLS ───
ALTER TABLE public.vm_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vm_submissions_select" ON public.vm_submissions;
CREATE POLICY "vm_submissions_select" ON public.vm_submissions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- ─── 3. RPC: vendedor submete foto ───
CREATE OR REPLACE FUNCTION public.vendor_submit_vm(
  p_photo_url TEXT,
  p_photo_path TEXT,
  p_category TEXT,
  p_description TEXT DEFAULT ''
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID := public._vendor_self_id();
  v_tenant UUID;
  v_sub_id UUID;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Vendedor não vinculado a esta conta';
  END IF;
  SELECT tenant_id INTO v_tenant FROM public.vendedores WHERE id = v_id;
  IF NOT public.tenant_has_vendor_mobile(v_tenant) THEN
    RAISE EXCEPTION 'Plano não permite';
  END IF;
  IF p_category NOT IN ('vitrine','gondola','display','prateleira','checkout','fachada','outro') THEN
    RAISE EXCEPTION 'Categoria inválida: %', p_category;
  END IF;

  INSERT INTO public.vm_submissions (vendor_id, tenant_id, photo_url, photo_path, category, description)
    VALUES (v_id, v_tenant, p_photo_url, p_photo_path, p_category, COALESCE(p_description, ''))
    RETURNING id INTO v_sub_id;

  RETURN v_sub_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.vendor_submit_vm(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 4. RPC: minhas submissões ───
CREATE OR REPLACE FUNCTION public.vendor_get_my_vms(p_limit INT DEFAULT 20)
RETURNS TABLE(
  id UUID,
  photo_url TEXT,
  category TEXT,
  description TEXT,
  status TEXT,
  feedback TEXT,
  created_at TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  #variable_conflict use_column
  SELECT s.id, s.photo_url, s.category, s.description, s.status, s.feedback, s.created_at
    FROM public.vm_submissions s
    WHERE s.vendor_id = public._vendor_self_id()
    ORDER BY s.created_at DESC
    LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.vendor_get_my_vms(INT) TO authenticated;

-- ─── 5. RPC: galeria de aprovados (todo o tenant) ───
CREATE OR REPLACE FUNCTION public.get_vm_gallery(p_limit INT DEFAULT 30, p_offset INT DEFAULT 0)
RETURNS TABLE(
  id UUID,
  photo_url TEXT,
  category TEXT,
  description TEXT,
  created_at TIMESTAMPTZ,
  vendor_nome TEXT,
  vendor_apelido TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  #variable_conflict use_column
  SELECT s.id, s.photo_url, s.category, s.description, s.created_at,
         v.nome, v.apelido
    FROM public.vm_submissions s
    JOIN public.vendedores v ON v.id = s.vendor_id
    WHERE s.tenant_id = public.get_my_tenant_id()
      AND s.status = 'approved'
    ORDER BY s.created_at DESC
    LIMIT p_limit OFFSET p_offset;
$$;
GRANT EXECUTE ON FUNCTION public.get_vm_gallery(INT, INT) TO authenticated;

-- ─── 6. RPC: fila de aprovação (admin) ───
CREATE OR REPLACE FUNCTION public.admin_get_vm_queue(
  p_status TEXT DEFAULT 'pending',
  p_limit INT DEFAULT 50
) RETURNS TABLE(
  id UUID,
  photo_url TEXT,
  category TEXT,
  description TEXT,
  status TEXT,
  feedback TEXT,
  created_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  vendor_nome TEXT,
  vendor_apelido TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_tenant UUID := public.get_my_tenant_id();
  v_role TEXT;
BEGIN
  v_role := (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'user_role');
  IF v_role NOT IN ('owner','admin','gerente') THEN
    RAISE EXCEPTION 'Apenas admin/gerente podem acessar a fila de VM';
  END IF;

  RETURN QUERY
    SELECT s.id, s.photo_url, s.category, s.description, s.status, s.feedback,
           s.created_at, s.reviewed_at, v.nome, v.apelido
      FROM public.vm_submissions s
      JOIN public.vendedores v ON v.id = s.vendor_id
      WHERE s.tenant_id = v_tenant AND s.status = p_status
      ORDER BY s.created_at DESC
      LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_vm_queue(TEXT, INT) TO authenticated;

-- ─── 7. RPC: admin aprova/rejeita + grant XP ───
CREATE OR REPLACE FUNCTION public.admin_review_vm(
  p_submission_id UUID,
  p_status TEXT,
  p_feedback TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant UUID := public.get_my_tenant_id();
  v_role TEXT;
  v_vendor_id UUID;
  v_category TEXT;
  v_xp_granted BOOLEAN;
  v_xp_points INT;
  v_config JSONB;
BEGIN
  v_role := (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'user_role');
  IF v_role NOT IN ('owner','admin','gerente') THEN
    RAISE EXCEPTION 'Apenas admin/gerente podem revisar VM';
  END IF;
  IF p_status NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  SELECT vendor_id, category, xp_granted
    INTO v_vendor_id, v_category, v_xp_granted
    FROM public.vm_submissions
    WHERE id = p_submission_id AND tenant_id = v_tenant;
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Submissão não encontrada';
  END IF;

  UPDATE public.vm_submissions
    SET status = p_status,
        feedback = CASE WHEN p_status = 'rejected' THEN COALESCE(p_feedback, '') ELSE feedback END,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = p_submission_id AND tenant_id = v_tenant;

  -- Grant XP on approval (idempotent)
  IF p_status = 'approved' AND NOT v_xp_granted THEN
    SELECT COALESCE(gamification_config, '{}'::jsonb) INTO v_config
      FROM public.tenants WHERE id = v_tenant;
    v_xp_points := COALESCE((v_config->'xp'->>'vm_aprovado')::int, 30);

    INSERT INTO public.vendor_xp_events(vendor_id, tenant_id, event_type, points, source_id, meta)
      VALUES (v_vendor_id, v_tenant, 'vm_aprovado', v_xp_points, p_submission_id,
              jsonb_build_object('category', v_category))
      ON CONFLICT (vendor_id, source_id, event_type) DO NOTHING;

    UPDATE public.vm_submissions SET xp_granted = true WHERE id = p_submission_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_review_vm(UUID, TEXT, TEXT) TO authenticated;
