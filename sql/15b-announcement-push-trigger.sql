-- ============================================
-- Trigger: comunicado urgente → pg_net → send-vendor-push Edge Function
-- Reusa a mesma Edge Function com discriminador via body.table
-- Aplicado em 2026-04-11 como migration "announcement_push_trigger"
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_send_announcement_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_url TEXT;
BEGIN
  -- Só dispara se urgent = true
  IF NEW.urgent IS NOT TRUE THEN RETURN NEW; END IF;

  -- Só se o tenant tiver o módulo ativo (vendor_mobile_enabled + plano elite)
  IF NOT public.tenant_has_vendor_mobile(NEW.tenant_id) THEN RETURN NEW; END IF;

  SELECT value INTO v_url FROM public.app_secrets WHERE key = 'edge_fn_send_vendor_push';
  IF v_url IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'tenant_announcements',
      'schema', 'public',
      'record', row_to_json(NEW)::jsonb
    ),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 2000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_announcements_urgent_push ON public.tenant_announcements;
CREATE TRIGGER tenant_announcements_urgent_push
  AFTER INSERT ON public.tenant_announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_announcement_push();
