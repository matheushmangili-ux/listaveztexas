-- ============================================
-- minhavez — Enforcement do limite de plano (max_vendedores) — P0-2
-- ============================================
-- Antes: max_vendedores era só EXIBIDO (X/max em settings); criar vendedor NÃO
-- bloqueava → uma loja no Starter (limite 5) cadastrava vendedores à vontade,
-- furando a monetização.
--
-- Agora: trigger BEFORE INSERT/reativação em `vendedores` barra passar do limite
-- de ATIVOS do plano. Detalhes de design:
--   • Conta só ativo=true — vendedor desativado (soft-delete) não ocupa vaga.
--   • Pega reativação (UPDATE ativo false→true), senão dava pra burlar
--     desativando e reativando.
--   • Editar nome/setor (sem mexer em ativo) não dispara — `UPDATE OF ativo`.
--   • Caminhos confiáveis ficam ISENTOS: provisionamento (service_role) e SQL
--     admin direto (sem JWT). O limite governa o admin logado no dashboard.
--
-- Erro: levanta 'LIMITE_PLANO: ...' — o front detecta e mostra CTA de upgrade.
-- Aplicar no Supabase: rodar este arquivo no SQL editor (ou via migration).
-- ============================================

CREATE OR REPLACE FUNCTION public._tg_enforce_vendor_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  TEXT := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  v_max   INT;
  v_count INT;
BEGIN
  -- Só importa quando o resultado é um vendedor ATIVO ocupando vaga.
  IF COALESCE(NEW.ativo, true) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- No UPDATE, se já estava ativo, não é nova ocupação de vaga (ex.: editar nome).
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.ativo, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Enforce SÓ pro admin logado (role 'authenticated'). Provisionamento
  -- (service_role) e operações de banco sem JWT (v_role NULL) são confiáveis.
  IF v_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT max_vendedores INTO v_max FROM public.tenants WHERE id = NEW.tenant_id;
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  -- Conta ativos do tenant, excluindo a própria linha (no-op em INSERT; evita
  -- falso-positivo ao editar um vendedor que já estava ativo).
  SELECT count(*) INTO v_count
    FROM public.vendedores
    WHERE tenant_id = NEW.tenant_id
      AND ativo = true
      AND id <> NEW.id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'LIMITE_PLANO: limite de % vendedores do plano atingido.', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_vendor_limit ON public.vendedores;
CREATE TRIGGER trg_enforce_vendor_limit
  BEFORE INSERT OR UPDATE OF ativo ON public.vendedores
  FOR EACH ROW EXECUTE FUNCTION public._tg_enforce_vendor_limit();
