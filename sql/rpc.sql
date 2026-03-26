-- ============================================
-- ListaVez Texas — Database Functions (RPCs)
-- Executar no Supabase SQL Editor APÓS schema.sql
-- ============================================

-- Próximo cliente: atribui o vendedor da vez com lock
CREATE OR REPLACE FUNCTION proximo_cliente(p_turno_id UUID)
RETURNS UUID AS $$
DECLARE
    v_vendedor_id UUID;
    v_atendimento_id UUID;
BEGIN
    SELECT id INTO v_vendedor_id
    FROM vendedores
    WHERE status = 'disponivel' AND posicao_fila IS NOT NULL AND ativo = true
    ORDER BY posicao_fila ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_vendedor_id IS NULL THEN
        RAISE EXCEPTION 'Nenhum vendedor disponível';
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

-- Finalizar atendimento: registra resultado e devolve vendedor pra fila
CREATE OR REPLACE FUNCTION finalizar_atendimento(
    p_atendimento_id UUID,
    p_resultado atendimento_resultado,
    p_motivo motivo_perda DEFAULT NULL,
    p_motivo_detalhe TEXT DEFAULT NULL,
    p_produto_ruptura TEXT DEFAULT NULL,
    p_valor_venda NUMERIC DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_vendedor_id UUID;
    v_max_pos INT;
BEGIN
    SELECT vendedor_id INTO v_vendedor_id
    FROM atendimentos WHERE id = p_atendimento_id;

    IF v_vendedor_id IS NULL THEN
        RAISE EXCEPTION 'Atendimento não encontrado';
    END IF;

    UPDATE atendimentos SET
        fim = now(),
        resultado = p_resultado,
        motivo_perda = p_motivo,
        motivo_detalhe = p_motivo_detalhe,
        produto_ruptura = p_produto_ruptura,
        valor_venda = p_valor_venda
    WHERE id = p_atendimento_id;

    SELECT COALESCE(MAX(posicao_fila), 0) INTO v_max_pos FROM vendedores;

    UPDATE vendedores SET
        status = 'disponivel',
        posicao_fila = v_max_pos + 1
    WHERE id = v_vendedor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stats de conversão por período
CREATE OR REPLACE FUNCTION get_conversion_stats(
    p_inicio TIMESTAMPTZ,
    p_fim TIMESTAMPTZ
) RETURNS TABLE(
    total_atendimentos BIGINT,
    total_vendas BIGINT,
    total_nao_convertido BIGINT,
    total_trocas BIGINT,
    taxa_conversao NUMERIC,
    tempo_medio_min NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE resultado = 'venda')::BIGINT,
        COUNT(*) FILTER (WHERE resultado = 'nao_convertido')::BIGINT,
        COUNT(*) FILTER (WHERE resultado = 'troca')::BIGINT,
        ROUND(COUNT(*) FILTER (WHERE resultado = 'venda')::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE resultado != 'em_andamento'), 0) * 100, 1),
        ROUND(AVG(EXTRACT(EPOCH FROM (fim - inicio)) / 60) FILTER (WHERE fim IS NOT NULL)::NUMERIC, 1)
    FROM atendimentos
    WHERE inicio >= p_inicio AND inicio < p_fim;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Motivos de perda por período
CREATE OR REPLACE FUNCTION get_loss_reasons(
    p_inicio TIMESTAMPTZ,
    p_fim TIMESTAMPTZ
) RETURNS TABLE(
    motivo TEXT,
    total BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(motivo_perda::TEXT, 'sem_motivo'),
        COUNT(*)::BIGINT
    FROM atendimentos
    WHERE inicio >= p_inicio AND inicio < p_fim
      AND resultado = 'nao_convertido'
    GROUP BY motivo_perda
    ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ranking vendedores por período
CREATE OR REPLACE FUNCTION get_seller_ranking(
    p_inicio TIMESTAMPTZ,
    p_fim TIMESTAMPTZ
) RETURNS TABLE(
    vendedor_id UUID,
    nome TEXT,
    total_atendimentos BIGINT,
    total_vendas BIGINT,
    taxa_conversao NUMERIC,
    tempo_medio_min NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.id,
        v.nome,
        COUNT(a.id)::BIGINT,
        COUNT(a.id) FILTER (WHERE a.resultado = 'venda')::BIGINT,
        ROUND(COUNT(a.id) FILTER (WHERE a.resultado = 'venda')::NUMERIC / NULLIF(COUNT(a.id) FILTER (WHERE a.resultado != 'em_andamento'), 0) * 100, 1),
        ROUND(AVG(EXTRACT(EPOCH FROM (a.fim - a.inicio)) / 60) FILTER (WHERE a.fim IS NOT NULL)::NUMERIC, 1)
    FROM vendedores v
    LEFT JOIN atendimentos a ON a.vendedor_id = v.id
        AND a.inicio >= p_inicio AND a.inicio < p_fim
    WHERE v.ativo = true
    GROUP BY v.id, v.nome
    ORDER BY COUNT(a.id) FILTER (WHERE a.resultado = 'venda') DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fluxo por hora
CREATE OR REPLACE FUNCTION get_hourly_flow(
    p_inicio TIMESTAMPTZ,
    p_fim TIMESTAMPTZ
) RETURNS TABLE(
    hora INT,
    atendimentos BIGINT,
    vendas BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        EXTRACT(HOUR FROM inicio)::INT,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE resultado = 'venda')::BIGINT
    FROM atendimentos
    WHERE inicio >= p_inicio AND inicio < p_fim
      AND resultado != 'em_andamento'
    GROUP BY EXTRACT(HOUR FROM inicio)
    ORDER BY EXTRACT(HOUR FROM inicio);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Produtos em ruptura (mais citados)
CREATE OR REPLACE FUNCTION get_rupture_log(
    p_inicio TIMESTAMPTZ,
    p_fim TIMESTAMPTZ
) RETURNS TABLE(
    produto TEXT,
    total BIGINT,
    ultima_vez TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        produto_ruptura,
        COUNT(*)::BIGINT,
        MAX(inicio)
    FROM atendimentos
    WHERE inicio >= p_inicio AND inicio < p_fim
      AND motivo_perda = 'ruptura'
      AND produto_ruptura IS NOT NULL AND produto_ruptura != ''
    GROUP BY produto_ruptura
    ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reordenar fila em batch (1 query em vez de N)
-- Recebe array de UUIDs na ordem desejada, atualiza posicao_fila = índice+1
CREATE OR REPLACE FUNCTION reordenar_fila(p_ids UUID[])
RETURNS VOID AS $$
BEGIN
    UPDATE vendedores
    SET posicao_fila = sub.nova_pos,
        status = 'disponivel'
    FROM (
        SELECT unnest(p_ids) AS vid, generate_series(1, array_length(p_ids, 1)) AS nova_pos
    ) sub
    WHERE vendedores.id = sub.vid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
