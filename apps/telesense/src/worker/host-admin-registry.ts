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

export type EntitlementTokenRegistryRecord = {
  tokenId: string
  budgetKey: string
  budgetId: string
  secretVersion: number
  tokenPreview: string | null
  label: string | null
  active: boolean
  createdAt: number
  updatedAt: number
}

export type EntitlementTokenRegistryValueRecord = EntitlementTokenRegistryRecord & {
  tokenValue: string | null
}

export type BudgetAdminTokenRegistryRecord = {
  budgetKey: string
  token: string
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
  try {
    await db
      .prepare(
        `INSERT INTO entitlement_budgets (budget_key, budget_id, label, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(budget_key) DO UPDATE SET
           budget_id = excluded.budget_id,
           label = COALESCE(excluded.label, entitlement_budgets.label),
           updated_at = excluded.updated_at`,
      )
      .bind(record.budgetKey, record.budgetId, record.label ?? null, now)
      .run()
  } catch (error) {
    console.warn("[host-admin-registry] Failed to upsert budget registry", error)
  }
}

export async function updateBudgetRegistryLabel(
  env: RegistryEnv,
  record: { budgetKey: string; label: string | null },
) {
  const db = env.HOST_ADMIN_DB
  if (!db) return

  const now = Date.now()
  try {
    await db
      .prepare(
        `UPDATE entitlement_budgets
         SET label = ?2, updated_at = ?3
         WHERE budget_key = ?1`,
      )
      .bind(record.budgetKey, record.label, now)
      .run()
  } catch (error) {
    console.warn("[host-admin-registry] Failed to update budget label", error)
  }
}

export async function upsertMonthlyAllowanceRegistry(
  env: RegistryEnv,
  record: { allowanceId: string; budgetKey: string; active: boolean; cronExpr: string },
) {
  const db = env.HOST_ADMIN_DB
  if (!db) return

  const now = Date.now()
  try {
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
  } catch (error) {
    console.warn("[host-admin-registry] Failed to upsert monthly allowance registry", error)
  }
}

export async function listBudgetRegistry(env: RegistryEnv): Promise<BudgetRegistryRecord[]> {
  const db = env.HOST_ADMIN_DB
  if (!db) return []

  try {
    const result = await db
      .prepare(
        `SELECT budget_key, budget_id, label, created_at, updated_at
         FROM entitlement_budgets
         ORDER BY lower(COALESCE(label, budget_key)) ASC, lower(budget_key) ASC`,
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
  } catch (error) {
    console.warn("[host-admin-registry] Failed to list budget registry", error)
    return []
  }
}

export async function listMonthlyAllowanceRegistry(
  env: RegistryEnv,
): Promise<MonthlyAllowanceRegistryRecord[]> {
  const db = env.HOST_ADMIN_DB
  if (!db) return []

  try {
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
  } catch (error) {
    console.warn("[host-admin-registry] Failed to list monthly allowance registry", error)
    return []
  }
}

export async function findBudgetKeyByBudgetId(
  env: RegistryEnv,
  budgetId: string,
): Promise<string | null> {
  const db = env.HOST_ADMIN_DB
  if (!db) return null

  try {
    const result = await db
      .prepare(`SELECT budget_key FROM entitlement_budgets WHERE budget_id = ?1 LIMIT 1`)
      .bind(budgetId)
      .first<{ budget_key: string }>()

    return result?.budget_key ?? null
  } catch (error) {
    console.warn("[host-admin-registry] Failed to find budget by id", error)
    return null
  }
}

export async function upsertEntitlementTokenRegistry(
  env: RegistryEnv,
  record: {
    tokenId: string
    budgetKey: string
    budgetId: string
    secretVersion: number
    tokenValue?: string | null
    tokenPreview?: string | null
    label?: string | null
    active?: boolean
  },
) {
  const db = env.HOST_ADMIN_DB
  if (!db) return

  const now = Date.now()
  try {
    await db
      .prepare(
        `INSERT INTO entitlement_tokens (
           token_id, budget_key, budget_id, secret_version, token_value, token_preview, label, active, created_at, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
         ON CONFLICT(token_id) DO UPDATE SET
           budget_key = excluded.budget_key,
           budget_id = excluded.budget_id,
           secret_version = excluded.secret_version,
           token_value = COALESCE(excluded.token_value, entitlement_tokens.token_value),
           token_preview = COALESCE(excluded.token_preview, entitlement_tokens.token_preview),
           label = COALESCE(excluded.label, entitlement_tokens.label),
           active = excluded.active,
           updated_at = excluded.updated_at`,
      )
      .bind(
        record.tokenId,
        record.budgetKey,
        record.budgetId,
        record.secretVersion,
        record.tokenValue ?? null,
        record.tokenPreview ?? null,
        record.label ?? null,
        record.active === false ? 0 : 1,
        now,
      )
      .run()
  } catch (error) {
    console.warn("[host-admin-registry] Failed to upsert entitlement token", error)
  }
}

export async function listEntitlementTokensByBudgetKey(
  env: RegistryEnv,
  budgetKey: string,
): Promise<EntitlementTokenRegistryRecord[]> {
  const db = env.HOST_ADMIN_DB
  if (!db) return []

  try {
    const result = await db
      .prepare(
        `SELECT token_id, budget_key, budget_id, secret_version, token_preview, label, active, created_at, updated_at
         FROM entitlement_tokens
         WHERE budget_key = ?1
         ORDER BY updated_at DESC, created_at DESC`,
      )
      .bind(budgetKey)
      .all<{
        token_id: string
        budget_key: string
        budget_id: string
        secret_version: number
        token_preview: string | null
        label: string | null
        active: number
        created_at: number
        updated_at: number
      }>()

    return (result.results ?? []).map((row) => ({
      tokenId: row.token_id,
      budgetKey: row.budget_key,
      budgetId: row.budget_id,
      secretVersion: row.secret_version,
      tokenPreview: row.token_preview,
      label: row.label,
      active: row.active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  } catch (error) {
    console.warn("[host-admin-registry] Failed to list entitlement tokens", error)
    return []
  }
}

export async function getEntitlementTokenRegistry(
  env: RegistryEnv,
  tokenId: string,
): Promise<EntitlementTokenRegistryValueRecord | null> {
  const db = env.HOST_ADMIN_DB
  if (!db) return null

  try {
    const row = await db
      .prepare(
        `SELECT token_id, budget_key, budget_id, secret_version, token_value, token_preview, label, active, created_at, updated_at
         FROM entitlement_tokens
         WHERE token_id = ?1
         LIMIT 1`,
      )
      .bind(tokenId)
      .first<{
        token_id: string
        budget_key: string
        budget_id: string
        secret_version: number
        token_value: string | null
        token_preview: string | null
        label: string | null
        active: number
        created_at: number
        updated_at: number
      }>()

    if (!row) return null
    return {
      tokenId: row.token_id,
      budgetKey: row.budget_key,
      budgetId: row.budget_id,
      secretVersion: row.secret_version,
      tokenValue: row.token_value,
      tokenPreview: row.token_preview,
      label: row.label,
      active: row.active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  } catch (error) {
    console.warn("[host-admin-registry] Failed to get entitlement token", error)
    return null
  }
}

export async function updateEntitlementTokenLabel(
  env: RegistryEnv,
  record: { tokenId: string; label: string | null },
) {
  const db = env.HOST_ADMIN_DB
  if (!db) return

  const now = Date.now()
  try {
    await db
      .prepare(
        `UPDATE entitlement_tokens
         SET label = ?2, updated_at = ?3
         WHERE token_id = ?1`,
      )
      .bind(record.tokenId, record.label, now)
      .run()
  } catch (error) {
    console.warn("[host-admin-registry] Failed to update entitlement token label", error)
  }
}

export async function updateEntitlementTokenActive(
  env: RegistryEnv,
  record: { tokenId: string; active: boolean },
) {
  const db = env.HOST_ADMIN_DB
  if (!db) return

  const now = Date.now()
  try {
    await db
      .prepare(
        `UPDATE entitlement_tokens
         SET active = ?2, updated_at = ?3
         WHERE token_id = ?1`,
      )
      .bind(record.tokenId, record.active ? 1 : 0, now)
      .run()
  } catch (error) {
    console.warn("[host-admin-registry] Failed to update entitlement token active state", error)
  }
}

export async function deleteEntitlementTokenRegistry(env: RegistryEnv, tokenId: string) {
  const db = env.HOST_ADMIN_DB
  if (!db) return

  try {
    await db
      .prepare(
        `DELETE FROM entitlement_tokens
         WHERE token_id = ?1`,
      )
      .bind(tokenId)
      .run()
  } catch (error) {
    console.warn("[host-admin-registry] Failed to delete entitlement token", error)
  }
}

export async function getBudgetAdminTokenRegistry(
  env: RegistryEnv,
  budgetKey: string,
): Promise<BudgetAdminTokenRegistryRecord | null> {
  const db = env.HOST_ADMIN_DB
  if (!db) return null

  try {
    const row = await db
      .prepare(
        `SELECT budget_key, token, created_at, updated_at
         FROM budget_admin_tokens
         WHERE budget_key = ?1
         LIMIT 1`,
      )
      .bind(budgetKey)
      .first<{
        budget_key: string
        token: string
        created_at: number
        updated_at: number
      }>()

    if (!row) return null
    return {
      budgetKey: row.budget_key,
      token: row.token,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  } catch (error) {
    console.warn("[host-admin-registry] Failed to get budget admin token", error)
    return null
  }
}

export async function upsertBudgetAdminTokenRegistry(
  env: RegistryEnv,
  record: { budgetKey: string; token: string },
) {
  const db = env.HOST_ADMIN_DB
  if (!db) return

  const now = Date.now()
  try {
    await db
      .prepare(
        `INSERT INTO budget_admin_tokens (budget_key, token, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(budget_key) DO UPDATE SET
           token = excluded.token,
           updated_at = excluded.updated_at`,
      )
      .bind(record.budgetKey, record.token, now)
      .run()
  } catch (error) {
    console.warn("[host-admin-registry] Failed to upsert budget admin token", error)
  }
}
