-- ─────────────────────────────────────────────────────────────────────────
-- 66-tablet-cancelar-atendimento.sql  (cancelamento atômico pro tablet)
-- CAUSA-RAIZ dos bugs "tudo vira preferencial" + "F5 desfaz o cancelar":
-- o tablet fazia DELETE direto em atendimentos, e a policy de DELETE exige
-- is_tenant_manager() — a conta da recepção (role 'recepcionista') era
-- BLOQUEADA EM SILÊNCIO (0 linhas, sem erro). O resto do fluxo seguia:
-- vendedor de volta à fila + atendimento vivo = fantasma "disponivel + na
-- fila + em atendimento" → o isPreferencial via o fantasma como fila[0] e
-- marcava TODO MUNDO como preferencial. (Era também a causa do antigo
-- "vendedor duplicado".)
--
-- Cancelar engano é trabalho da recepção: esta RPC SECURITY DEFINER permite
-- a QUALQUER membro do tenant apagar um atendimento EM ANDAMENTO do próprio
-- tenant — escopo mínimo (não abre DELETE genérico). Retorna true/false pra
-- o tablet ABORTAR o fluxo quando nada foi apagado.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tablet_cancelar_atendimento(p_atend_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tenant uuid;
  v_deleted int;
BEGIN
  v_tenant := public.get_my_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sem acesso';
  END IF;

  DELETE FROM public.atendimentos
   WHERE id = p_atend_id
     AND tenant_id = v_tenant
     AND resultado = 'em_andamento';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tablet_cancelar_atendimento(uuid) TO authenticated;
