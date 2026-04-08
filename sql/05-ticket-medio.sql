-- ============================================
-- Adiciona ticket_medio ao get_conversion_stats
-- Executar no Supabase SQL Editor
-- ============================================

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
    SELECT
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE resultado = 'venda')::BIGINT,
        COUNT(*) FILTER (WHERE resultado = 'nao_convertido')::BIGINT,
        COUNT(*) FILTER (WHERE resultado = 'troca')::BIGINT,
        ROUND(COUNT(*) FILTER (WHERE resultado = 'venda')::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE resultado != 'em_andamento'), 0) * 100, 1),
        ROUND(AVG(EXTRACT(EPOCH FROM (fim - inicio)) / 60) FILTER (WHERE fim IS NOT NULL)::NUMERIC, 1),
        ROUND(AVG(valor_venda) FILTER (WHERE resultado = 'venda' AND valor_venda IS NOT NULL AND valor_venda > 0)::NUMERIC, 0)
    FROM atendimentos
    WHERE inicio >= p_inicio AND inicio < p_fim
      AND tenant_id = get_my_tenant_id();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
