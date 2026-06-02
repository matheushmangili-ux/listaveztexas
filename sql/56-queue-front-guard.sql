-- ─────────────────────────────────────────────────────────────────────────
-- 56-queue-front-guard.sql
-- Bug de fila: posicao_fila é um contador monotônico (max+1 ao finalizar/cadastrar),
-- não um rank 1..N. O guard de vendor_start_attendance exigia v_pos = 1, então o
-- REAL próximo da fila (menor posição, ex.: 19) era barrado com "você não é o
-- próximo". Trocado por "v_pos = MIN(posições disponíveis do setor)".
--
-- Só a sobrecarga de 2 args (a que o app chama) é redefinida. Corpo idêntico ao
-- atual, muda só a condição do guard. Re-normalização ao final segue igual.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.vendor_start_attendance(p_canal_id uuid DEFAULT NULL::uuid, p_preferencial boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_vendedor_id UUID;
  v_tenant UUID;
  v_setor TEXT;
  v_pos INT;
  v_status vendedor_status;
  v_turno UUID;
  v_atend_id UUID;
BEGIN
  SELECT v.id, v.tenant_id, v.setor, v.posicao_fila, v.status
    INTO v_vendedor_id, v_tenant, v_setor, v_pos, v_status
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid();

  IF v_vendedor_id IS NULL THEN RAISE EXCEPTION 'Vendedor não vinculado'; END IF;
  IF NOT public.tenant_has_vendor_mobile(v_tenant) THEN
    RAISE EXCEPTION 'Plano não permite';
  END IF;
  IF v_status != 'disponivel' THEN
    RAISE EXCEPTION 'Vendedor não está disponível (status: %)', v_status;
  END IF;
  IF v_pos IS NULL THEN
    RAISE EXCEPTION 'Você não está na fila';
  END IF;

  -- Regra: atendimento normal só pro FRENTE da fila (menor posição do setor),
  -- não pra "posicao_fila = 1" (que não vale com o contador esparso).
  -- Preferencial pode de qualquer posição.
  IF NOT p_preferencial AND v_pos <> (
    SELECT MIN(posicao_fila) FROM public.vendedores
    WHERE tenant_id = v_tenant
      AND COALESCE(setor, 'loja') = COALESCE(v_setor, 'loja')
      AND status = 'disponivel'
      AND posicao_fila IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Você não é o próximo da fila. Use atendimento preferencial.';
  END IF;

  SELECT id INTO v_turno FROM public.turnos
    WHERE tenant_id = v_tenant AND fechamento IS NULL
    ORDER BY abertura DESC LIMIT 1;
  IF v_turno IS NULL THEN RAISE EXCEPTION 'Nenhum turno aberto'; END IF;

  -- Valida canal (se fornecido)
  IF p_canal_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.canais_origem WHERE id = p_canal_id AND tenant_id = v_tenant) THEN
      RAISE EXCEPTION 'Canal de origem inválido';
    END IF;
  END IF;

  -- Cria atendimento (marca preferencial)
  INSERT INTO public.atendimentos (
    vendedor_id, turno_id, inicio, resultado, canal_origem_id, preferencial, tenant_id
  ) VALUES (
    v_vendedor_id, v_turno, now(), 'em_andamento'::atendimento_resultado,
    p_canal_id, COALESCE(p_preferencial, false), v_tenant
  ) RETURNING id INTO v_atend_id;

  -- Vendedor sai da fila (em_atendimento)
  UPDATE public.vendedores
    SET status = 'em_atendimento'::vendedor_status, posicao_fila = NULL, updated_at = now()
    WHERE id = v_vendedor_id AND tenant_id = v_tenant;

  -- Re-normaliza posições dos demais vendedores do mesmo setor
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY posicao_fila) AS new_pos
    FROM public.vendedores
    WHERE tenant_id = v_tenant
      AND COALESCE(setor, 'loja') = COALESCE(v_setor, 'loja')
      AND posicao_fila IS NOT NULL
      AND id != v_vendedor_id
  )
  UPDATE public.vendedores v SET posicao_fila = o.new_pos
    FROM ordered o WHERE v.id = o.id;

  RETURN v_atend_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.vendor_start_attendance(uuid, boolean) TO authenticated;
