-- ─────────────────────────────────────────────────────────────────────────
-- 51-demand-capture.sql  (P1-A · Ruptura → Demand Capture)
-- Captura "o produto que o cliente queria e não fechamos" em TODOS os motivos
-- de não-conversão (não só ruptura) + relatório agregado pro lojista.
--
-- Modelo: nova coluna atendimentos.produto_desejado (texto livre, capturado no
-- tablet pros motivos preço/indecisão/só_olhando/outro). Ruptura continua usando
-- produto_ruptura + catálogo estruturado. O relatório COALESCE os dois, então a
-- demanda de ruptura também aparece sem digitar de novo.
--
-- CRÍTICO: finalizar_atendimento mantém o hook _grant_xp_for_attendance (vide
-- sql/33 + tests/xp-hook.test.js). vendor_finish_attendance NÃO é redefinida aqui
-- (segue como na sql/36) — captura no mobile do vendedor fica como follow-up.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Coluna nova (idempotente)
ALTER TABLE public.atendimentos ADD COLUMN IF NOT EXISTS produto_desejado TEXT;

-- 2) Índice parcial pro relatório (filtra tenant + período só nas não-conversões)
CREATE INDEX IF NOT EXISTS idx_atend_demanda
  ON public.atendimentos (tenant_id, inicio)
  WHERE resultado = 'nao_convertido';

-- 3) finalizar_atendimento: + p_produto_desejado (no fim, default NULL → JS antigo
--    segue funcionando via named params). Recriar exige dropar a assinatura atual.
DROP FUNCTION IF EXISTS public.finalizar_atendimento(
  UUID, atendimento_resultado, motivo_perda, TEXT, TEXT, NUMERIC, UUID, UUID, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.finalizar_atendimento(
    p_atendimento_id    UUID,
    p_resultado         atendimento_resultado,
    p_motivo            motivo_perda DEFAULT NULL,
    p_motivo_detalhe    TEXT DEFAULT NULL,
    p_produto_ruptura   TEXT DEFAULT NULL,
    p_valor_venda       NUMERIC DEFAULT NULL,
    p_ruptura_tipo_id   UUID DEFAULT NULL,
    p_ruptura_marca_id  UUID DEFAULT NULL,
    p_ruptura_cor_id    UUID DEFAULT NULL,
    p_ruptura_tamanho   TEXT DEFAULT NULL,
    p_produto_desejado  TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_vendedor_id UUID;
    v_tenant_id   UUID;
    v_max_pos     INT;
BEGIN
    v_tenant_id := get_my_tenant_id();

    SELECT vendedor_id INTO v_vendedor_id
    FROM atendimentos WHERE id = p_atendimento_id AND tenant_id = v_tenant_id;

    IF v_vendedor_id IS NULL THEN
        RAISE EXCEPTION 'Atendimento nao encontrado';
    END IF;

    UPDATE atendimentos SET
        fim                = now(),
        resultado          = p_resultado,
        motivo_perda       = p_motivo,
        motivo_detalhe     = p_motivo_detalhe,
        produto_ruptura    = p_produto_ruptura,
        valor_venda        = p_valor_venda,
        ruptura_tipo_id    = p_ruptura_tipo_id,
        ruptura_marca_id   = p_ruptura_marca_id,
        ruptura_cor_id     = p_ruptura_cor_id,
        ruptura_tamanho    = p_ruptura_tamanho,
        produto_desejado   = p_produto_desejado
    WHERE id = p_atendimento_id;

    SELECT COALESCE(MAX(posicao_fila), 0) INTO v_max_pos
    FROM vendedores WHERE tenant_id = v_tenant_id;

    UPDATE vendedores SET
        status       = 'disponivel',
        posicao_fila = v_max_pos + 1
    WHERE id = v_vendedor_id;

    -- Hook XP (vide 33-finalizar-atendimento-xp-hook.sql; preservar em toda redefinição)
    BEGIN
        PERFORM public._grant_xp_for_attendance(
            v_vendedor_id, v_tenant_id, p_atendimento_id,
            p_resultado::text, p_valor_venda
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'xp grant failed for atend %: %', p_atendimento_id, SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.finalizar_atendimento(
  UUID, atendimento_resultado, motivo_perda, TEXT, TEXT, NUMERIC, UUID, UUID, UUID, TEXT, TEXT
) TO authenticated;

-- 4) Relatório de demanda perdida: produto × motivo × quantidade.
--    COALESCE(produto_desejado, produto_ruptura) → captura ruptura também.
--    RLS via get_my_tenant_id() (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.get_demand_report(
    p_inicio TIMESTAMPTZ,
    p_fim    TIMESTAMPTZ,
    p_motivo motivo_perda DEFAULT NULL,
    p_limit  INT DEFAULT 20
) RETURNS TABLE (produto TEXT, motivo motivo_perda, total BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    btrim(COALESCE(NULLIF(btrim(a.produto_desejado), ''), a.produto_ruptura)) AS produto,
    a.motivo_perda AS motivo,
    COUNT(*) AS total
  FROM public.atendimentos a
  WHERE a.tenant_id = public.get_my_tenant_id()
    AND a.resultado = 'nao_convertido'
    AND a.inicio >= p_inicio
    AND a.inicio < p_fim
    AND COALESCE(NULLIF(btrim(a.produto_desejado), ''), NULLIF(btrim(a.produto_ruptura), '')) IS NOT NULL
    AND (p_motivo IS NULL OR a.motivo_perda = p_motivo)
  GROUP BY 1, 2
  ORDER BY total DESC, produto ASC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_demand_report(TIMESTAMPTZ, TIMESTAMPTZ, motivo_perda, INT) TO authenticated;
