-- ─── Migration 11: Enforce tenant_id NOT NULL ───────────────────────────────
-- Deletes orphan rows (tenant_id IS NULL) that have no valid tenant association,
-- then enforces NOT NULL on all core tables.
--
-- IMPORTANTE: Execute este script no SQL Editor do Supabase.
-- Antes de rodar em produção, verifique se há dados sem tenant_id:
--
--   SELECT 'vendedores' AS tabela, COUNT(*) FROM vendedores WHERE tenant_id IS NULL
--   UNION ALL
--   SELECT 'turnos', COUNT(*) FROM turnos WHERE tenant_id IS NULL
--   UNION ALL
--   SELECT 'turno_vendedores', COUNT(*) FROM turno_vendedores WHERE tenant_id IS NULL
--   UNION ALL
--   SELECT 'atendimentos', COUNT(*) FROM atendimentos WHERE tenant_id IS NULL
--   UNION ALL
--   SELECT 'pausas', COUNT(*) FROM pausas WHERE tenant_id IS NULL
--   UNION ALL
--   SELECT 'configuracoes', COUNT(*) FROM configuracoes WHERE tenant_id IS NULL;
--
-- Se houver linhas órfãs e você quiser associá-las a um tenant existente antes de deletar,
-- substitua '<SEU_TENANT_ID>' abaixo pelo UUID do tenant correto e descomente os UPDATEs.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Opcional: associar dados legados a um tenant específico antes de deletar
-- UPDATE vendedores         SET tenant_id = '<SEU_TENANT_ID>' WHERE tenant_id IS NULL;
-- UPDATE turnos             SET tenant_id = '<SEU_TENANT_ID>' WHERE tenant_id IS NULL;
-- UPDATE turno_vendedores   SET tenant_id = '<SEU_TENANT_ID>' WHERE tenant_id IS NULL;
-- UPDATE atendimentos       SET tenant_id = '<SEU_TENANT_ID>' WHERE tenant_id IS NULL;
-- UPDATE pausas             SET tenant_id = '<SEU_TENANT_ID>' WHERE tenant_id IS NULL;
-- UPDATE configuracoes      SET tenant_id = '<SEU_TENANT_ID>' WHERE tenant_id IS NULL;

-- Remove linhas sem tenant (dados de antes do multi-tenant ou testes)
DELETE FROM turno_vendedores WHERE tenant_id IS NULL;
DELETE FROM atendimentos     WHERE tenant_id IS NULL;
DELETE FROM pausas           WHERE tenant_id IS NULL;
DELETE FROM turno_vendedores WHERE tenant_id IS NULL;
DELETE FROM turnos           WHERE tenant_id IS NULL;
DELETE FROM vendedores       WHERE tenant_id IS NULL;
DELETE FROM configuracoes    WHERE tenant_id IS NULL;

-- Enforce NOT NULL
ALTER TABLE vendedores       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE turnos           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE turno_vendedores ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE atendimentos     ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE pausas           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE configuracoes    ALTER COLUMN tenant_id SET NOT NULL;

COMMIT;
