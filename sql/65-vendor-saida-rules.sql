-- ─────────────────────────────────────────────────────────────────────────
-- 65-vendor-saida-rules.sql  (saída do vendor segue as regras do tablet)
-- Regra do tablet (tablet-init.js confirmSaida): banheiro/reunião/operacional
-- viram PAUSA (temporário, volta depois); almoço/finalizar/outro viram FORA
-- (sai da fila de verdade). O vendor_go_pausa marcava TUDO como pausa.
-- O registro em `pausas` continua pra todos os motivos (paridade com o tablet,
-- que loga almoço/finalizar via registrar_pausa — o Log de Pausas mostra tudo).
-- Volta: vendor_return_from_pausa já não checa status — serve de "entrar na
-- fila" também pra quem está fora (UI ganha o botão).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.vendor_go_pausa(p_motivo text, p_detalhe text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_vendedor_id UUID;
  v_tenant UUID;
  v_turno UUID;
  v_status vendedor_status;
BEGIN
  SELECT v.id, v.tenant_id INTO v_vendedor_id, v_tenant
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid();

  IF v_vendedor_id IS NULL THEN
    RAISE EXCEPTION 'Vendedor não vinculado a esta conta';
  END IF;
  IF NOT public.tenant_has_vendor_mobile(v_tenant) THEN
    RAISE EXCEPTION 'Plano não permite minhavez Vendedor';
  END IF;

  SELECT id INTO v_turno FROM public.turnos
    WHERE tenant_id = v_tenant AND fechamento IS NULL
    ORDER BY abertura DESC LIMIT 1;
  IF v_turno IS NULL THEN
    RAISE EXCEPTION 'Nenhum turno aberto';
  END IF;

  UPDATE public.pausas SET fim = now()
    WHERE vendedor_id = v_vendedor_id AND fim IS NULL AND tenant_id = v_tenant;

  INSERT INTO public.pausas (vendedor_id, turno_id, motivo, detalhe, inicio, tenant_id)
    VALUES (v_vendedor_id, v_turno, p_motivo, NULLIF(btrim(p_detalhe), ''), now(), v_tenant);

  -- Regra do tablet: pausa só pros temporários; o resto sai da fila (fora).
  v_status := CASE
    WHEN p_motivo IN ('banheiro', 'reuniao', 'operacional') THEN 'pausa'::vendedor_status
    ELSE 'fora'::vendedor_status
  END;

  UPDATE public.vendedores
    SET status = v_status, posicao_fila = NULL, updated_at = now()
    WHERE id = v_vendedor_id AND tenant_id = v_tenant;
END;
$function$;
