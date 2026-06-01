-- ============================================
-- minhavez — Seed de gamificação default por tenant (P0-4 do plano de lançamento)
-- ============================================
-- Problema: tenant novo nascia SEM missões e SEM anúncios → vendedor abria o app
-- e via a aba Missões vazia no dia 1, matando o engajamento (que é o diferencial).
--
-- Solução: trigger AFTER INSERT em `tenants` semeia 4 missões diárias padrão +
-- 1 anúncio de boas-vindas. Idempotente (só semeia se o tenant ainda não tem
-- nada — não clobbera edições do lojista nem re-semeia) e não-bloqueante (falha
-- no seed não aborta a criação do tenant). Inclui backfill p/ tenants existentes.
--
-- Aplicar no Supabase: rodar este arquivo no SQL editor (ou via migration).
-- ============================================

-- ─── 1. Função de seed (idempotente) ───
CREATE OR REPLACE FUNCTION public.seed_tenant_gamification(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Missões padrão — só se o tenant ainda não tem NENHUMA (não duplica/clobbera).
  -- active_days = 127 (bitmask 1111111) → ativa todos os dias da semana.
  IF NOT EXISTS (SELECT 1 FROM public.mission_templates WHERE tenant_id = p_tenant_id) THEN
    INSERT INTO public.mission_templates
      (tenant_id, title, description, goal_type, goal_value, reward_xp, icon, active_days, active)
    VALUES
      (p_tenant_id, 'Aquecimento',
       'Complete 5 atendimentos hoje. Quem começa cedo, fatura cedo.',
       'atendimentos_count', 5, 40, 'fa-fire', 127, true),
      (p_tenant_id, 'Fechador do Dia',
       'Feche 3 vendas hoje. Ritmo de quem sabe converter.',
       'vendas_count', 3, 70, 'fa-handshake', 127, true),
      (p_tenant_id, 'Maratonista',
       '10 atendimentos no dia. Resistência de balcão.',
       'atendimentos_count', 10, 90, 'fa-person-running', 127, true),
      (p_tenant_id, 'Ticket de Ouro',
       'Some R$ 500 em vendas hoje. Aposte no premium.',
       'valor_vendido_total', 500, 120, 'fa-gem', 127, true);
  END IF;

  -- Anúncio de boas-vindas — só se o tenant não tem nenhum anúncio.
  -- urgent=false (não dispara push no provisionamento); expira em 30 dias.
  IF NOT EXISTS (SELECT 1 FROM public.tenant_announcements WHERE tenant_id = p_tenant_id) THEN
    INSERT INTO public.tenant_announcements
      (tenant_id, type, title, body, icon, urgent, expires_at)
    VALUES (
      p_tenant_id, 'comunicado',
      'Bem-vindo(a) ao minhavez! 🎉',
      'Sua loja está no ar. Complete atendimentos pra ganhar XP, subir de nível e fechar as missões do dia. Bora vender! 🚀',
      '🎉', false, now() + interval '30 days'
    );
  END IF;
END;
$$;

-- Função interna — não deve ser chamável pelo cliente.
REVOKE ALL ON FUNCTION public.seed_tenant_gamification(UUID) FROM public;
REVOKE ALL ON FUNCTION public.seed_tenant_gamification(UUID) FROM anon, authenticated;

-- ─── 2. Trigger: todo tenant novo nasce com gamificação semeada ───
CREATE OR REPLACE FUNCTION public._tg_seed_tenant_gamification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Não-bloqueante: se o seed falhar, loga e segue (não aborta o provisionamento).
  BEGIN
    PERFORM public.seed_tenant_gamification(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'seed_tenant_gamification falhou para tenant %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_tenant_gamification ON public.tenants;
CREATE TRIGGER trg_seed_tenant_gamification
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public._tg_seed_tenant_gamification();

-- ─── 3. Backfill: tenants existentes sem missões recebem o seed agora ───
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_tenant_gamification(r.id);
  END LOOP;
END $$;
