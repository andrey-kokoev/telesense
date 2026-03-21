export type BudgetRegistryRecord = {
  budgetKey: string
  budgetId: string
  label: string | null
  createdAt: number
  updatedAt: number
}

export type MonthlyAllowanceRegistryRecord = {
  allowanceId: string
  budgetKey: string
  active: boolean
  cronExpr: string
  createdAt: number
  updatedAt: number
}

type RegistryEnv = {
  HOST_ADMIN_DB?: D1Database
}

export async function upsertBudgetRegistry(
  env: RegistryEnv,
  record: { budgetKey: string; budgetId: string; label?: string | null },
) {
  const db = env.HOST_ADMIN_DB
  if (!db) return

  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO entitlement_budgets (budget_key, budget_id, label, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?4)
       ON CONFLICT(budget_key) DO UPDATE SET
         budget_id = excluded.budget_id,
         label = excluded.label,
         updated_at = excluded.updated_at`,
    )
    .bind(record.budgetKey, record.budgetId, record.label ?? null, now)
    .run()
}

export async function upsertMonthlyAllowanceRegistry(
  env: RegistryEnv,
  record: { allowanceId: string; budgetKey: string; active: boolean; cronExpr: string },
) {
  const db = env.HOST_ADMIN_DB
  if (!db) return

  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO monthly_allowances (allowance_id, budget_key, active, cron_expr, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(allowance_id) DO UPDATE SET
         budget_key = excluded.budget_key,
         active = excluded.active,
         cron_expr = excluded.cron_expr,
         updated_at = excluded.updated_at`,
    )
    .bind(record.allowanceId, record.budgetKey, record.active ? 1 : 0, record.cronExpr, now)
    .run()
}

export async function listBudgetRegistry(env: RegistryEnv): Promise<BudgetRegistryRecord[]> {
  const db = env.HOST_ADMIN_DB
  if (!db) return []

  const result = await db
    .prepare(
      `SELECT budget_key, budget_id, label, created_at, updated_at
       FROM entitlement_budgets
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .all<{
      budget_key: string
      budget_id: string
      label: string | null
      created_at: number
      updated_at: number
    }>()

  return (result.results ?? []).map((row) => ({
    budgetKey: row.budget_key,
    budgetId: row.budget_id,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function listMonthlyAllowanceRegistry(
  env: RegistryEnv,
): Promise<MonthlyAllowanceRegistryRecord[]> {
  const db = env.HOST_ADMIN_DB
  if (!db) return []

  const result = await db
    .prepare(
      `SELECT allowance_id, budget_key, active, cron_expr, created_at, updated_at
       FROM monthly_allowances
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .all<{
      allowance_id: string
      budget_key: string
      active: number
      cron_expr: string
      created_at: number
      updated_at: number
    }>()

  return (result.results ?? []).map((row) => ({
    allowanceId: row.allowance_id,
    budgetKey: row.budget_key,
    active: row.active === 1,
    cronExpr: row.cron_expr,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function findBudgetKeyByBudgetId(
  env: RegistryEnv,
  budgetId: string,
): Promise<string | null> {
  const db = env.HOST_ADMIN_DB
  if (!db) return null

  const result = await db
    .prepare(`SELECT budget_key FROM entitlement_budgets WHERE budget_id = ?1 LIMIT 1`)
    .bind(budgetId)
    .first<{ budget_key: string }>()

  return result?.budget_key ?? null
}
