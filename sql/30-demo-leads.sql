-- ============================================
-- minhavez — demo_leads (captura de leads do form Elite na landing)
-- Anônimos podem INSERT (form público), só service_role lê/atualiza.
-- ============================================

CREATE TABLE IF NOT EXISTS public.demo_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  whatsapp      TEXT NOT NULL,
  store_size    TEXT,
  status        TEXT NOT NULL DEFAULT 'new',  -- new | contacted | won | lost
  notes         TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  utm_term      TEXT,
  utm_content   TEXT,
  user_agent    TEXT,
  referrer      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_leads_status_idx     ON public.demo_leads (status);
CREATE INDEX IF NOT EXISTS demo_leads_created_at_idx ON public.demo_leads (created_at DESC);

ALTER TABLE public.demo_leads ENABLE ROW LEVEL SECURITY;

-- Anon pode INSERT (form público da landing)
DROP POLICY IF EXISTS "demo_leads_insert_anon" ON public.demo_leads;
CREATE POLICY "demo_leads_insert_anon"
  ON public.demo_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Validações básicas pra evitar lixo: nome e whatsapp obrigatórios + tamanho razoável
    char_length(name) BETWEEN 2 AND 120
    AND char_length(whatsapp) BETWEEN 8 AND 30
  );

-- SELECT/UPDATE só via service_role (sem policy = sem acesso pra anon/auth)
-- Acesso administrativo via Supabase Studio ou edge function autenticada.

COMMENT ON TABLE public.demo_leads IS 'Leads do form Elite na landing. Insert público, leitura só service_role.';
