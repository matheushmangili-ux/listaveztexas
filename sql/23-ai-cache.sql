-- ============================================
-- minhavez — Fase 7: AI Integration (Gemini)
--
-- ai_cache: cache de respostas da IA
-- app_secrets: adicionar gemini_api_key
--
-- APLICAR VIA SUPABASE SQL EDITOR
-- Depois: inserir key em app_secrets:
--   INSERT INTO app_secrets (key, value) VALUES ('gemini_api_key', 'SUA_KEY');
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_cache (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cache_key  TEXT NOT NULL,
  response   JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_cache_key
  ON public.ai_cache(tenant_id, cache_key);
CREATE INDEX IF NOT EXISTS idx_ai_cache_expiry
  ON public.ai_cache(expires_at);

ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;
