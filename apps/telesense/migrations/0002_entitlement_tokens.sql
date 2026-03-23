CREATE TABLE IF NOT EXISTS entitlement_tokens (
  token_id TEXT PRIMARY KEY,
  budget_key TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  secret_version INTEGER NOT NULL,
  label TEXT,
  active INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entitlement_tokens_budget_key
  ON entitlement_tokens (budget_key, updated_at DESC, created_at DESC);
