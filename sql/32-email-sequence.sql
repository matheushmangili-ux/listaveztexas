-- ============================================
-- minhavez — Email sequence pós-checkout
-- Adiciona timestamps de envio em tenants + agenda cron diário
-- ============================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS setup_tips_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_week_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_email         TEXT;
-- owner_email pode já existir noutra coluna (ex: email_admin) — ajustar manualmente
-- caso colida; aqui é defensivo (ADD IF NOT EXISTS).

-- Agenda diária (pg_cron): roda 12:00 UTC = 9h BRT
-- Requer extensão pg_cron já habilitada no projeto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove agendamento anterior (se existir) pra evitar duplicidade
    PERFORM cron.unschedule('minhavez_email_sequence');
    EXCEPTION WHEN OTHERS THEN NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'minhavez_email_sequence',
      '0 12 * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://cnpnviaigrdmnixnqjqp.supabase.co/functions/v1/email-cron',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.setup_tips_sent_at IS
  'Timestamp do envio do email D+1 (setup-tips). NULL = não enviado.';
COMMENT ON COLUMN public.tenants.first_week_sent_at IS
  'Timestamp do envio do email D+7 (first-week). NULL = não enviado.';
