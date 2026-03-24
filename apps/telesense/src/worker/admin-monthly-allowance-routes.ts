import type {
  WorkerAdminEnv,
  WorkerAdminRouteCommonDeps,
  WorkerRouteApp,
} from "./admin-route-types"

export function registerAdminMonthlyAllowanceRoutes<TEnv extends WorkerAdminEnv>(
  app: WorkerRouteApp,
  deps: WorkerAdminRouteCommonDeps<TEnv> & {
    defaultMonthlyAllowanceId: (env: TEnv) => string
    DEFAULT_MONTHLY_ALLOWANCE_RESET_BYTES: number
    ensureMonthlyAllowanceForBudget: (
      env: TEnv,
      budgetKey: string,
      allowanceId?: string,
    ) => Promise<any>
    getEntitlementBudgetByKey: (env: TEnv, budgetKey: string) => DurableObjectStub
    getMonthlyAllowanceById: (env: TEnv, allowanceId: string) => DurableObjectStub
    upsertMonthlyAllowanceRegistry: (
      env: TEnv,
      record: { allowanceId: string; budgetKey: string; active: boolean; cronExpr: string },
    ) => Promise<void>
    materializeBudgetSnapshotIfNeeded: (
      env: TEnv,
      budgetKey: string,
      resetAmountBytes: number,
      active: boolean,
    ) => Promise<void>
  },
) {
  const {
    defaultBudgetKey,
    defaultMonthlyAllowanceId,
    DEFAULT_MONTHLY_ALLOWANCE_RESET_BYTES,
    badRequest,
    readJsonBody,
    requireAdminSession,
    requireBudgetAccess,
    ensureMonthlyAllowanceForBudget,
    getEntitlementBudgetByKey,
    getMonthlyAllowanceById,
    upsertMonthlyAllowanceRegistry,
    materializeBudgetSnapshotIfNeeded,
  } = deps

  app.post("/admin/entitlement/monthly-allowance", async (c) => {
    const bodyResult = await readJsonBody<{
      allowanceId?: string
      budgetKey?: string
      active: boolean
      resetAmountBytes: number
      cronExpr: string
    }>(c)
    if (bodyResult instanceof Response) return bodyResult
    const body = bodyResult

    if (typeof body.active !== "boolean") {
      return badRequest(c, "active must be boolean")
    }
    if (!Number.isFinite(body.resetAmountBytes) || body.resetAmountBytes < 0) {
      return badRequest(c, "resetAmountBytes must be >= 0")
    }
    if (typeof body.cronExpr !== "string" || !body.cronExpr.trim()) {
      return badRequest(c, "cronExpr must be non-empty")
    }

    const budgetKey = body.budgetKey?.trim() || defaultBudgetKey(c.env)
    const access = await requireBudgetAccess(c, budgetKey)
    if (access instanceof Response) return access
    const allowanceId = body.allowanceId?.trim() || defaultMonthlyAllowanceId(c.env)

    const budget = getEntitlementBudgetByKey(c.env, budgetKey)
    const budgetRes = await budget.fetch(new Request("http://do.internal/?action=getBudget"))
    if (!budgetRes.ok) {
      return c.json({ error: "Failed to read entitlement budget" }, 500)
    }

    const monthlyAllowance = getMonthlyAllowanceById(c.env, allowanceId)
    const configureRes = await monthlyAllowance.fetch(
      new Request("http://do.internal/?action=configure", {
        method: "POST",
        body: JSON.stringify({
          budgetKey,
          resetAmountBytes: body.resetAmountBytes,
          cronExpr: body.cronExpr.trim(),
          active: body.active,
        }),
      }),
    )
    if (!configureRes.ok) {
      const errorText = await configureRes.text()
      return c.json({ error: errorText || "Failed to configure monthly allowance" }, 500)
    }

    const result = (await configureRes.json()) as {
      budgetKey: string
      active: boolean
      cronExpr: string
      resetAmountBytes: number
      nextResetAt: number | null
      lastResetAt: number | null
      lifecycle: "inactive" | "scheduled" | "due"
    }

    await upsertMonthlyAllowanceRegistry(c.env, {
      allowanceId,
      budgetKey: result.budgetKey,
      active: result.active,
      cronExpr: result.cronExpr,
    })

    await materializeBudgetSnapshotIfNeeded(
      c.env,
      result.budgetKey,
      result.resetAmountBytes,
      result.active,
    )

    return c.json({
      allowanceId,
      ...result,
    })
  })

  app.get("/admin/entitlement/monthly-allowance", async (c) => {
    const budgetKey = c.req.query("budgetKey")?.trim() || defaultBudgetKey(c.env)
    const access = await requireBudgetAccess(c, budgetKey)
    if (access instanceof Response) return access
    const allowanceId = c.req.query("allowanceId")?.trim()

    try {
      return c.json(await ensureMonthlyAllowanceForBudget(c.env, budgetKey, allowanceId))
    } catch {
      return c.json({ error: "Failed to get monthly allowance" }, 500)
    }
  })

  app.post("/admin/entitlement/monthly-allowance/reset", async (c) => {
    const adminError = await requireAdminSession(c)
    if (adminError) return adminError

    let body: { allowanceId?: string; budgetKey?: string } = {}
    const bodyResult = await readJsonBody<{ allowanceId?: string; budgetKey?: string }>(c)
    if (!(bodyResult instanceof Response)) {
      body = bodyResult
    }

    const budgetKey = body.budgetKey?.trim() || defaultBudgetKey(c.env)
    const allowanceId = body.allowanceId?.trim() || defaultMonthlyAllowanceId(c.env)

    const budget = getEntitlementBudgetByKey(c.env, budgetKey)
    const budgetRes = await budget.fetch(new Request("http://do.internal/?action=getBudget"))
    if (!budgetRes.ok) {
      return c.json({ error: "Failed to read entitlement budget" }, 500)
    }

    const monthlyAllowance = getMonthlyAllowanceById(c.env, allowanceId)
    const configureRes = await monthlyAllowance.fetch(
      new Request("http://do.internal/?action=configure", {
        method: "POST",
        body: JSON.stringify({
          budgetKey,
          resetAmountBytes: DEFAULT_MONTHLY_ALLOWANCE_RESET_BYTES,
          cronExpr: "0 0 1 * *",
          active: true,
        }),
      }),
    )
    if (!configureRes.ok) {
      const errorText = await configureRes.text()
      return c.json({ error: errorText || "Failed to reset monthly allowance" }, 500)
    }

    const result = (await configureRes.json()) as {
      budgetKey: string
      active: boolean
      cronExpr: string
      resetAmountBytes: number
      nextResetAt: number | null
      lastResetAt: number | null
      lifecycle: "inactive" | "scheduled" | "due"
    }

    await upsertMonthlyAllowanceRegistry(c.env, {
      allowanceId,
      budgetKey: result.budgetKey,
      active: result.active,
      cronExpr: result.cronExpr,
    })

    await materializeBudgetSnapshotIfNeeded(
      c.env,
      result.budgetKey,
      result.resetAmountBytes,
      result.active,
    )

    return c.json({
      allowanceId,
      ...result,
    })
  })
}
