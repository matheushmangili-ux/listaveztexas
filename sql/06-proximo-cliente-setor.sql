-- ============================================
-- Atualiza proximo_cliente para filtrar por setor
-- Executar no Supabase SQL Editor
-- ============================================

CREATE OR REPLACE FUNCTION proximo_cliente(p_turno_id UUID, p_setor TEXT DEFAULT 'loja')
RETURNS UUID AS $$
DECLARE
    v_vendedor_id UUID;
    v_atendimento_id UUID;
BEGIN
    SELECT id INTO v_vendedor_id
    FROM vendedores
    WHERE status = 'disponivel'
      AND posicao_fila IS NOT NULL
      AND ativo = true
      AND COALESCE(setor, 'loja') = p_setor
    ORDER BY posicao_fila ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_vendedor_id IS NULL THEN
        RAISE EXCEPTION 'Nenhum vendedor disponível no setor %', p_setor;
    END IF;

    INSERT INTO atendimentos (vendedor_id, turno_id)
    VALUES (v_vendedor_id, p_turno_id)
    RETURNING id INTO v_atendimento_id;

    UPDATE vendedores
    SET status = 'em_atendimento', posicao_fila = NULL
    WHERE id = v_vendedor_id;

    RETURN v_atendimento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
