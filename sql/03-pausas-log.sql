-- ============================================
-- Histórico de pausas/saídas dos vendedores
-- ============================================

CREATE TABLE IF NOT EXISTS pausas_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor_id uuid REFERENCES vendedores(id),
  turno_id uuid REFERENCES turnos(id),
  motivo text NOT NULL,  -- almoco, banheiro, reuniao, finalizar, outro
  saida timestamptz DEFAULT now(),
  retorno timestamptz,
  duracao_min numeric GENERATED ALWAYS AS (
    CASE WHEN retorno IS NOT NULL
      THEN EXTRACT(EPOCH FROM (retorno - saida)) / 60
      ELSE NULL
    END
  ) STORED
);

ALTER TABLE pausas_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pausas_select" ON pausas_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "pausas_insert" ON pausas_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pausas_update" ON pausas_log FOR UPDATE TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE pausas_log;

-- RPC: registrar pausa
CREATE OR REPLACE FUNCTION registrar_pausa(p_vendedor_id uuid, p_turno_id uuid, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO pausas_log (vendedor_id, turno_id, motivo)
  VALUES (p_vendedor_id, p_turno_id, p_motivo)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RPC: registrar retorno de pausa
CREATE OR REPLACE FUNCTION registrar_retorno(p_vendedor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE pausas_log
  SET retorno = now()
  WHERE vendedor_id = p_vendedor_id
    AND retorno IS NULL
  ORDER BY saida DESC
  LIMIT 1;
END;
$$;

-- RPC: stats de pausas por período
CREATE OR REPLACE FUNCTION get_pause_stats(p_inicio timestamptz, p_fim timestamptz)
RETURNS TABLE(
  vendedor_id uuid,
  nome text,
  total_pausas bigint,
  tempo_total_min numeric,
  motivo_mais_comum text
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    pl.vendedor_id,
    v.nome,
    COUNT(*) as total_pausas,
    ROUND(COALESCE(SUM(pl.duracao_min), 0), 1) as tempo_total_min,
    (SELECT pl2.motivo FROM pausas_log pl2
     WHERE pl2.vendedor_id = pl.vendedor_id AND pl2.saida BETWEEN p_inicio AND p_fim
     GROUP BY pl2.motivo ORDER BY COUNT(*) DESC LIMIT 1) as motivo_mais_comum
  FROM pausas_log pl
  JOIN vendedores v ON v.id = pl.vendedor_id
  WHERE pl.saida BETWEEN p_inicio AND p_fim
  GROUP BY pl.vendedor_id, v.nome
  ORDER BY total_pausas DESC;
$$;
