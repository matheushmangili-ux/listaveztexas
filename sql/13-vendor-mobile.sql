-- ============================================
-- minhavez Vendedor — schema base (aditivo)
-- Fase 1: colunas, tabelas, RPCs, RLS, gating por plano=elite
-- Backward-compatible: nenhuma estrutura existente é alterada
-- Aplicada no Supabase em 2026-04-11 como migration "vendor_mobile_schema"
-- (version 20260411115358)
-- ============================================

-- ─── 1. Vínculo vendedor ↔ auth.users (nullable) ───
ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendedores_auth_user
  ON public.vendedores(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- ─── 2. Feature flag por tenant (toggle Tablet/Mobile/Ambos) ───
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS vendor_mobile_enabled BOOLEAN NOT NULL DEFAULT false;

-- ─── 3. Push subscriptions ───
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(vendedor_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_vendedor ON public.push_subscriptions(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_tenant ON public.push_subscriptions(tenant_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_select_own" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (
    vendedor_id IN (SELECT id FROM public.vendedores WHERE auth_user_id = auth.uid())
  );

-- ─── 4. Gate helper ───
CREATE OR REPLACE FUNCTION public.tenant_has_vendor_mobile(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT plano = 'elite' AND vendor_mobile_enabled AND status = 'active'
     FROM public.tenants WHERE id = p_tenant_id),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.tenant_has_vendor_mobile(UUID) TO authenticated;

-- ─── 5. Helper interno: resolve vendedor_id do caller ───
CREATE OR REPLACE FUNCTION public._vendor_self_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.vendedores WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ─── 6. Contexto pós-login ───
CREATE OR REPLACE FUNCTION public.get_my_vendedor_context()
RETURNS TABLE(
  vendedor_id UUID,
  tenant_id UUID,
  tenant_slug TEXT,
  tenant_nome TEXT,
  tenant_plano TEXT,
  has_access BOOLEAN,
  nome TEXT,
  apelido TEXT,
  foto_url TEXT,
  setor TEXT,
  status TEXT,
  posicao_fila INT,
  turno_aberto_id UUID
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    v.id,
    v.tenant_id,
    t.slug,
    t.nome_loja,
    t.plano,
    public.tenant_has_vendor_mobile(v.tenant_id),
    v.nome,
    v.apelido,
    v.foto_url,
    v.setor,
    v.status::text,
    v.posicao_fila,
    (SELECT id FROM public.turnos
     WHERE tenant_id = v.tenant_id AND fechamento IS NULL
     ORDER BY abertura DESC LIMIT 1)
  FROM public.vendedores v
  JOIN public.tenants t ON t.id = v.tenant_id
  WHERE v.auth_user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_vendedor_context() TO authenticated;

-- ─── 7. Vendedor entra em pausa ───
CREATE OR REPLACE FUNCTION public.vendor_go_pausa(p_motivo TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_vendedor_id UUID;
  v_tenant UUID;
  v_turno UUID;
BEGIN
  SELECT v.id, v.tenant_id INTO v_vendedor_id, v_tenant
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid();

  IF v_vendedor_id IS NULL THEN
    RAISE EXCEPTION 'Vendedor não vinculado a esta conta';
  END IF;
  IF NOT public.tenant_has_vendor_mobile(v_tenant) THEN
    RAISE EXCEPTION 'Plano não permite minhavez Vendedor';
  END IF;

  SELECT id INTO v_turno FROM public.turnos
    WHERE tenant_id = v_tenant AND fechamento IS NULL
    ORDER BY abertura DESC LIMIT 1;
  IF v_turno IS NULL THEN
    RAISE EXCEPTION 'Nenhum turno aberto';
  END IF;

  UPDATE public.pausas SET fim = now()
    WHERE vendedor_id = v_vendedor_id AND fim IS NULL AND tenant_id = v_tenant;

  INSERT INTO public.pausas (vendedor_id, turno_id, motivo, inicio, tenant_id)
    VALUES (v_vendedor_id, v_turno, p_motivo, now(), v_tenant);

  UPDATE public.vendedores
    SET status = 'pausa'::vendedor_status, posicao_fila = NULL, updated_at = now()
    WHERE id = v_vendedor_id AND tenant_id = v_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_go_pausa(TEXT) TO authenticated;

-- ─── 8. Vendedor retorna da pausa ───
CREATE OR REPLACE FUNCTION public.vendor_return_from_pausa()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_vendedor_id UUID;
  v_tenant UUID;
  v_setor TEXT;
  v_max_pos INT;
BEGIN
  SELECT v.id, v.tenant_id, v.setor INTO v_vendedor_id, v_tenant, v_setor
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid();

  IF v_vendedor_id IS NULL THEN RAISE EXCEPTION 'Vendedor não vinculado'; END IF;
  IF NOT public.tenant_has_vendor_mobile(v_tenant) THEN
    RAISE EXCEPTION 'Plano não permite';
  END IF;

  UPDATE public.pausas SET fim = now()
    WHERE vendedor_id = v_vendedor_id AND fim IS NULL AND tenant_id = v_tenant;

  SELECT COALESCE(MAX(posicao_fila), 0) INTO v_max_pos
    FROM public.vendedores
    WHERE tenant_id = v_tenant
      AND COALESCE(setor, 'loja') = COALESCE(v_setor, 'loja')
      AND posicao_fila IS NOT NULL;

  UPDATE public.vendedores
    SET status = 'disponivel'::vendedor_status,
        posicao_fila = v_max_pos + 1,
        updated_at = now()
    WHERE id = v_vendedor_id AND tenant_id = v_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_return_from_pausa() TO authenticated;

-- ─── 9. Vendedor inicia atendimento (precisa ser #1 do setor) ───
CREATE OR REPLACE FUNCTION public.vendor_start_attendance(p_canal_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_vendedor_id UUID;
  v_tenant UUID;
  v_setor TEXT;
  v_pos INT;
  v_status vendedor_status;
  v_turno UUID;
  v_atend_id UUID;
BEGIN
  SELECT v.id, v.tenant_id, v.setor, v.posicao_fila, v.status
    INTO v_vendedor_id, v_tenant, v_setor, v_pos, v_status
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid();

  IF v_vendedor_id IS NULL THEN RAISE EXCEPTION 'Vendedor não vinculado'; END IF;
  IF NOT public.tenant_has_vendor_mobile(v_tenant) THEN
    RAISE EXCEPTION 'Plano não permite';
  END IF;
  IF v_status != 'disponivel' THEN
    RAISE EXCEPTION 'Vendedor não está disponível (status: %)', v_status;
  END IF;
  IF v_pos IS NULL OR v_pos != 1 THEN
    RAISE EXCEPTION 'Você não é o próximo da fila';
  END IF;

  SELECT id INTO v_turno FROM public.turnos
    WHERE tenant_id = v_tenant AND fechamento IS NULL
    ORDER BY abertura DESC LIMIT 1;
  IF v_turno IS NULL THEN RAISE EXCEPTION 'Nenhum turno aberto'; END IF;

  IF p_canal_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.canais_origem WHERE id = p_canal_id AND tenant_id = v_tenant) THEN
      RAISE EXCEPTION 'Canal de origem inválido';
    END IF;
  END IF;

  INSERT INTO public.atendimentos (vendedor_id, turno_id, inicio, resultado, canal_origem_id, tenant_id)
    VALUES (v_vendedor_id, v_turno, now(), 'em_andamento'::atendimento_resultado, p_canal_id, v_tenant)
    RETURNING id INTO v_atend_id;

  UPDATE public.vendedores
    SET status = 'em_atendimento'::vendedor_status, posicao_fila = NULL, updated_at = now()
    WHERE id = v_vendedor_id AND tenant_id = v_tenant;

  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY posicao_fila) AS new_pos
    FROM public.vendedores
    WHERE tenant_id = v_tenant
      AND COALESCE(setor, 'loja') = COALESCE(v_setor, 'loja')
      AND posicao_fila IS NOT NULL
      AND id != v_vendedor_id
  )
  UPDATE public.vendedores v SET posicao_fila = o.new_pos
    FROM ordered o WHERE v.id = o.id;

  RETURN v_atend_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_start_attendance(UUID) TO authenticated;

-- ─── 10. Vendedor finaliza atendimento (com outcome + anti-abuso 2min) ───
CREATE OR REPLACE FUNCTION public.vendor_finish_attendance(
  p_atend_id UUID,
  p_resultado TEXT,
  p_valor NUMERIC DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL,
  p_detalhe TEXT DEFAULT NULL,
  p_produto TEXT DEFAULT NULL,
  p_fidelizado BOOLEAN DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_vendedor_id UUID;
  v_tenant UUID;
  v_setor TEXT;
  v_max_pos INT;
  v_inicio TIMESTAMPTZ;
  v_elapsed INT;
BEGIN
  SELECT v.id, v.tenant_id, v.setor INTO v_vendedor_id, v_tenant, v_setor
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid();

  IF v_vendedor_id IS NULL THEN RAISE EXCEPTION 'Vendedor não vinculado'; END IF;
  IF NOT public.tenant_has_vendor_mobile(v_tenant) THEN
    RAISE EXCEPTION 'Plano não permite';
  END IF;

  SELECT inicio INTO v_inicio FROM public.atendimentos
    WHERE id = p_atend_id AND vendedor_id = v_vendedor_id AND tenant_id = v_tenant;
  IF v_inicio IS NULL THEN
    RAISE EXCEPTION 'Atendimento não encontrado ou não pertence a você';
  END IF;

  v_elapsed := EXTRACT(EPOCH FROM (now() - v_inicio))::int;

  -- Anti-abuso: só cancelar passa antes de 2min
  IF v_elapsed < 120 AND p_resultado NOT IN ('cancelar') THEN
    RAISE EXCEPTION 'Aguarde pelo menos 2 minutos antes de finalizar (decorridos: %s)', v_elapsed;
  END IF;

  IF p_resultado = 'cancelar' THEN
    DELETE FROM public.atendimentos WHERE id = p_atend_id AND tenant_id = v_tenant;
  ELSE
    UPDATE public.atendimentos
      SET fim = now(),
          resultado = p_resultado::atendimento_resultado,
          valor_venda = p_valor,
          motivo_perda = CASE WHEN p_motivo IS NOT NULL THEN p_motivo::motivo_perda ELSE NULL END,
          motivo_detalhe = p_detalhe,
          produto_ruptura = p_produto,
          cliente_fidelizado = COALESCE(p_fidelizado, false)
      WHERE id = p_atend_id AND tenant_id = v_tenant;
  END IF;

  SELECT COALESCE(MAX(posicao_fila), 0) INTO v_max_pos
    FROM public.vendedores
    WHERE tenant_id = v_tenant
      AND COALESCE(setor, 'loja') = COALESCE(v_setor, 'loja')
      AND posicao_fila IS NOT NULL;

  UPDATE public.vendedores
    SET status = 'disponivel'::vendedor_status,
        posicao_fila = v_max_pos + 1,
        updated_at = now()
    WHERE id = v_vendedor_id AND tenant_id = v_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_finish_attendance(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ─── 11. Push subscription ops ───
CREATE OR REPLACE FUNCTION public.vendor_save_push_subscription(
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT,
  p_user_agent TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_vendedor_id UUID;
  v_tenant UUID;
BEGIN
  SELECT v.id, v.tenant_id INTO v_vendedor_id, v_tenant
    FROM public.vendedores v WHERE v.auth_user_id = auth.uid();

  IF v_vendedor_id IS NULL THEN RAISE EXCEPTION 'Vendedor não vinculado'; END IF;
  IF NOT public.tenant_has_vendor_mobile(v_tenant) THEN
    RAISE EXCEPTION 'Plano não permite';
  END IF;

  INSERT INTO public.push_subscriptions (vendedor_id, tenant_id, endpoint, p256dh, auth_key, user_agent)
    VALUES (v_vendedor_id, v_tenant, p_endpoint, p_p256dh, p_auth, p_user_agent)
    ON CONFLICT (vendedor_id, endpoint) DO UPDATE
      SET p256dh = EXCLUDED.p256dh,
          auth_key = EXCLUDED.auth_key,
          user_agent = EXCLUDED.user_agent,
          last_used_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_save_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.vendor_delete_push_subscription(p_endpoint TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_vendedor_id UUID;
BEGIN
  SELECT v.id INTO v_vendedor_id FROM public.vendedores v WHERE v.auth_user_id = auth.uid();
  IF v_vendedor_id IS NULL THEN RETURN; END IF;
  DELETE FROM public.push_subscriptions
    WHERE vendedor_id = v_vendedor_id AND endpoint = p_endpoint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_delete_push_subscription(TEXT) TO authenticated;

-- ─── 12. Admin: link vendedor a conta auth (pós-criação manual no dashboard) ───
CREATE OR REPLACE FUNCTION public.link_vendedor_auth(p_vendedor_id UUID, p_auth_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_tenant UUID;
  v_vendedor_tenant UUID;
  v_caller_role TEXT;
BEGIN
  v_caller_tenant := public.get_my_tenant_id();
  v_caller_role := (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'user_role');

  IF v_caller_role NOT IN ('owner', 'admin', 'gerente') THEN
    RAISE EXCEPTION 'Apenas owner/admin/gerente podem vincular vendedores';
  END IF;

  SELECT tenant_id INTO v_vendedor_tenant FROM public.vendedores WHERE id = p_vendedor_id;
  IF v_vendedor_tenant IS NULL THEN
    RAISE EXCEPTION 'Vendedor não encontrado';
  END IF;
  IF v_vendedor_tenant != v_caller_tenant THEN
    RAISE EXCEPTION 'Vendedor não pertence ao seu tenant';
  END IF;

  UPDATE public.vendedores SET auth_user_id = p_auth_user_id, updated_at = now()
    WHERE id = p_vendedor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_vendedor_auth(UUID, UUID) TO authenticated;
