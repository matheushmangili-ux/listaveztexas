-- ============================================
-- MinhaVez — Database Functions (RPCs)
-- Executar no Supabase SQL Editor APÓS schema.sql
-- Todas as funções filtram por tenant_id via get_my_tenant_id()
-- ============================================

-- Próximo cliente: atribui o vendedor da vez com lock (versão sem setor)
CREATE OR REPLACE FUNCTION proximo_cliente(p_turno_id UUID)
RETURNS UUID AS $$
DECLARE
    v_vendedor_id UUID;
    v_atendimento_id UUID;
    v_tenant_id UUID;
BEGIN
    v_tenant_id := get_my_tenant_id();

    SELECT id INTO v_vendedor_id
    FROM vendedores
    WHERE status = 'disponivel' AND posicao_fila IS NOT NULL AND ativo = true
      AND tenant_id = v_tenant_id
    ORDER BY posicao_fila ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_vendedor_id IS NULL THEN
        RAISE EXCEPTION 'Nenhum vendedor disponivel';
    END IF;

    INSERT INTO atendimentos (vendedor_id, turno_id, tenant_id)
    VALUES (v_vendedor_id, p_turno_id, v_tenant_id)
    RETURNING id INTO v_atendimento_id;

    UPDATE vendedores
    SET status = 'em_atendimento', posicao_fila = NULL
    WHERE id = v_vendedor_id;

    RETURN v_atendimento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Próximo cliente por setor
CREATE OR REPLACE FUNCTION proximo_cliente(p_turno_id UUID, p_setor TEXT)
RETURNS UUID AS $$
DECLARE
    v_vendedor_id UUID;
    v_atendimento_id UUID;
    v_tenant_id UUID;
BEGIN
    v_tenant_id := get_my_tenant_id();

    SELECT id INTO v_vendedor_id
    FROM vendedores
    WHERE status = 'disponivel'
      AND posicao_fila IS NOT NULL
      AND ativo = true
      AND COALESCE(setor, 'loja') = p_setor
      AND tenant_id = v_tenant_id
    ORDER BY posicao_fila ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_vendedor_id IS NULL THEN
        RAISE EXCEPTION 'Nenhum vendedor disponível no setor %', p_setor;
    END IF;

    INSERT INTO atendimentos (vendedor_id, turno_id, tenant_id)
    VALUES (v_vendedor_id, p_turno_id, v_tenant_id)
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
    tempo_medio_min NUMERIC,
    ticket_medio NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH dados AS (
        SELECT * FROM atendimentos a
        WHERE a.inicio BETWEEN p_inicio AND p_fim
          AND a.resultado <> 'em_andamento'
          AND a.tenant_id = get_my_tenant_id()
    )
    SELECT
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE d.resultado = 'venda')::BIGINT,
        COUNT(*) FILTER (WHERE d.resultado = 'nao_convertido')::BIGINT,
        COUNT(*) FILTER (WHERE d.resultado = 'troca')::BIGINT,
        CASE WHEN COUNT(*) FILTER (WHERE d.resultado IN ('venda','nao_convertido')) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE d.resultado = 'venda')::numeric /
                 COUNT(*) FILTER (WHERE d.resultado IN ('venda','nao_convertido')) * 100, 1)
            ELSE 0 END,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(d.fim, now()) - d.inicio)) / 60)::numeric, 1),
        ROUND(AVG(d.valor_venda) FILTER (WHERE d.resultado = 'venda'), 2)
    FROM dados d;
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
        motivo_perda::TEXT,
        COUNT(*)::BIGINT
    FROM atendimentos
    WHERE inicio BETWEEN p_inicio AND p_fim
      AND resultado = 'nao_convertido'
      AND motivo_perda IS NOT NULL
      AND tenant_id = get_my_tenant_id()
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
        a.vendedor_id,
        v.nome,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE a.resultado = 'venda')::BIGINT,
        CASE WHEN COUNT(*) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE a.resultado = 'venda')::numeric / COUNT(*) * 100, 1)
            ELSE 0 END,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(a.fim, now()) - a.inicio)) / 60)::numeric, 1)
    FROM atendimentos a
    JOIN vendedores v ON v.id = a.vendedor_id
    WHERE a.inicio BETWEEN p_inicio AND p_fim
      AND a.resultado <> 'em_andamento'
      AND a.tenant_id = get_my_tenant_id()
    GROUP BY a.vendedor_id, v.nome
    ORDER BY COUNT(*) FILTER (WHERE a.resultado = 'venda') DESC;
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
    WHERE inicio BETWEEN p_inicio AND p_fim
      AND resultado <> 'em_andamento'
      AND tenant_id = get_my_tenant_id()
    GROUP BY EXTRACT(HOUR FROM inicio)
    ORDER BY 1;
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
    WHERE inicio BETWEEN p_inicio AND p_fim
      AND produto_ruptura IS NOT NULL AND produto_ruptura <> ''
      AND tenant_id = get_my_tenant_id()
    GROUP BY produto_ruptura
    ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reordenar fila em batch (1 query em vez de N)
CREATE OR REPLACE FUNCTION reordenar_fila(p_ids UUID[])
RETURNS VOID AS $$
BEGIN
    UPDATE vendedores
    SET posicao_fila = sub.nova_pos, status = 'disponivel'
    FROM (
        SELECT unnest(p_ids) AS vid, generate_series(1, array_length(p_ids, 1)) AS nova_pos
    ) sub
    WHERE vendedores.id = sub.vid
      AND vendedores.tenant_id = get_my_tenant_id();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trend diário (evolução ao longo do tempo)
CREATE OR REPLACE FUNCTION get_daily_trend(
    p_inicio TIMESTAMPTZ,
    p_fim TIMESTAMPTZ
) RETURNS TABLE(
    dia DATE,
    total_atendimentos BIGINT,
    total_vendas BIGINT,
    total_nao_convertido BIGINT,
    taxa_conversao NUMERIC,
    ticket_medio NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE(a.inicio),
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE a.resultado = 'venda')::BIGINT,
        COUNT(*) FILTER (WHERE a.resultado = 'nao_convertido')::BIGINT,
        CASE WHEN COUNT(*) FILTER (WHERE a.resultado IN ('venda','nao_convertido')) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE a.resultado = 'venda')::numeric /
                 COUNT(*) FILTER (WHERE a.resultado IN ('venda','nao_convertido')) * 100, 1)
            ELSE 0 END,
        ROUND(AVG(a.valor_venda) FILTER (WHERE a.resultado = 'venda'), 2)
    FROM atendimentos a
    WHERE a.inicio BETWEEN p_inicio AND p_fim
      AND a.resultado <> 'em_andamento'
      AND a.tenant_id = get_my_tenant_id()
    GROUP BY DATE(a.inicio)
    ORDER BY DATE(a.inicio);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
