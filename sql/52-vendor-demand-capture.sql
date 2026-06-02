-- ─────────────────────────────────────────────────────────────────────────
-- 52-vendor-demand-capture.sql  (P1-A follow-up · demand capture no vendor mobile)
-- vendor_finish_attendance ganha p_produto_desejado (no fim, default NULL →
-- backward-compat). Captura o produto que o cliente queria nas não-conversões
-- feitas pelo app do vendedor, alimentando o mesmo get_demand_report.
--
-- CRÍTICO: preserva o hook _grant_xp_for_attendance (sql/16 §8 / sql/33;
-- tests/xp-hook.test.js valida que a ÚLTIMA redefinição mantém o hook).
-- Corpo idêntico ao sql/36, só + produto_desejado no UPDATE.
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.vendor_finish_attendance(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN, UUID, UUID, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.vendor_finish_attendance(
  p_atend_id         UUID,
  p_resultado        TEXT,
  p_valor            NUMERIC DEFAULT NULL,
  p_motivo           TEXT DEFAULT NULL,
  p_detalhe          TEXT DEFAULT NULL,
  p_produto          TEXT DEFAULT NULL,
  p_fidelizado       BOOLEAN DEFAULT false,
  p_ruptura_tipo_id  UUID DEFAULT NULL,
  p_ruptura_marca_id UUID DEFAULT NULL,
  p_ruptura_cor_id   UUID DEFAULT NULL,
  p_ruptura_tamanho  TEXT DEFAULT NULL,
  p_produto_desejado TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_vendedor_id UUID;
  v_tenant      UUID;
  v_setor       TEXT;
  v_max_pos     INT;
  v_inicio      TIMESTAMPTZ;
  v_elapsed     INT;
BEGIN
  SELECT v.id, v.tenant_id, v.setor INTO v_vendedor_id, v_tenant, v_setor
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid();

  IF v_vendedor_id IS NULL THEN RAISE EXCEPTION 'Vendedor não vinculado'; END IF;
  IF NOT public.tenant_has_vendor_mobile(v_tenant) THEN
    RAISE EXCEPTION 'Plano não permite';
  END IF;

  SELECT inicio INTO v_inicio FROM public.atendimentos
    WHERE id = p_atend_id AND vendedor_id = v_vendedor_id AND tenant_id = v_tenant;
  IF v_inicio IS NULL THEN
    RAISE EXCEPTION 'Atendimento não encontrado ou não pertence a você';
  END IF;

  v_elapsed := EXTRACT(EPOCH FROM (now() - v_inicio))::int;

  IF v_elapsed < 120 AND p_resultado NOT IN ('cancelar') THEN
    RAISE EXCEPTION 'Aguarde pelo menos 2 minutos antes de finalizar (decorridos: %s)', v_elapsed;
  END IF;

  IF p_resultado = 'cancelar' THEN
    DELETE FROM public.atendimentos WHERE id = p_atend_id AND tenant_id = v_tenant;
  ELSE
    UPDATE public.atendimentos SET
        fim                = now(),
        resultado          = p_resultado::atendimento_resultado,
        valor_venda        = p_valor,
        motivo_perda       = CASE WHEN p_motivo IS NOT NULL THEN p_motivo::motivo_perda ELSE NULL END,
        motivo_detalhe     = p_detalhe,
        produto_ruptura    = p_produto,
        cliente_fidelizado = COALESCE(p_fidelizado, false),
        ruptura_tipo_id    = p_ruptura_tipo_id,
        ruptura_marca_id   = p_ruptura_marca_id,
        ruptura_cor_id     = p_ruptura_cor_id,
        ruptura_tamanho    = p_ruptura_tamanho,
        produto_desejado   = p_produto_desejado
    WHERE id = p_atend_id AND tenant_id = v_tenant;
  END IF;

  SELECT COALESCE(MAX(posicao_fila), 0) INTO v_max_pos
    FROM public.vendedores
    WHERE tenant_id = v_tenant
      AND COALESCE(setor, 'loja') = COALESCE(v_setor, 'loja')
      AND posicao_fila IS NOT NULL;

  UPDATE public.vendedores SET
        status       = 'disponivel'::vendedor_status,
        posicao_fila = v_max_pos + 1,
        updated_at   = now()
    WHERE id = v_vendedor_id AND tenant_id = v_tenant;

  -- Hook XP (vide 16-xp-system.sql §8; preservar em toda redefinição)
  BEGIN
    PERFORM public._grant_xp_for_attendance(v_vendedor_id, v_tenant, p_atend_id, p_resultado, p_valor);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'xp grant failed for atend %: %', p_atend_id, SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_finish_attendance(
  UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN, UUID, UUID, UUID, TEXT, TEXT
) TO authenticated;
