-- ─────────────────────────────────────────────────────────────────────────
-- 37-hourly-flow-timezone.sql
-- get_hourly_flow estava usando EXTRACT(HOUR FROM inicio) sem conversão
-- de timezone. Session default é UTC, então atendimento de 17:00 BRT
-- (=20:00 UTC) caía no bucket "20h" do chart — dando falsa impressão de
-- dados futuros quando eram dados da tarde que passou.
--
-- Fix: converter pra timezone do tenant (reaproveita tenants.timezone
-- já usado em _today_for_tenant).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_hourly_flow(
    p_inicio TIMESTAMPTZ,
    p_fim TIMESTAMPTZ
) RETURNS TABLE(
    hora INT,
    atendimentos BIGINT,
    vendas BIGINT
) AS $$
DECLARE
    v_tz TEXT;
    v_tenant UUID;
BEGIN
    v_tenant := get_my_tenant_id();
    SELECT COALESCE(timezone, 'America/Sao_Paulo') INTO v_tz
      FROM tenants WHERE id = v_tenant;

    RETURN QUERY
    SELECT
        EXTRACT(HOUR FROM inicio AT TIME ZONE v_tz)::INT,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE resultado = 'venda')::BIGINT
    FROM atendimentos
    WHERE inicio BETWEEN p_inicio AND p_fim
      AND resultado <> 'em_andamento'
      AND tenant_id = v_tenant
    GROUP BY EXTRACT(HOUR FROM inicio AT TIME ZONE v_tz)
    ORDER BY 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
