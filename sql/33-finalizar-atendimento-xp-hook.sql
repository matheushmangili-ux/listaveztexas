-- ─────────────────────────────────────────────────────────────────────────
-- 33-finalizar-atendimento-xp-hook.sql
-- Contexto: finalizar_atendimento (usado pelo tablet-admin) nunca chamava
-- _grant_xp_for_attendance. Só vendor_finish_attendance (mobile) tinha o
-- hook, então tenants que finalizam 100% pelo tablet ficavam sem XP.
-- Replica aqui o mesmo bloco BEGIN/EXCEPTION de 16-xp-system.sql §8.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalizar_atendimento(
    p_atendimento_id UUID,
    p_resultado atendimento_resultado,
    p_motivo motivo_perda DEFAULT NULL,
    p_motivo_detalhe TEXT DEFAULT NULL,
    p_produto_ruptura TEXT DEFAULT NULL,
    p_valor_venda NUMERIC DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_vendedor_id UUID;
    v_tenant_id UUID;
    v_max_pos INT;
BEGIN
    v_tenant_id := get_my_tenant_id();

    SELECT vendedor_id INTO v_vendedor_id
    FROM atendimentos WHERE id = p_atendimento_id AND tenant_id = v_tenant_id;

    IF v_vendedor_id IS NULL THEN
        RAISE EXCEPTION 'Atendimento nao encontrado';
    END IF;

    UPDATE atendimentos SET
        fim = now(),
        resultado = p_resultado,
        motivo_perda = p_motivo,
        motivo_detalhe = p_motivo_detalhe,
        produto_ruptura = p_produto_ruptura,
        valor_venda = p_valor_venda
    WHERE id = p_atendimento_id;

    -- Scope MAX to same tenant only
    SELECT COALESCE(MAX(posicao_fila), 0) INTO v_max_pos
    FROM vendedores
    WHERE tenant_id = v_tenant_id;

    UPDATE vendedores SET
        status = 'disponivel',
        posicao_fila = v_max_pos + 1
    WHERE id = v_vendedor_id;

    -- Hook XP: mesmo padrão de vendor_finish_attendance. Falha do hook não
    -- deve abortar a finalização do atendimento.
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
