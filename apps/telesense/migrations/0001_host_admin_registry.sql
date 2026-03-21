CREATE TABLE IF NOT EXISTS entitlement_budgets (
  budget_key TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS monthly_allowances (
  allowance_id TEXT PRIMARY KEY,
  budget_key TEXT NOT NULL,
  active INTEGER NOT NULL,
  cron_expr TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entitlement_budgets_budget_id
  ON entitlement_budgets (budget_id);

CREATE INDEX IF NOT EXISTS idx_monthly_allowances_budget_key
  ON monthly_allowances (budget_key);
