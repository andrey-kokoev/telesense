import { getBudgetAdminTokenRegistry, getBudgetRegistry } from "./host-admin-registry"
import {
  mintBudgetAdminSessionToken,
  mintHostAdminSessionToken,
  verifyBudgetAdminToken,
} from "./host-admin-auth"

export type AuthResolveEnv = {
  HOST_ADMIN_BOOTSTRAP_TOKEN: string
  HOST_ADMIN_DB?: D1Database
}

export type AuthResolveResponse =
  | {
      ok: true
      kind: "host-admin"
      hostAdminSessionToken: string
      serviceEntitlementToken: string
      budgetKey: string
    }
  | {
      ok: true
      kind: "budget-admin"
      budgetKey: string
      budgetAdminSessionToken: string
      serviceEntitlementToken: string
    }
  | null

export async function resolveHostAdminAccess(options: {
  env: AuthResolveEnv
  token: string
  defaultBudgetKey: string
  isAuthDisabled: boolean
  getReusableServiceEntitlementTokenForBudget: (
    env: AuthResolveEnv,
    budgetKey: string,
  ) => Promise<string | null>
  mintServiceEntitlementTokenForBudget: (
    env: AuthResolveEnv,
    budgetKey: string,
    label?: string | null,
  ) => Promise<{ serviceEntitlementToken: string; budgetKey: string }>
}): Promise<AuthResolveResponse> {
  const {
    env,
    token,
    defaultBudgetKey,
    isAuthDisabled,
    getReusableServiceEntitlementTokenForBudget,
    mintServiceEntitlementTokenForBudget,
  } = options

  if (!isAuthDisabled && token !== env.HOST_ADMIN_BOOTSTRAP_TOKEN) {
    return null
  }

  const hostAdminSessionToken = await mintHostAdminSessionToken(env.HOST_ADMIN_BOOTSTRAP_TOKEN)
  const existingServiceEntitlementToken = await getReusableServiceEntitlementTokenForBudget(
    env,
    defaultBudgetKey,
  )
  const entitlement = existingServiceEntitlementToken
    ? { serviceEntitlementToken: existingServiceEntitlementToken, budgetKey: defaultBudgetKey }
    : await mintServiceEntitlementTokenForBudget(env, defaultBudgetKey, "Example token label")

  return {
    ok: true,
    kind: "host-admin",
    hostAdminSessionToken,
    serviceEntitlementToken: entitlement.serviceEntitlementToken,
    budgetKey: entitlement.budgetKey,
  }
}

export async function resolveBudgetAdminAccess(options: {
  env: AuthResolveEnv
  token: string
  getReusableServiceEntitlementTokenForBudget: (
    env: AuthResolveEnv,
    budgetKey: string,
  ) => Promise<string | null>
  mintServiceEntitlementTokenForBudget: (
    env: AuthResolveEnv,
    budgetKey: string,
    label?: string | null,
  ) => Promise<{ serviceEntitlementToken: string; budgetKey: string }>
}): Promise<AuthResolveResponse> {
  const {
    env,
    token,
    getReusableServiceEntitlementTokenForBudget,
    mintServiceEntitlementTokenForBudget,
  } = options

  const budgetAdminVerification = await verifyBudgetAdminToken(
    token,
    env.HOST_ADMIN_BOOTSTRAP_TOKEN,
  )
  if (!budgetAdminVerification.valid) {
    return null
  }

  const budgetKey = budgetAdminVerification.claims.budgetKey
  if (env.HOST_ADMIN_DB) {
    if (!(await getBudgetRegistry(env, budgetKey))) {
      return null
    }

    const currentToken = await getBudgetAdminTokenRegistry(env, budgetKey)
    if (currentToken?.token !== token) {
      return null
    }
  }

  const existingServiceEntitlementToken = await getReusableServiceEntitlementTokenForBudget(
    env,
    budgetKey,
  )
  const entitlement = existingServiceEntitlementToken
    ? { serviceEntitlementToken: existingServiceEntitlementToken, budgetKey }
    : await mintServiceEntitlementTokenForBudget(env, budgetKey, "budget-admin")
  const budgetAdminSessionToken = await mintBudgetAdminSessionToken(
    env.HOST_ADMIN_BOOTSTRAP_TOKEN,
    budgetKey,
  )

  return {
    ok: true,
    kind: "budget-admin",
    budgetKey,
    budgetAdminSessionToken,
    serviceEntitlementToken: entitlement.serviceEntitlementToken,
  }
}
