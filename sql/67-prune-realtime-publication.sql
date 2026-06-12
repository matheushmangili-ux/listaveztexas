-- ─────────────────────────────────────────────────────────────────────────
-- 67-prune-realtime-publication.sql  (desliga o decodificador de WAL)
-- APLICAR SÓ DEPOIS do deploy dos clients com mv-sync (Broadcast).
--
-- Incidente 2026-06-11: o decodificador de WAL do Realtime (que alimenta
-- postgres_changes) era a carga crônica dominante (~13h de CPU em 2,5 meses,
-- picos de 12s/lote) e saturou o free tier por 2h30. Os clients migraram pra
-- Broadcast (js/mv-sync.js) — vendedores/atendimentos saem da publication e
-- o decoder fica praticamente ocioso (sobra só tenant_announcements, que tem
-- escrita rara).
--
-- Clients antigos (abas não recarregadas) degradam graciosamente: perdem o
-- "empurrão" do realtime mas os polls de fallback seguem (tablet 30s, vendor
-- resync ao focar, botão refresh).
--
-- Reverter (se precisar):
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.vendedores;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimentos;
-- ─────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime DROP TABLE public.vendedores;
ALTER PUBLICATION supabase_realtime DROP TABLE public.atendimentos;
