-- ─────────────────────────────────────────────────────────────────────────
-- 55-pausa-detalhe.sql
-- Pausa operacional do vendedor passa a registrar QUAL atividade (detalhe).
-- - pausas.detalhe TEXT (nullable; usado hoje só pra operacional, mas genérico)
-- - vendor_go_pausa(p_motivo, p_detalhe) — novo arg opcional (backward-compat)
-- - get_pause_log retorna detalhe pro dashboard mostrar
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pausas ADD COLUMN IF NOT EXISTS detalhe TEXT;

-- vendor_go_pausa: + p_detalhe (drop do 1-arg pra não criar overload ambíguo)
DROP FUNCTION IF EXISTS public.vendor_go_pausa(text);

CREATE OR REPLACE FUNCTION public.vendor_go_pausa(p_motivo text, p_detalhe text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_vendedor_id UUID;
  v_tenant UUID;
  v_turno UUID;
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

  -- Fecha pausa anterior aberta (safeguard contra o bug do fim inflado)
  UPDATE public.pausas SET fim = now()
    WHERE vendedor_id = v_vendedor_id AND fim IS NULL AND tenant_id = v_tenant;

  -- Nova pausa (detalhe só pra operacional; demais motivos mandam NULL)
  INSERT INTO public.pausas (vendedor_id, turno_id, motivo, detalhe, inicio, tenant_id)
    VALUES (v_vendedor_id, v_turno, p_motivo, NULLIF(btrim(p_detalhe), ''), now(), v_tenant);

  -- Sai da fila
  UPDATE public.vendedores
    SET status = 'pausa'::vendedor_status, posicao_fila = NULL, updated_at = now()
    WHERE id = v_vendedor_id AND tenant_id = v_tenant;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.vendor_go_pausa(text, text) TO authenticated;

-- get_pause_log: + detalhe no retorno (muda assinatura de retorno → drop antes)
DROP FUNCTION IF EXISTS public.get_pause_log(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_pause_log(p_inicio timestamptz, p_fim timestamptz)
RETURNS TABLE(id uuid, vendedor_nome text, motivo text, detalhe text, inicio timestamptz, fim timestamptz, duracao_min numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.id,
         COALESCE(v.apelido, v.nome)::TEXT AS vendedor_nome,
         p.motivo::TEXT,
         p.detalhe::TEXT,
         p.inicio,
         p.fim,
         CASE WHEN p.fim IS NOT NULL THEN ROUND(EXTRACT(EPOCH FROM (p.fim - p.inicio)) / 60, 1)
              ELSE ROUND(EXTRACT(EPOCH FROM (now() - p.inicio)) / 60, 1) END AS duracao_min
  FROM pausas p
  JOIN vendedores v ON v.id = p.vendedor_id
  WHERE p.inicio BETWEEN p_inicio AND p_fim AND v.tenant_id = get_my_tenant_id()
  ORDER BY p.inicio DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_pause_log(timestamptz, timestamptz) TO authenticated;
