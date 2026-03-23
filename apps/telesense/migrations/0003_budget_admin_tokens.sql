CREATE TABLE IF NOT EXISTS budget_admin_tokens (
  budget_key TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
