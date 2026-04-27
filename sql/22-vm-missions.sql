-- ============================================
-- minhavez — Fase 6b: VM Missions (Tarefas bidirecionais)
--
-- vm_tasks: tarefas criadas pelo admin com briefing
-- vm_task_references: fotos de referência (1-5)
-- vm_task_checklist: itens do checklist
-- vm_task_assignments: assignment por vendedor (status workflow)
-- vm_task_responses: fotos + checklist do vendedor
--
-- APLICAR VIA SUPABASE SQL EDITOR
-- ============================================

-- ─── 1. Tabelas ───

CREATE TABLE IF NOT EXISTS public.vm_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL CHECK (category IN ('vitrine','gondola','display','prateleira','checkout','fachada','outro')),
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgente')),
  due_at      TIMESTAMPTZ,
  reward_xp   INT NOT NULL DEFAULT 30 CHECK (reward_xp >= 0),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vm_task_references (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.vm_tasks(id) ON DELETE CASCADE,
  photo_url  TEXT NOT NULL,
  photo_path TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.vm_task_checklist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES public.vm_tasks(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.vm_task_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES public.vm_tasks(id) ON DELETE CASCADE,
  vendor_id    UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','in_progress','submitted','approved','rejected','revision')),
  feedback     TEXT,
  reviewed_by  UUID REFERENCES auth.users(id),
  reviewed_at  TIMESTAMPTZ,
  started_at   TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  xp_granted   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS public.vm_task_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     UUID NOT NULL REFERENCES public.vm_task_assignments(id) ON DELETE CASCADE,
  photo_url         TEXT,
  photo_path        TEXT,
  checklist_item_id UUID REFERENCES public.vm_task_checklist(id),
  checked           BOOLEAN DEFAULT false,
  note              TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Indexes ───

CREATE INDEX IF NOT EXISTS idx_vm_tasks_tenant
  ON public.vm_tasks(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vm_task_assignments_vendor
  ON public.vm_task_assignments(tenant_id, vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_vm_task_assignments_task
  ON public.vm_task_assignments(task_id, status);
CREATE INDEX IF NOT EXISTS idx_vm_task_responses_assignment
  ON public.vm_task_responses(assignment_id);

-- ─── 3. RLS ───

ALTER TABLE public.vm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vm_task_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vm_task_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vm_task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vm_task_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vm_tasks_select" ON public.vm_tasks
  FOR SELECT TO authenticated USING (tenant_id = public.get_my_tenant_id());
CREATE POLICY "vm_task_refs_select" ON public.vm_task_references
  FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM public.vm_tasks WHERE tenant_id = public.get_my_tenant_id()));
CREATE POLICY "vm_task_checklist_select" ON public.vm_task_checklist
  FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM public.vm_tasks WHERE tenant_id = public.get_my_tenant_id()));
CREATE POLICY "vm_task_assignments_select" ON public.vm_task_assignments
  FOR SELECT TO authenticated USING (tenant_id = public.get_my_tenant_id());
CREATE POLICY "vm_task_responses_select" ON public.vm_task_responses
  FOR SELECT TO authenticated
  USING (assignment_id IN (SELECT id FROM public.vm_task_assignments WHERE tenant_id = public.get_my_tenant_id()));

-- ─── 4. RPC: admin cria tarefa ───

CREATE OR REPLACE FUNCTION public.admin_create_vm_task(p_payload JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant UUID := public.get_my_tenant_id();
  v_role TEXT;
  v_task_id UUID;
  v_ref JSONB;
  v_item JSONB;
  v_vendor RECORD;
  v_idx INT;
BEGIN
  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner','admin','gerente') THEN
    RAISE EXCEPTION 'Apenas admin/gerente podem criar tarefas VM';
  END IF;

  INSERT INTO public.vm_tasks (tenant_id, title, description, category, priority, due_at, reward_xp, created_by)
    VALUES (
      v_tenant,
      p_payload->>'title',
      COALESCE(p_payload->>'description', ''),
      p_payload->>'category',
      COALESCE(p_payload->>'priority', 'normal'),
      CASE WHEN p_payload->>'due_at' IS NOT NULL
           THEN (p_payload->>'due_at')::timestamptz ELSE NULL END,
      COALESCE((p_payload->>'reward_xp')::int, 30),
      auth.uid()
    )
    RETURNING id INTO v_task_id;

  -- Fotos de referência
  v_idx := 0;
  IF p_payload->'references' IS NOT NULL AND jsonb_array_length(p_payload->'references') > 0 THEN
    FOR v_ref IN SELECT * FROM jsonb_array_elements(p_payload->'references')
    LOOP
      INSERT INTO public.vm_task_references (task_id, photo_url, photo_path, sort_order)
        VALUES (v_task_id, v_ref->>'photo_url', v_ref->>'photo_path', v_idx);
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  -- Checklist items
  v_idx := 0;
  IF p_payload->'checklist' IS NOT NULL AND jsonb_array_length(p_payload->'checklist') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'checklist')
    LOOP
      INSERT INTO public.vm_task_checklist (task_id, label, sort_order)
        VALUES (v_task_id, v_item->>'label', v_idx);
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  -- Assignments pra todos vendedores ativos do tenant
  FOR v_vendor IN
    SELECT id FROM public.vendedores
      WHERE tenant_id = v_tenant AND ativo = true
  LOOP
    INSERT INTO public.vm_task_assignments (task_id, vendor_id, tenant_id)
      VALUES (v_task_id, v_vendor.id, v_tenant)
      ON CONFLICT (task_id, vendor_id) DO NOTHING;
  END LOOP;

  RETURN v_task_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_vm_task(JSONB) TO authenticated;

-- ─── 5. RPC: admin lista tasks ───

CREATE OR REPLACE FUNCTION public.admin_get_vm_tasks(p_status TEXT DEFAULT 'active')
RETURNS TABLE(
  id UUID, title TEXT, description TEXT, category TEXT, priority TEXT,
  due_at TIMESTAMPTZ, reward_xp INT, status TEXT, created_at TIMESTAMPTZ,
  total_assignments BIGINT, submitted_count BIGINT, approved_count BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_tenant UUID := public.get_my_tenant_id();
  v_role TEXT;
BEGIN
  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner','admin','gerente') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT t.id, t.title, t.description, t.category, t.priority,
           t.due_at, t.reward_xp, t.status, t.created_at,
           COUNT(a.id) AS total_assignments,
           COUNT(a.id) FILTER (WHERE a.status = 'submitted') AS submitted_count,
           COUNT(a.id) FILTER (WHERE a.status = 'approved') AS approved_count
      FROM public.vm_tasks t
      LEFT JOIN public.vm_task_assignments a ON a.task_id = t.id
      WHERE t.tenant_id = v_tenant AND t.status = p_status
      GROUP BY t.id
      ORDER BY t.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_vm_tasks(TEXT) TO authenticated;

-- ─── 6. RPC: admin vê submissões de uma task ───

CREATE OR REPLACE FUNCTION public.admin_get_task_submissions(p_task_id UUID)
RETURNS TABLE(
  assignment_id UUID, vendor_id UUID, vendor_nome TEXT, vendor_apelido TEXT,
  status TEXT, feedback TEXT, submitted_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ,
  photos JSONB, checklist_responses JSONB
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_tenant UUID := public.get_my_tenant_id();
  v_role TEXT;
BEGIN
  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner','admin','gerente') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT a.id, a.vendor_id, v.nome, v.apelido,
           a.status, a.feedback, a.submitted_at, a.reviewed_at,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('url', r.photo_url, 'path', r.photo_path)
                       ORDER BY r.created_at)
                     FROM public.vm_task_responses r
                     WHERE r.assignment_id = a.id AND r.photo_url IS NOT NULL), '[]'::jsonb),
           COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', r.checklist_item_id, 'checked', r.checked, 'note', r.note)
                       ORDER BY r.created_at)
                     FROM public.vm_task_responses r
                     WHERE r.assignment_id = a.id AND r.checklist_item_id IS NOT NULL), '[]'::jsonb)
      FROM public.vm_task_assignments a
      JOIN public.vendedores v ON v.id = a.vendor_id
      WHERE a.task_id = p_task_id AND a.tenant_id = v_tenant
      ORDER BY
        CASE a.status WHEN 'submitted' THEN 0 WHEN 'revision' THEN 1
                      WHEN 'in_progress' THEN 2 WHEN 'pending' THEN 3
                      WHEN 'approved' THEN 4 ELSE 5 END,
        a.submitted_at DESC NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_task_submissions(UUID) TO authenticated;

-- ─── 7. RPC: admin aprova/rejeita/pede revisão ───

CREATE OR REPLACE FUNCTION public.admin_review_task_submission(
  p_assignment_id UUID,
  p_status TEXT,
  p_feedback TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant UUID := public.get_my_tenant_id();
  v_role TEXT;
  v_vendor_id UUID;
  v_task_id UUID;
  v_xp_granted BOOLEAN;
  v_reward_xp INT;
BEGIN
  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner','admin','gerente') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF p_status NOT IN ('approved','rejected','revision') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  SELECT a.vendor_id, a.task_id, a.xp_granted
    INTO v_vendor_id, v_task_id, v_xp_granted
    FROM public.vm_task_assignments a
    WHERE a.id = p_assignment_id AND a.tenant_id = v_tenant;
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Assignment não encontrado';
  END IF;

  UPDATE public.vm_task_assignments
    SET status = p_status,
        feedback = CASE WHEN p_status IN ('rejected','revision') THEN COALESCE(p_feedback, '') ELSE feedback END,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = p_assignment_id;

  IF p_status = 'approved' AND NOT v_xp_granted THEN
    SELECT reward_xp INTO v_reward_xp FROM public.vm_tasks WHERE id = v_task_id;
    INSERT INTO public.vendor_xp_events(vendor_id, tenant_id, event_type, points, source_id, meta)
      VALUES (v_vendor_id, v_tenant, 'vm_task_aprovado', COALESCE(v_reward_xp, 30),
              p_assignment_id, jsonb_build_object('task_id', v_task_id))
      ON CONFLICT (vendor_id, source_id, event_type) DO NOTHING;
    UPDATE public.vm_task_assignments SET xp_granted = true WHERE id = p_assignment_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_review_task_submission(UUID, TEXT, TEXT) TO authenticated;

-- ─── 8. RPC: vendor lista tasks pendentes ───

CREATE OR REPLACE FUNCTION public.vendor_get_my_vm_tasks()
RETURNS TABLE(
  task_id UUID, title TEXT, description TEXT, category TEXT, priority TEXT,
  due_at TIMESTAMPTZ, reward_xp INT, task_created_at TIMESTAMPTZ,
  assignment_id UUID, assignment_status TEXT, feedback TEXT,
  ref_count BIGINT, checklist_count BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_id UUID := public._vendor_self_id();
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Vendedor não vinculado';
  END IF;

  RETURN QUERY
    SELECT t.id, t.title, t.description, t.category, t.priority,
           t.due_at, t.reward_xp, t.created_at,
           a.id, a.status, a.feedback,
           (SELECT COUNT(*) FROM public.vm_task_references r WHERE r.task_id = t.id),
           (SELECT COUNT(*) FROM public.vm_task_checklist c WHERE c.task_id = t.id)
      FROM public.vm_task_assignments a
      JOIN public.vm_tasks t ON t.id = a.task_id
      WHERE a.vendor_id = v_id
        AND t.status = 'active'
        AND a.status IN ('pending','in_progress','revision','submitted','approved','rejected')
      ORDER BY
        CASE a.status WHEN 'revision' THEN 0 WHEN 'pending' THEN 1
                      WHEN 'in_progress' THEN 2 WHEN 'submitted' THEN 3
                      ELSE 4 END,
        t.due_at ASC NULLS LAST,
        t.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.vendor_get_my_vm_tasks() TO authenticated;

-- ─── 9. RPC: vendor detalhe de uma task ───

CREATE OR REPLACE FUNCTION public.vendor_get_task_detail(p_task_id UUID)
RETURNS TABLE(
  task_id UUID, title TEXT, description TEXT, category TEXT, priority TEXT,
  due_at TIMESTAMPTZ, reward_xp INT,
  assignment_id UUID, assignment_status TEXT, feedback TEXT,
  refs JSONB, checklist JSONB
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_id UUID := public._vendor_self_id();
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'Vendedor não vinculado'; END IF;

  RETURN QUERY
    SELECT t.id, t.title, t.description, t.category, t.priority,
           t.due_at, t.reward_xp,
           a.id, a.status, a.feedback,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('url', r.photo_url, 'sort', r.sort_order)
                       ORDER BY r.sort_order)
                     FROM public.vm_task_references r WHERE r.task_id = t.id), '[]'::jsonb),
           COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'sort', c.sort_order)
                       ORDER BY c.sort_order)
                     FROM public.vm_task_checklist c WHERE c.task_id = t.id), '[]'::jsonb)
      FROM public.vm_task_assignments a
      JOIN public.vm_tasks t ON t.id = a.task_id
      WHERE a.vendor_id = v_id AND t.id = p_task_id
      LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.vendor_get_task_detail(UUID) TO authenticated;

-- ─── 10. RPC: vendor inicia task ───

CREATE OR REPLACE FUNCTION public.vendor_start_vm_task(p_task_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID := public._vendor_self_id();
  v_assign_id UUID;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'Vendedor não vinculado'; END IF;

  SELECT id INTO v_assign_id FROM public.vm_task_assignments
    WHERE task_id = p_task_id AND vendor_id = v_id AND status IN ('pending','revision');
  IF v_assign_id IS NULL THEN
    RAISE EXCEPTION 'Tarefa não encontrada ou já iniciada';
  END IF;

  UPDATE public.vm_task_assignments
    SET status = 'in_progress', started_at = COALESCE(started_at, now())
    WHERE id = v_assign_id;

  RETURN v_assign_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.vendor_start_vm_task(UUID) TO authenticated;

-- ─── 11. RPC: vendor submete execução ───

CREATE OR REPLACE FUNCTION public.vendor_submit_vm_task(
  p_assignment_id UUID,
  p_responses JSONB
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID := public._vendor_self_id();
  v_assign_vendor UUID;
  v_resp JSONB;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'Vendedor não vinculado'; END IF;

  SELECT vendor_id INTO v_assign_vendor FROM public.vm_task_assignments
    WHERE id = p_assignment_id AND status IN ('in_progress','revision');
  IF v_assign_vendor IS NULL OR v_assign_vendor != v_id THEN
    RAISE EXCEPTION 'Assignment não encontrado ou não pertence a você';
  END IF;

  -- Limpa respostas anteriores (pra resubmissão após revision)
  DELETE FROM public.vm_task_responses WHERE assignment_id = p_assignment_id;

  -- Insere novas respostas
  IF p_responses IS NOT NULL AND jsonb_array_length(p_responses) > 0 THEN
    FOR v_resp IN SELECT * FROM jsonb_array_elements(p_responses)
    LOOP
      INSERT INTO public.vm_task_responses (assignment_id, photo_url, photo_path, checklist_item_id, checked, note)
        VALUES (
          p_assignment_id,
          NULLIF(v_resp->>'photo_url', ''),
          NULLIF(v_resp->>'photo_path', ''),
          CASE WHEN v_resp->>'checklist_item_id' IS NOT NULL
               THEN (v_resp->>'checklist_item_id')::uuid ELSE NULL END,
          COALESCE((v_resp->>'checked')::boolean, false),
          COALESCE(v_resp->>'note', '')
        );
    END LOOP;
  END IF;

  UPDATE public.vm_task_assignments
    SET status = 'submitted', submitted_at = now()
    WHERE id = p_assignment_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.vendor_submit_vm_task(UUID, JSONB) TO authenticated;
