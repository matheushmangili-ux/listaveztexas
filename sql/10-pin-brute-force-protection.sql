-- Brute-force protection for PIN login
-- Tracks failed attempts per slug and locks out after 5 consecutive failures for 15 minutes

CREATE TABLE IF NOT EXISTS pin_login_attempts (
  slug TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only service role can access this table (used by Edge Function with service key)
ALTER TABLE pin_login_attempts ENABLE ROW LEVEL SECURITY;

-- No public access; the Edge Function uses the service role key which bypasses RLS
CREATE POLICY "no public access" ON pin_login_attempts
  FOR ALL TO public USING (false);
