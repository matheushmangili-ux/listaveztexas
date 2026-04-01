-- ============================================
-- Corrigir RPCs de pausas para usar tabela correta (pausas)
-- A tabela pausas_log nunca foi criada no banco real
-- Colunas reais: id, vendedor_id, turno_id, motivo, inicio, fim, tenant_id
-- ============================================

-- RPC: registrar pausa (corrigida para tabela pausas)
CREATE OR REPLACE FUNCTION registrar_pausa(p_vendedor_id uuid, p_turno_id uuid, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM vendedores WHERE id = p_vendedor_id;
  INSERT INTO pausas (vendedor_id, turno_id, motivo, inicio, tenant_id)
  VALUES (p_vendedor_id, p_turno_id, p_motivo, now(), v_tenant)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RPC: registrar retorno de pausa (corrigida para tabela pausas)
CREATE OR REPLACE FUNCTION registrar_retorno(p_vendedor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE pausas
  SET fim = now()
  WHERE vendedor_id = p_vendedor_id
    AND fim IS NULL;
END;
$$;

-- RPC: log detalhado de pausas por período
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
    p.id,
    COALESCE(v.apelido, v.nome) as vendedor_nome,
    p.motivo,
    p.inicio,
    p.fim,
    CASE
      WHEN p.fim IS NOT NULL THEN ROUND(EXTRACT(EPOCH FROM (p.fim - p.inicio)) / 60, 1)
      ELSE ROUND(EXTRACT(EPOCH FROM (now() - p.inicio)) / 60, 1)
    END as duracao_min
  FROM pausas p
  JOIN vendedores v ON v.id = p.vendedor_id
  WHERE p.inicio BETWEEN p_inicio AND p_fim
  ORDER BY p.inicio DESC;
$$;

GRANT EXECUTE ON FUNCTION registrar_pausa(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_retorno(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pause_log(timestamptz, timestamptz) TO authenticated;
