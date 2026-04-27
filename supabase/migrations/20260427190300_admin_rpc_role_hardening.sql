-- sql/48-admin-rpc-role-hardening.sql
-- Re-applies admin RPCs that used to trust JWT user_metadata for roles.
-- Depends on sql/45-hardening-onboarding-rls.sql for get_my_tenant_role().

CREATE OR REPLACE FUNCTION public.link_vendedor_auth(p_vendedor_id UUID, p_auth_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_tenant UUID;
  v_vendedor_tenant UUID;
  v_caller_role TEXT;
BEGIN
  v_caller_tenant := public.get_my_tenant_id();
  v_caller_role := public.get_my_tenant_role();

  IF v_caller_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Apenas owner/admin/gerente podem vincular vendedores';
  END IF;

  SELECT tenant_id INTO v_vendedor_tenant
    FROM public.vendedores
    WHERE id = p_vendedor_id;

  IF v_vendedor_tenant IS NULL THEN
    RAISE EXCEPTION 'Vendedor nao encontrado';
  END IF;
  IF v_vendedor_tenant != v_caller_tenant THEN
    RAISE EXCEPTION 'Vendedor nao pertence ao seu tenant';
  END IF;

  UPDATE public.vendedores
    SET auth_user_id = p_auth_user_id, updated_at = now()
    WHERE id = p_vendedor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_vendedor_auth(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_xp_config(p_config JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid UUID;
  v_role TEXT;
BEGIN
  v_tid := public.get_my_tenant_id();
  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'no tenant';
  END IF;

  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Apenas owner/admin/gerente podem editar pontuacao';
  END IF;

  IF NOT (
    (p_config->>'atendimento_concluido') ~ '^\d+$' AND
    (p_config->>'venda_realizada')       ~ '^\d+$' AND
    (p_config->>'troca_realizada')       ~ '^\d+$'
  ) THEN
    RAISE EXCEPTION 'Valores de XP devem ser inteiros nao-negativos';
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

CREATE OR REPLACE FUNCTION public.admin_upsert_mission_template(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid UUID;
  v_role TEXT;
  v_id UUID;
BEGIN
  v_tid := public.get_my_tenant_id();
  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'no tenant';
  END IF;

  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Apenas owner/admin/gerente podem editar missoes';
  END IF;

  v_id := NULLIF(p_payload->>'id', '')::uuid;

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
    UPDATE public.mission_templates
      SET title       = COALESCE(p_payload->>'title', title),
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
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid UUID;
  v_role TEXT;
BEGIN
  v_tid := public.get_my_tenant_id();
  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'no tenant';
  END IF;

  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Apenas owner/admin/gerente podem apagar missoes';
  END IF;

  DELETE FROM public.mission_templates
    WHERE id = p_id AND tenant_id = v_tid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_mission_template(UUID) TO authenticated;

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
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.get_my_tenant_id();
  v_role TEXT;
BEGIN
  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner', 'admin', 'gerente') THEN
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

CREATE OR REPLACE FUNCTION public.admin_review_vm(
  p_submission_id UUID,
  p_status TEXT,
  p_feedback TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.get_my_tenant_id();
  v_role TEXT;
  v_vendor_id UUID;
  v_category TEXT;
  v_xp_granted BOOLEAN;
  v_xp_points INT;
  v_config JSONB;
BEGIN
  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Apenas admin/gerente podem revisar VM';
  END IF;
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Status invalido: %', p_status;
  END IF;

  SELECT vendor_id, category, xp_granted
    INTO v_vendor_id, v_category, v_xp_granted
    FROM public.vm_submissions
    WHERE id = p_submission_id AND tenant_id = v_tenant;

  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Submissao nao encontrada';
  END IF;

  UPDATE public.vm_submissions
    SET status = p_status,
        feedback = CASE WHEN p_status = 'rejected' THEN COALESCE(p_feedback, '') ELSE feedback END,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = p_submission_id AND tenant_id = v_tenant;

  IF p_status = 'approved' AND NOT v_xp_granted THEN
    SELECT COALESCE(gamification_config, '{}'::jsonb) INTO v_config
      FROM public.tenants
      WHERE id = v_tenant;

    v_xp_points := COALESCE((v_config->'xp'->>'vm_aprovado')::int, 30);

    INSERT INTO public.vendor_xp_events(vendor_id, tenant_id, event_type, points, source_id, meta)
      VALUES (
        v_vendor_id,
        v_tenant,
        'vm_aprovado',
        v_xp_points,
        p_submission_id,
        jsonb_build_object('category', v_category)
      )
      ON CONFLICT (vendor_id, source_id, event_type) DO NOTHING;

    UPDATE public.vm_submissions
      SET xp_granted = true
      WHERE id = p_submission_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_vm(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_vm_task(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Apenas admin/gerente podem criar tarefas VM';
  END IF;

  INSERT INTO public.vm_tasks (tenant_id, title, description, category, priority, due_at, reward_xp, created_by)
    VALUES (
      v_tenant,
      p_payload->>'title',
      COALESCE(p_payload->>'description', ''),
      p_payload->>'category',
      COALESCE(p_payload->>'priority', 'normal'),
      CASE
        WHEN p_payload->>'due_at' IS NOT NULL THEN (p_payload->>'due_at')::timestamptz
        ELSE NULL
      END,
      COALESCE((p_payload->>'reward_xp')::int, 30),
      auth.uid()
    )
    RETURNING id INTO v_task_id;

  v_idx := 0;
  IF p_payload->'references' IS NOT NULL AND jsonb_array_length(p_payload->'references') > 0 THEN
    FOR v_ref IN SELECT * FROM jsonb_array_elements(p_payload->'references')
    LOOP
      INSERT INTO public.vm_task_references (task_id, photo_url, photo_path, sort_order)
        VALUES (v_task_id, v_ref->>'photo_url', v_ref->>'photo_path', v_idx);
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  v_idx := 0;
  IF p_payload->'checklist' IS NOT NULL AND jsonb_array_length(p_payload->'checklist') > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'checklist')
    LOOP
      INSERT INTO public.vm_task_checklist (task_id, label, sort_order)
        VALUES (v_task_id, v_item->>'label', v_idx);
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  FOR v_vendor IN
    SELECT id
      FROM public.vendedores
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

CREATE OR REPLACE FUNCTION public.admin_get_vm_tasks(p_status TEXT DEFAULT 'active')
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  category TEXT,
  priority TEXT,
  due_at TIMESTAMPTZ,
  reward_xp INT,
  status TEXT,
  created_at TIMESTAMPTZ,
  total_assignments BIGINT,
  submitted_count BIGINT,
  approved_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.get_my_tenant_id();
  v_role TEXT;
BEGIN
  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner', 'admin', 'gerente') THEN
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

CREATE OR REPLACE FUNCTION public.admin_get_task_submissions(p_task_id UUID)
RETURNS TABLE(
  assignment_id UUID,
  vendor_id UUID,
  vendor_nome TEXT,
  vendor_apelido TEXT,
  status TEXT,
  feedback TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  photos JSONB,
  checklist_responses JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.get_my_tenant_id();
  v_role TEXT;
BEGIN
  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT a.id, a.vendor_id, v.nome, v.apelido,
           a.status, a.feedback, a.submitted_at, a.reviewed_at,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object('url', r.photo_url, 'path', r.photo_path) ORDER BY r.created_at)
               FROM public.vm_task_responses r
               WHERE r.assignment_id = a.id AND r.photo_url IS NOT NULL
           ), '[]'::jsonb),
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object('item_id', r.checklist_item_id, 'checked', r.checked, 'note', r.note) ORDER BY r.created_at)
               FROM public.vm_task_responses r
               WHERE r.assignment_id = a.id AND r.checklist_item_id IS NOT NULL
           ), '[]'::jsonb)
      FROM public.vm_task_assignments a
      JOIN public.vendedores v ON v.id = a.vendor_id
      WHERE a.task_id = p_task_id AND a.tenant_id = v_tenant
      ORDER BY
        CASE a.status
          WHEN 'submitted' THEN 0
          WHEN 'revision' THEN 1
          WHEN 'in_progress' THEN 2
          WHEN 'pending' THEN 3
          WHEN 'approved' THEN 4
          ELSE 5
        END,
        a.submitted_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_task_submissions(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_task_submission(
  p_assignment_id UUID,
  p_status TEXT,
  p_feedback TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.get_my_tenant_id();
  v_role TEXT;
  v_vendor_id UUID;
  v_task_id UUID;
  v_xp_granted BOOLEAN;
  v_reward_xp INT;
BEGIN
  v_role := public.get_my_tenant_role();
  IF v_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF p_status NOT IN ('approved', 'rejected', 'revision') THEN
    RAISE EXCEPTION 'Status invalido: %', p_status;
  END IF;

  SELECT a.vendor_id, a.task_id, a.xp_granted
    INTO v_vendor_id, v_task_id, v_xp_granted
    FROM public.vm_task_assignments a
    WHERE a.id = p_assignment_id AND a.tenant_id = v_tenant;

  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Assignment nao encontrado';
  END IF;

  UPDATE public.vm_task_assignments
    SET status = p_status,
        feedback = CASE WHEN p_status IN ('rejected', 'revision') THEN COALESCE(p_feedback, '') ELSE feedback END,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = p_assignment_id;

  IF p_status = 'approved' AND NOT v_xp_granted THEN
    SELECT reward_xp INTO v_reward_xp
      FROM public.vm_tasks
      WHERE id = v_task_id;

    INSERT INTO public.vendor_xp_events(vendor_id, tenant_id, event_type, points, source_id, meta)
      VALUES (
        v_vendor_id,
        v_tenant,
        'vm_task_aprovado',
        COALESCE(v_reward_xp, 30),
        p_assignment_id,
        jsonb_build_object('task_id', v_task_id)
      )
      ON CONFLICT (vendor_id, source_id, event_type) DO NOTHING;

    UPDATE public.vm_task_assignments
      SET xp_granted = true
      WHERE id = p_assignment_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_task_submission(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_vendor_auth_email(p_vendedor_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_tenant UUID;
  v_caller_role TEXT;
  v_vendedor_tenant UUID;
  v_auth_user_id UUID;
  v_email TEXT;
BEGIN
  v_caller_tenant := public.get_my_tenant_id();
  v_caller_role := public.get_my_tenant_role();

  IF v_caller_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Apenas owner/admin/gerente podem consultar credenciais de vendedor';
  END IF;

  SELECT tenant_id, auth_user_id
    INTO v_vendedor_tenant, v_auth_user_id
    FROM public.vendedores
    WHERE id = p_vendedor_id;

  IF v_vendedor_tenant IS NULL THEN
    RAISE EXCEPTION 'Vendedor nao encontrado';
  END IF;
  IF v_vendedor_tenant != v_caller_tenant THEN
    RAISE EXCEPTION 'Vendedor nao pertence ao seu tenant';
  END IF;
  IF v_auth_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email
    FROM auth.users
    WHERE id = v_auth_user_id;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vendor_auth_email(UUID) TO authenticated;
