import type {
  WorkerAdminEnv,
  WorkerAppContext,
  WorkerBudgetAccessResult,
  WorkerBudgetSessionVerification,
  WorkerHostSessionVerification,
} from "./admin-route-types"

export function serviceEntitlementErrorResponse(
  c: WorkerAppContext<any>,
  error: string,
  code: string,
  status: 400 | 401 | 402 | 403 | 404 | 429 | 500 | 503,
) {
  return c.json({ error, code }, status)
}

export function badRequest(c: WorkerAppContext<any>, error: string, code = "BAD_REQUEST") {
  return c.json({ error, code }, 400)
}

export async function readJsonBody<T>(c: WorkerAppContext<any>): Promise<T | Response> {
  try {
    return (await c.req.json()) as T
  } catch {
    return badRequest(c, "Invalid request body")
  }
}

export function requiredTrimmedField(
  c: WorkerAppContext<any>,
  value: string | null | undefined,
  field: string,
): string | Response {
  const trimmed = value?.trim()
  return trimmed ? trimmed : badRequest(c, `${field} required`)
}

export function createAdminAccessHelpers<TEnv extends WorkerAdminEnv>(deps: {
  isAuthDisabled: (env: TEnv) => boolean
  defaultBudgetKey: (env: TEnv) => string
  getBudgetRegistry: (env: TEnv, budgetKey: string) => Promise<unknown>
  verifyHostAdminSessionToken: (
    token: string | null | undefined,
    secret: string,
  ) => Promise<WorkerHostSessionVerification>
  verifyBudgetAdminSessionToken: (
    token: string | null | undefined,
    secret: string,
  ) => Promise<WorkerBudgetSessionVerification>
  hostAdminSessionHeader: string
  budgetAdminSessionHeader: string
}) {
  const {
    isAuthDisabled,
    defaultBudgetKey,
    getBudgetRegistry,
    verifyHostAdminSessionToken,
    verifyBudgetAdminSessionToken,
    hostAdminSessionHeader,
    budgetAdminSessionHeader,
  } = deps

  async function isKnownBudgetKey(env: TEnv, budgetKey: string): Promise<boolean> {
    if (budgetKey === defaultBudgetKey(env)) return true
    return !!(await getBudgetRegistry(env, budgetKey))
  }

  async function requireAdminSession(c: WorkerAppContext<TEnv>): Promise<Response | null> {
    if (isAuthDisabled(c.env)) {
      return null
    }

    const token = c.req.header(hostAdminSessionHeader)
    const verification = await verifyHostAdminSessionToken(token, c.env.HOST_ADMIN_BOOTSTRAP_TOKEN)
    if (verification.valid) return null

    return serviceEntitlementErrorResponse(
      c,
      "Invalid host admin session",
      token ? "HOST_ADMIN_SESSION_INVALID" : "HOST_ADMIN_SESSION_REQUIRED",
      token ? 403 : 401,
    )
  }

  async function requireBudgetAccess(
    c: WorkerAppContext<TEnv>,
    budgetKey: string,
  ): Promise<WorkerBudgetAccessResult> {
    if (!(await isKnownBudgetKey(c.env, budgetKey))) {
      return serviceEntitlementErrorResponse(c, "Budget not found", "BUDGET_NOT_FOUND", 404)
    }

    if (isAuthDisabled(c.env)) {
      return { kind: "host-admin" }
    }

    const hostAdminToken = c.req.header(hostAdminSessionHeader)
    const hostVerification = await verifyHostAdminSessionToken(
      hostAdminToken,
      c.env.HOST_ADMIN_BOOTSTRAP_TOKEN,
    )
    if (hostVerification.valid) {
      return { kind: "host-admin" }
    }

    const budgetAdminToken = c.req.header(budgetAdminSessionHeader)
    const budgetVerification = await verifyBudgetAdminSessionToken(
      budgetAdminToken,
      c.env.HOST_ADMIN_BOOTSTRAP_TOKEN,
    )
    if (budgetVerification.valid && budgetVerification.claims?.budgetKey === budgetKey) {
      return { kind: "budget-admin" }
    }

    return serviceEntitlementErrorResponse(
      c,
      "Budget admin session required",
      budgetAdminToken || hostAdminToken
        ? "BUDGET_ADMIN_SESSION_INVALID"
        : "BUDGET_ADMIN_SESSION_REQUIRED",
      budgetAdminToken || hostAdminToken ? 403 : 401,
    )
  }

  return {
    isKnownBudgetKey,
    requireAdminSession,
    requireBudgetAccess,
  }
}
