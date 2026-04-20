-- sql/44-fix-xp-idempotent-index.sql
-- Aplicada em prod em 2026-04-20.
--
-- BUG: o índice UNIQUE de idempotência em vendor_xp_events era PARTIAL
-- (WHERE source_id IS NOT NULL). Postgres não reconhece índice parcial
-- como alvo válido para ON CONFLICT (vendor_id, source_id, event_type)
-- sem especificar o mesmo predicate. Resultado: _grant_xp_for_attendance
-- lançava 42P10 em todo INSERT, capturado como WARNING pelo BEGIN/EXCEPTION
-- do caller (finalizar_atendimento) e invisível para o usuário.
--
-- Efeito: desde que o índice foi criado partial, nenhum atendimento do
-- tablet gerou XP ou progresso de missão diária. Karol (Texas Center)
-- finalizou 9 atendimentos em 20/04 sem ganhar XP nem progredir na missão
-- "10 atendimentos hoje" — gatilho do report.
--
-- FIX: recria o índice como UNIQUE completo. NULLs em source_id continuam
-- distintos por default do Postgres, então bônus manuais (event_type =
-- 'bonus_manual' com source_id NULL) continuam permitidos.

DROP INDEX IF EXISTS public.idx_xp_events_idempotent;
CREATE UNIQUE INDEX idx_xp_events_idempotent
  ON public.vendor_xp_events (vendor_id, source_id, event_type);
