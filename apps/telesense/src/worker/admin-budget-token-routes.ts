import type { EntitlementTokenRegistryValueRecord } from "./host-admin-registry"
import type { WorkerAdminEnv, WorkerBudgetFieldDeps, WorkerRouteApp } from "./admin-route-types"

export function registerAdminBudgetTokenRoutes<TEnv extends WorkerAdminEnv>(
  app: WorkerRouteApp,
  deps: WorkerBudgetFieldDeps<TEnv> & {
    inspectBudget: (env: TEnv, budgetKey: string) => Promise<any>
    mintServiceEntitlementTokenForBudget: (
      env: TEnv,
      budgetKey: string,
      label?: string,
    ) => Promise<any>
    getReusableServiceEntitlementTokenForBudget: (
      env: TEnv,
      budgetKey: string,
    ) => Promise<string | null>
    listEntitlementTokensByBudgetKey: (env: TEnv, budgetKey: string) => Promise<any[]>
    getEntitlementTokenRegistry: (
      env: TEnv,
      tokenId: string,
    ) => Promise<EntitlementTokenRegistryValueRecord | null>
    updateEntitlementTokenLabel: (
      env: TEnv,
      args: { tokenId: string; label: string | null },
    ) => Promise<void>
    updateEntitlementTokenActive: (
      env: TEnv,
      args: { tokenId: string; active: boolean },
    ) => Promise<void>
    deleteEntitlementTokenRegistry: (env: TEnv, tokenId: string) => Promise<void>
    getOrCreateBudgetAdminToken: (env: TEnv, budgetKey: string) => Promise<string>
    updateBudgetRegistryLabel: (
      env: TEnv,
      args: { budgetKey: string; label: string | null },
    ) => Promise<void>
    ensureMonthlyAllowanceForBudget: (env: TEnv, budgetKey: string) => Promise<any>
    getEntitlementBudgetByKey: (env: TEnv, budgetKey: string) => DurableObjectStub
    listMonthlyAllowanceRegistry: (
      env: TEnv,
    ) => Promise<Array<{ allowanceId: string; budgetKey: string }>>
    getMonthlyAllowanceStatusById: (env: TEnv, allowanceId: string) => Promise<any>
    configureMonthlyAllowanceById: (
      env: TEnv,
      allowanceId: string,
      config: {
        budgetKey: string
        resetAmountBytes: number
        cronExpr: string
        active: boolean
      },
    ) => Promise<any>
    deleteEntitlementTokensByBudgetKey: (env: TEnv, budgetKey: string) => Promise<void>
    deleteBudgetAdminTokenRegistry: (env: TEnv, budgetKey: string) => Promise<void>
    deleteMonthlyAllowanceRegistryByBudgetKey: (env: TEnv, budgetKey: string) => Promise<void>
    deleteBudgetRegistry: (env: TEnv, budgetKey: string) => Promise<void>
  },
) {
  const {
    defaultBudgetKey,
    badRequest,
    readJsonBody,
    requiredTrimmedField,
    requireAdminSession,
    requireBudgetAccess,
    inspectBudget,
    mintServiceEntitlementTokenForBudget,
    getReusableServiceEntitlementTokenForBudget,
    listEntitlementTokensByBudgetKey,
    getEntitlementTokenRegistry,
    updateEntitlementTokenLabel,
    updateEntitlementTokenActive,
    deleteEntitlementTokenRegistry,
    getOrCreateBudgetAdminToken,
    updateBudgetRegistryLabel,
    ensureMonthlyAllowanceForBudget,
    getEntitlementBudgetByKey,
    listMonthlyAllowanceRegistry,
    getMonthlyAllowanceStatusById,
    configureMonthlyAllowanceById,
    deleteEntitlementTokensByBudgetKey,
    deleteBudgetAdminTokenRegistry,
    deleteMonthlyAllowanceRegistryByBudgetKey,
    deleteBudgetRegistry,
  } = deps

  app.post("/admin/entitlement/mint", async (c) => {
    const env = c.env

    let body: { budgetKey?: string } = {}
    try {
      if (c.req.header("Content-Length") || c.req.header("content-length")) {
        body = await c.req.json()
      }
    } catch {
      return badRequest(c, "Invalid request body")
    }

    const budgetKey = body.budgetKey?.trim() || defaultBudgetKey(env)
    const access = await requireBudgetAccess(c, budgetKey)
    if (access instanceof Response) return access

    try {
      return c.json(await mintServiceEntitlementTokenForBudget(env, budgetKey))
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
    }
  })

  app.get("/admin/entitlement/tokens", async (c) => {
    const budgetKey = c.req.query("budgetKey")?.trim() || defaultBudgetKey(c.env)
    const access = await requireBudgetAccess(c, budgetKey)
    if (access instanceof Response) return access

    return c.json({
      tokens: await listEntitlementTokensByBudgetKey(c.env, budgetKey),
    })
  })

  app.get("/admin/entitlement/tokens/value", async (c) => {
    const budgetKey = c.req.query("budgetKey")?.trim() || defaultBudgetKey(c.env)
    const tokenId = c.req.query("tokenId")?.trim()
    if (!tokenId) {
      return badRequest(c, "tokenId required")
    }

    const access = await requireBudgetAccess(c, budgetKey)
    if (access instanceof Response) return access

    const tokenRecord = await getEntitlementTokenRegistry(c.env, tokenId)
    if (!tokenRecord || tokenRecord.budgetKey !== budgetKey) {
      return c.json({ error: "Token not found", code: "NOT_FOUND" }, 404)
    }

    return c.json({
      tokenId,
      tokenValue: tokenRecord.tokenValue,
      tokenPreview: tokenRecord.tokenPreview,
    })
  })

  app.post("/admin/entitlement/tokens/label", async (c) => {
    const bodyResult = await readJsonBody<{
      budgetKey?: string
      tokenId?: string
      label?: string | null
    }>(c)
    if (bodyResult instanceof Response) return bodyResult
    const body = bodyResult

    const budgetKey = body.budgetKey?.trim() || defaultBudgetKey(c.env)
    const tokenId = requiredTrimmedField(c, body.tokenId, "tokenId")
    if (tokenId instanceof Response) return tokenId

    const access = await requireBudgetAccess(c, budgetKey)
    if (access instanceof Response) return access

    const tokenRecord = await getEntitlementTokenRegistry(c.env, tokenId)
    if (!tokenRecord || tokenRecord.budgetKey !== budgetKey) {
      return c.json({ error: "Token not found", code: "NOT_FOUND" }, 404)
    }

    await updateEntitlementTokenLabel(c.env, {
      tokenId,
      label: body.label?.trim() || null,
    })

    return c.json({
      ok: true,
      token: await getEntitlementTokenRegistry(c.env, tokenId),
    })
  })

  app.post("/admin/entitlement/tokens/active", async (c) => {
    const bodyResult = await readJsonBody<{
      budgetKey?: string
      tokenId?: string
      active?: boolean
    }>(c)
    if (bodyResult instanceof Response) return bodyResult
    const body = bodyResult

    const budgetKey = body.budgetKey?.trim() || defaultBudgetKey(c.env)
    const tokenId = requiredTrimmedField(c, body.tokenId, "tokenId")
    if (tokenId instanceof Response) return tokenId
    if (typeof body.active !== "boolean") {
      return badRequest(c, "active must be boolean")
    }

    const access = await requireBudgetAccess(c, budgetKey)
    if (access instanceof Response) return access

    const tokenRecord = await getEntitlementTokenRegistry(c.env, tokenId)
    if (!tokenRecord || tokenRecord.budgetKey !== budgetKey) {
      return c.json({ error: "Token not found", code: "NOT_FOUND" }, 404)
    }

    await updateEntitlementTokenActive(c.env, {
      tokenId,
      active: body.active,
    })

    return c.json({
      ok: true,
      token: await getEntitlementTokenRegistry(c.env, tokenId),
    })
  })

  app.post("/admin/entitlement/tokens/delete", async (c) => {
    const bodyResult = await readJsonBody<{ budgetKey?: string; tokenId?: string }>(c)
    if (bodyResult instanceof Response) return bodyResult
    const body = bodyResult

    const budgetKey = body.budgetKey?.trim() || defaultBudgetKey(c.env)
    const tokenId = requiredTrimmedField(c, body.tokenId, "tokenId")
    if (tokenId instanceof Response) return tokenId

    const access = await requireBudgetAccess(c, budgetKey)
    if (access instanceof Response) return access

    const tokenRecord = await getEntitlementTokenRegistry(c.env, tokenId)
    if (!tokenRecord || tokenRecord.budgetKey !== budgetKey) {
      return c.json({ error: "Token not found", code: "NOT_FOUND" }, 404)
    }

    await deleteEntitlementTokenRegistry(c.env, tokenId)

    return c.json({
      ok: true,
      tokenId,
    })
  })

  app.post("/admin/budget-admin/mint", async (c) => {
    const env = c.env
    const adminError = await requireAdminSession(c)
    if (adminError) return adminError

    let body: { budgetKey?: string } = {}
    try {
      if (c.req.header("Content-Length") || c.req.header("content-length")) {
        body = await c.req.json()
      }
    } catch {
      return badRequest(c, "Invalid request body")
    }

    const budgetKey = body.budgetKey?.trim() || defaultBudgetKey(env)
    const budgetData = await inspectBudget(env, budgetKey)
    const budgetAdminToken = await getOrCreateBudgetAdminToken(env, budgetKey)

    return c.json({
      budgetAdminToken,
      budgetKey,
      budgetId: budgetData.budgetId,
    })
  })

  app.post("/admin/entitlement/rotate", async (c) => {
    const adminError = await requireAdminSession(c)
    if (adminError) return adminError

    const env = c.env
    let body: { budgetKey?: string } = {}
    try {
      if (c.req.header("Content-Length") || c.req.header("content-length")) {
        body = await c.req.json()
      }
    } catch {
      return badRequest(c, "Invalid request body")
    }

    const budgetKey = body.budgetKey?.trim() || defaultBudgetKey(env)
    const budget = getEntitlementBudgetByKey(env, budgetKey)
    const rotateRes = await budget.fetch(
      new Request("http://do.internal/?action=rotateSecret", { method: "POST" }),
    )

    if (!rotateRes.ok) {
      return c.json({ error: "Failed to rotate secret" }, 500)
    }

    const result = (await rotateRes.json()) as { version: number }
    const budgetData = await inspectBudget(env, budgetKey)

    return c.json({
      ok: true,
      budgetKey,
      budgetId: budgetData.budgetId,
      secretVersion: result.version,
      note: "Old tokens are now invalid. New tokens must use the current secret version.",
    })
  })

  app.get("/admin/entitlement/budget", async (c) => {
    const env = c.env
    const budgetKey = c.req.query("budgetKey")?.trim() || defaultBudgetKey(env)
    const access = await requireBudgetAccess(c, budgetKey)
    if (access instanceof Response) return access

    try {
      return c.json(await inspectBudget(env, budgetKey))
    } catch {
      return c.json({ error: "Failed to get budget data" }, 500)
    }
  })

  app.post("/admin/entitlement/budget/create", async (c) => {
    const adminError = await requireAdminSession(c)
    if (adminError) return adminError

    const bodyResult = await readJsonBody<{ budgetKey?: string; label?: string | null }>(c)
    if (bodyResult instanceof Response) return bodyResult
    const body = bodyResult

    const budgetKey = requiredTrimmedField(c, body.budgetKey, "budgetKey")
    if (budgetKey instanceof Response) return budgetKey

    try {
      const budgetData = await inspectBudget(c.env, budgetKey)
      const existingToken = await getReusableServiceEntitlementTokenForBudget(c.env, budgetKey)
      const serviceEntitlementToken =
        existingToken ??
        (await mintServiceEntitlementTokenForBudget(c.env, budgetKey, "Example token label"))
          .serviceEntitlementToken
      const label = body.label?.trim() || null
      if (label !== null) {
        await updateBudgetRegistryLabel(c.env, { budgetKey, label })
        return c.json({
          ...(await inspectBudget(c.env, budgetKey)),
          serviceEntitlementToken,
        })
      }
      return c.json({
        ...budgetData,
        serviceEntitlementToken,
      })
    } catch {
      return c.json({ error: "Failed to create budget" }, 500)
    }
  })

  app.post("/admin/entitlement/budget-label", async (c) => {
    const bodyResult = await readJsonBody<{ budgetKey?: string; label?: string | null }>(c)
    if (bodyResult instanceof Response) return bodyResult
    const body = bodyResult

    const budgetKey = requiredTrimmedField(c, body.budgetKey, "budgetKey")
    if (budgetKey instanceof Response) return budgetKey
    const access = await requireBudgetAccess(c, budgetKey)
    if (access instanceof Response) return access

    const label = body.label?.trim() || null
    await updateBudgetRegistryLabel(c.env, { budgetKey, label })

    try {
      return c.json(await inspectBudget(c.env, budgetKey))
    } catch {
      return c.json({ error: "Failed to update budget label" }, 500)
    }
  })

  app.post("/admin/entitlement/budget/remaining", async (c) => {
    const adminError = await requireAdminSession(c)
    if (adminError) return adminError

    const bodyResult = await readJsonBody<{ budgetKey?: string; remainingBytes?: number }>(c)
    if (bodyResult instanceof Response) return bodyResult
    const body = bodyResult

    const budgetKey = requiredTrimmedField(c, body.budgetKey, "budgetKey")
    if (budgetKey instanceof Response) return budgetKey
    if (!Number.isFinite(body.remainingBytes) || (body.remainingBytes ?? 0) < 0) {
      return badRequest(c, "remainingBytes must be >= 0")
    }

    try {
      const monthlyAllowance = await ensureMonthlyAllowanceForBudget(c.env, budgetKey)
      const currentBudget = await inspectBudget(c.env, budgetKey)
      const configuredTotal =
        monthlyAllowance.resetAmountBytes > 0
          ? monthlyAllowance.resetAmountBytes
          : currentBudget.allowance.remainingBytes + currentBudget.allowance.consumedBytes
      const totalBytes = Math.max(configuredTotal, body.remainingBytes ?? 0)
      const remainingBytes = Math.min(body.remainingBytes ?? 0, totalBytes)
      const consumedBytes = Math.max(0, totalBytes - remainingBytes)

      const budget = getEntitlementBudgetByKey(c.env, budgetKey)
      const setRes = await budget.fetch(
        new Request("http://do.internal/?action=setSnapshot", {
          method: "POST",
          body: JSON.stringify({ remainingBytes, consumedBytes }),
        }),
      )
      if (!setRes.ok) {
        throw new Error(await setRes.text())
      }
      return c.json(await inspectBudget(c.env, budgetKey))
    } catch {
      return c.json({ error: "Failed to set current remaining budget" }, 500)
    }
  })

  app.post("/admin/entitlement/budget/enabled", async (c) => {
    const adminError = await requireAdminSession(c)
    if (adminError) return adminError

    const bodyResult = await readJsonBody<{ budgetKey?: string; enabled?: boolean }>(c)
    if (bodyResult instanceof Response) return bodyResult
    const body = bodyResult

    const budgetKey = requiredTrimmedField(c, body.budgetKey, "budgetKey")
    if (budgetKey instanceof Response) return budgetKey
    if (typeof body.enabled !== "boolean") {
      return badRequest(c, "enabled must be boolean")
    }

    try {
      const budget = getEntitlementBudgetByKey(c.env, budgetKey)
      const setRes = await budget.fetch(
        new Request("http://do.internal/?action=setEnabled", {
          method: "POST",
          body: JSON.stringify({ enabled: body.enabled }),
        }),
      )
      if (!setRes.ok) {
        throw new Error(await setRes.text())
      }
      return c.json(await inspectBudget(c.env, budgetKey))
    } catch {
      return c.json({ error: "Failed to set budget enabled state" }, 500)
    }
  })

  app.post("/admin/entitlement/budget/archive", async (c) => {
    const adminError = await requireAdminSession(c)
    if (adminError) return adminError

    const bodyResult = await readJsonBody<{ budgetKey?: string }>(c)
    if (bodyResult instanceof Response) return bodyResult
    const body = bodyResult

    const budgetKey = requiredTrimmedField(c, body.budgetKey, "budgetKey")
    if (budgetKey instanceof Response) return budgetKey
    if (budgetKey === defaultBudgetKey(c.env)) {
      return badRequest(c, "Default budget cannot be archived")
    }

    try {
      const originalBudget = await inspectBudget(c.env, budgetKey)
      const allowanceRecords = (await listMonthlyAllowanceRegistry(c.env)).filter(
        (record) => record.budgetKey === budgetKey,
      )
      const originalAllowanceStates = await Promise.all(
        allowanceRecords.map(async (record) => ({
          allowanceId: record.allowanceId,
          status: await getMonthlyAllowanceStatusById(c.env, record.allowanceId),
        })),
      )

      const budget = getEntitlementBudgetByKey(c.env, budgetKey)
      let archiveCommitted = false

      try {
        for (const allowanceState of originalAllowanceStates) {
          await configureMonthlyAllowanceById(c.env, allowanceState.allowanceId, {
            budgetKey,
            resetAmountBytes: 0,
            cronExpr: allowanceState.status.cronExpr || "0 0 1 * *",
            active: false,
          })
        }

        const disableBudgetRes = await budget.fetch(
          new Request("http://do.internal/?action=setEnabled", {
            method: "POST",
            body: JSON.stringify({ enabled: false }),
          }),
        )
        if (!disableBudgetRes.ok) {
          throw new Error(await disableBudgetRes.text())
        }

        await deleteEntitlementTokensByBudgetKey(c.env, budgetKey)
        await deleteBudgetAdminTokenRegistry(c.env, budgetKey)
        await deleteMonthlyAllowanceRegistryByBudgetKey(c.env, budgetKey)
        await deleteBudgetRegistry(c.env, budgetKey)
        archiveCommitted = true
      } finally {
        if (!archiveCommitted) {
          await Promise.allSettled([
            budget.fetch(
              new Request("http://do.internal/?action=setEnabled", {
                method: "POST",
                body: JSON.stringify({ enabled: originalBudget.enabled }),
              }),
            ),
            ...originalAllowanceStates.map((allowanceState) =>
              configureMonthlyAllowanceById(c.env, allowanceState.allowanceId, {
                budgetKey: allowanceState.status.budgetKey,
                resetAmountBytes: allowanceState.status.resetAmountBytes,
                cronExpr: allowanceState.status.cronExpr,
                active: allowanceState.status.active,
              }),
            ),
          ])
        }
      }

      return c.json({ ok: true, budgetKey })
    } catch {
      return c.json({ error: "Failed to archive budget" }, 500)
    }
  })
}
