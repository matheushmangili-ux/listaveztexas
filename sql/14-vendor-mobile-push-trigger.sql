-- ============================================
-- minhavez Vendedor — Trigger de push + app_secrets + VAPID keys
-- Aplicado no Supabase em 2026-04-11 como migration "vendor_mobile_secrets_and_vapid"
-- e "vendor_mobile_push_trigger"
--
-- Quando vendedores.posicao_fila vira 1 (de qq outro valor),
-- chama a Edge Function send-vendor-push via pg_net
-- ============================================

-- ─── 1. Tabela de secrets (trancada; só service_role lê) ───
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM anon, authenticated;
-- Sem policies = sem acesso via anon/authenticated
-- service_role (Edge Functions) bypassa RLS e lê normalmente

-- VAPID keys foram geradas localmente via Node crypto e inseridas uma vez.
-- Se precisar regenerar:
--   node -e "const c=require('crypto');const {publicKey,privateKey}=c.generateKeyPairSync('ec',{namedCurve:'P-256'});const p=publicKey.export({format:'jwk'});const q=privateKey.export({format:'jwk'});const raw=Buffer.concat([Buffer.from([0x04]),Buffer.from(p.x,'base64url'),Buffer.from(p.y,'base64url')]).toString('base64url');console.log('pub=',raw);console.log('priv=',q.d);"

-- ─── 2. RPC pública pro client ler só a public key ───
CREATE OR REPLACE FUNCTION public.get_vapid_public_key()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT value FROM public.app_secrets WHERE key = 'vapid_public_key';
$$;

GRANT EXECUTE ON FUNCTION public.get_vapid_public_key() TO authenticated, anon;

-- ─── 3. pg_net extension (pra HTTP fire-and-forget dentro do Postgres) ───
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── 4. Função de trigger: dispara HTTP POST pra Edge Function ───
CREATE OR REPLACE FUNCTION public.trigger_send_vendor_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_url TEXT;
BEGIN
  -- Só dispara se o vendedor ACABOU de virar #1 (transição real)
  IF NEW.posicao_fila IS DISTINCT FROM 1 THEN RETURN NEW; END IF;
  IF OLD.posicao_fila IS NOT DISTINCT FROM 1 THEN RETURN NEW; END IF;

  -- Só se o tenant tiver o módulo ativo (evita HTTP call desnecessário)
  IF NOT public.tenant_has_vendor_mobile(NEW.tenant_id) THEN RETURN NEW; END IF;

  SELECT value INTO v_url FROM public.app_secrets WHERE key = 'edge_fn_send_vendor_push';
  IF v_url IS NULL THEN RETURN NEW; END IF;

  -- Fire-and-forget: pg_net.http_post é async
  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'vendedores',
      'schema', 'public',
      'record', row_to_json(NEW)::jsonb,
      'old_record', row_to_json(OLD)::jsonb
    ),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 2000
  );

  RETURN NEW;
END;
$$;

-- ─── 5. Trigger ───
DROP TRIGGER IF EXISTS vendedores_next_in_line_push ON public.vendedores;
CREATE TRIGGER vendedores_next_in_line_push
  AFTER UPDATE OF posicao_fila ON public.vendedores
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_vendor_push();
