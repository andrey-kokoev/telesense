import type {
  WorkerAdminEnv,
  WorkerAdminRouteCommonDeps,
  WorkerRouteApp,
} from "./admin-route-types"

export function registerAdminAuthRoutes<TEnv extends WorkerAdminEnv>(
  app: WorkerRouteApp,
  deps: WorkerAdminRouteCommonDeps<TEnv> & {
    isKnownBudgetKey: (env: TEnv, budgetKey: string) => Promise<boolean>
    isAuthDisabled: (env: TEnv) => boolean
    serviceEntitlementHeader: (c: any) => string | undefined
    serviceEntitlementErrorResponse: (
      c: any,
      error: string,
      code: string,
      status: 400 | 401 | 402 | 403 | 404 | 429 | 500 | 503,
    ) => Response
    verifyServiceEntitlementToken: (env: TEnv, token: string | null | undefined) => Promise<any>
    hostAdminHeader: string
    budgetAdminHeader: string
    mintHostAdminSessionToken: (secret: string) => Promise<string>
    mintBudgetAdminSessionToken: (secret: string, budgetKey: string) => Promise<string>
    verifyBudgetAdminToken: (
      token: string | null | undefined,
      secret: string,
    ) => Promise<{ valid: true; claims: { budgetKey: string } } | { valid: false }>
    getBudgetAdminTokenRegistry: (env: TEnv, budgetKey: string) => Promise<{ token: string } | null>
    resolveHostAdminAccess: (options: {
      env: TEnv
      token: string
      defaultBudgetKey: string
      isAuthDisabled: boolean
      getReusableServiceEntitlementTokenForBudget: (
        env: TEnv,
        budgetKey: string,
      ) => Promise<string | null>
      mintServiceEntitlementTokenForBudget: (
        env: TEnv,
        budgetKey: string,
        label?: string | null,
      ) => Promise<{ serviceEntitlementToken: string; budgetKey: string }>
    }) => Promise<any>
    resolveBudgetAdminAccess: (options: {
      env: TEnv
      token: string
      getReusableServiceEntitlementTokenForBudget: (
        env: TEnv,
        budgetKey: string,
      ) => Promise<string | null>
      mintServiceEntitlementTokenForBudget: (
        env: TEnv,
        budgetKey: string,
        label?: string | null,
      ) => Promise<{ serviceEntitlementToken: string; budgetKey: string }>
    }) => Promise<any>
    getReusableServiceEntitlementTokenForBudget: (
      env: TEnv,
      budgetKey: string,
    ) => Promise<string | null>
    mintServiceEntitlementTokenForBudget: (
      env: TEnv,
      budgetKey: string,
      label?: string | null,
    ) => Promise<{ serviceEntitlementToken: string; budgetKey: string }>
  },
) {
  const {
    defaultBudgetKey,
    requireAdminSession,
    requireBudgetAccess,
    isKnownBudgetKey,
    isAuthDisabled,
    serviceEntitlementHeader,
    serviceEntitlementErrorResponse,
    verifyServiceEntitlementToken,
    hostAdminHeader,
    budgetAdminHeader,
    mintHostAdminSessionToken,
    mintBudgetAdminSessionToken,
    verifyBudgetAdminToken,
    getBudgetAdminTokenRegistry,
    resolveHostAdminAccess,
    resolveBudgetAdminAccess,
    getReusableServiceEntitlementTokenForBudget,
    mintServiceEntitlementTokenForBudget,
  } = deps

  app.get("/api/auth/verify", async (c) => {
    const verification = await verifyServiceEntitlementToken(c.env, serviceEntitlementHeader(c))
    if (!verification.ok) {
      return serviceEntitlementErrorResponse(
        c,
        verification.error,
        verification.code,
        verification.status,
      )
    }

    return c.json({
      ok: true,
      budgetId: verification.budgetId,
      budgetKey: verification.budgetKey,
      remainingBytes: verification.remainingBytes,
    })
  })

  app.post("/admin/auth/exchange", async (c) => {
    if (!isAuthDisabled(c.env)) {
      const bootstrapToken = c.req.header(hostAdminHeader)
      if (!bootstrapToken) {
        return serviceEntitlementErrorResponse(
          c,
          "Host admin bootstrap token required",
          "HOST_ADMIN_REQUIRED",
          401,
        )
      }

      if (bootstrapToken !== c.env.HOST_ADMIN_BOOTSTRAP_TOKEN) {
        return serviceEntitlementErrorResponse(
          c,
          "Invalid host admin token",
          "HOST_ADMIN_INVALID",
          403,
        )
      }
    }

    const hostAdminSessionToken = await mintHostAdminSessionToken(c.env.HOST_ADMIN_BOOTSTRAP_TOKEN)
    return c.json({ ok: true, hostAdminSessionToken })
  })

  app.get("/admin/auth/verify", async (c) => {
    const adminError = await requireAdminSession(c)
    if (adminError) return adminError
    return c.json({ ok: true })
  })

  app.get("/admin/auth/bootstrap", async (c) => {
    const adminError = await requireAdminSession(c)
    if (adminError) return adminError

    return c.json({
      hostAdminBootstrapToken: c.env.HOST_ADMIN_BOOTSTRAP_TOKEN,
    })
  })

  app.post("/budget-admin/auth/exchange", async (c) => {
    if (!isAuthDisabled(c.env)) {
      const budgetAdminToken = c.req.header(budgetAdminHeader)
      const verification = await verifyBudgetAdminToken(
        budgetAdminToken,
        c.env.HOST_ADMIN_BOOTSTRAP_TOKEN,
      )
      if (!verification.valid) {
        return serviceEntitlementErrorResponse(
          c,
          "Invalid budget admin token",
          budgetAdminToken ? "BUDGET_ADMIN_INVALID" : "BUDGET_ADMIN_REQUIRED",
          budgetAdminToken ? 403 : 401,
        )
      }

      if (c.env.HOST_ADMIN_DB) {
        if (!(await isKnownBudgetKey(c.env, verification.claims.budgetKey))) {
          return serviceEntitlementErrorResponse(c, "Budget not found", "BUDGET_NOT_FOUND", 404)
        }

        const currentToken = await getBudgetAdminTokenRegistry(c.env, verification.claims.budgetKey)
        if (!currentToken || currentToken.token !== budgetAdminToken?.trim()) {
          return serviceEntitlementErrorResponse(
            c,
            "Invalid budget admin token",
            "BUDGET_ADMIN_INVALID",
            403,
          )
        }
      }

      const budgetAdminSessionToken = await mintBudgetAdminSessionToken(
        c.env.HOST_ADMIN_BOOTSTRAP_TOKEN,
        verification.claims.budgetKey,
      )

      return c.json({
        ok: true,
        budgetKey: verification.claims.budgetKey,
        budgetAdminSessionToken,
      })
    }

    const budgetAdminSessionToken = await mintBudgetAdminSessionToken(
      c.env.HOST_ADMIN_BOOTSTRAP_TOKEN,
      defaultBudgetKey(c.env),
    )
    return c.json({ ok: true, budgetKey: defaultBudgetKey(c.env), budgetAdminSessionToken })
  })

  app.get("/budget-admin/auth/verify", async (c) => {
    const budgetKey = c.req.query("budgetKey")?.trim()
    if (!budgetKey) {
      return serviceEntitlementErrorResponse(c, "budgetKey required", "BAD_REQUEST", 400)
    }

    const access = await requireBudgetAccess(c, budgetKey)
    if (access instanceof Response) return access

    return c.json({ ok: true, budgetKey, access: access.kind })
  })

  app.post("/auth/resolve", async (c) => {
    let body: { token?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Invalid request body", code: "BAD_REQUEST" }, 400)
    }

    const token = body.token?.trim()
    if (!token) {
      return c.json({ error: "Token required", code: "BAD_REQUEST" }, 400)
    }

    const hostAdminAccess = await resolveHostAdminAccess({
      env: c.env,
      token,
      defaultBudgetKey: defaultBudgetKey(c.env),
      isAuthDisabled: isAuthDisabled(c.env),
      getReusableServiceEntitlementTokenForBudget,
      mintServiceEntitlementTokenForBudget,
    })
    if (hostAdminAccess) {
      return c.json(hostAdminAccess)
    }

    const budgetAdminAccess = await resolveBudgetAdminAccess({
      env: c.env,
      token,
      getReusableServiceEntitlementTokenForBudget,
      mintServiceEntitlementTokenForBudget,
    })
    if (budgetAdminAccess) {
      return c.json(budgetAdminAccess)
    }

    const entitlementVerification = await verifyServiceEntitlementToken(c.env, token)
    if (entitlementVerification.ok) {
      return c.json({
        ok: true,
        kind: "service-entitlement",
        entitlementState: "valid",
      })
    }

    if (entitlementVerification.status === 402) {
      return c.json({
        ok: true,
        kind: "service-entitlement",
        entitlementState: "exhausted",
        error: entitlementVerification.error,
      })
    }

    return c.json(
      {
        error: "Invalid token",
        code: "TOKEN_INVALID",
      },
      403,
    )
  })
}
