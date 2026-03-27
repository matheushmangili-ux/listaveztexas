-- ============================================
-- ListaVez — Stripe Integration Fields
-- Sprint 4: Add Stripe metadata to onboarding_tokens
-- ============================================

-- Add Stripe fields to onboarding_tokens
ALTER TABLE onboarding_tokens ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE onboarding_tokens ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Make owner_email nullable on tenants (for setup flow where email comes from token)
ALTER TABLE tenants ALTER COLUMN owner_email DROP NOT NULL;
