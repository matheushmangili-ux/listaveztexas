-- ============================================
-- RPC: Log detalhado de pausas por período
-- Retorna cada pausa individual com nome do vendedor
-- Compatível com multi-tenant via join em vendedores
-- ============================================

CREATE OR REPLACE FUNCTION get_pause_log(p_inicio timestamptz, p_fim timestamptz)
RETURNS TABLE(
  id uuid,
  vendedor_nome text,
  motivo text,
  inicio timestamptz,
  fim timestamptz,
  duracao_min numeric
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    pl.id,
    COALESCE(v.apelido, v.nome) as vendedor_nome,
    pl.motivo,
    pl.saida as inicio,
    pl.retorno as fim,
    COALESCE(pl.duracao_min, ROUND(EXTRACT(EPOCH FROM (now() - pl.saida)) / 60, 1)) as duracao_min
  FROM pausas_log pl
  JOIN vendedores v ON v.id = pl.vendedor_id
  WHERE pl.saida BETWEEN p_inicio AND p_fim
  ORDER BY pl.saida DESC;
$$;

GRANT EXECUTE ON FUNCTION get_pause_log(timestamptz, timestamptz) TO authenticated;
