-- 41-fk-indexes.sql
-- Cria índices cobrindo FKs para evitar full-scan em DELETE/UPDATE do pai
-- e JOINs por FK (advisor 0001_unindexed_foreign_keys).
-- Tabelas envolvidas: announcements, missions, VM tasks, onboarding, tenants.

CREATE INDEX IF NOT EXISTS idx_announcement_reads_tenant
  ON public.announcement_reads (tenant_id);

CREATE INDEX IF NOT EXISTS idx_mission_templates_created_by
  ON public.mission_templates (created_by);

CREATE INDEX IF NOT EXISTS idx_onboarding_tokens_tenant
  ON public.onboarding_tokens (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_announcements_created_by
  ON public.tenant_announcements (created_by);

CREATE INDEX IF NOT EXISTS idx_tenants_owner_user
  ON public.tenants (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_turno_vendedores_vendedor
  ON public.turno_vendedores (vendedor_id);

CREATE INDEX IF NOT EXISTS idx_vendor_achievements_code
  ON public.vendor_achievements (achievement_code);

CREATE INDEX IF NOT EXISTS idx_vendor_achievements_tenant
  ON public.vendor_achievements (tenant_id);

CREATE INDEX IF NOT EXISTS idx_vendor_mission_progress_template
  ON public.vendor_mission_progress (template_id);

CREATE INDEX IF NOT EXISTS idx_vm_submissions_reviewed_by
  ON public.vm_submissions (reviewed_by);

CREATE INDEX IF NOT EXISTS idx_vm_task_assignments_reviewed_by
  ON public.vm_task_assignments (reviewed_by);

CREATE INDEX IF NOT EXISTS idx_vm_task_assignments_vendor_fk
  ON public.vm_task_assignments (vendor_id);

CREATE INDEX IF NOT EXISTS idx_vm_task_checklist_task
  ON public.vm_task_checklist (task_id);

CREATE INDEX IF NOT EXISTS idx_vm_task_references_task
  ON public.vm_task_references (task_id);

CREATE INDEX IF NOT EXISTS idx_vm_task_responses_checklist_item
  ON public.vm_task_responses (checklist_item_id);

CREATE INDEX IF NOT EXISTS idx_vm_tasks_created_by
  ON public.vm_tasks (created_by);
