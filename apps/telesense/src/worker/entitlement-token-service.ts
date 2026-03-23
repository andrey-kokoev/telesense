import {
  getEntitlementTokenRegistry,
  listEntitlementTokensByBudgetKey,
  upsertEntitlementTokenRegistry,
} from "./host-admin-registry"
import { mintToken, parseToken } from "./tokens"

type EntitlementTokenServiceEnv = {
  HOST_ADMIN_DB?: D1Database
}

type BudgetStub = DurableObjectStub

export function buildTokenPreview(token: string): string {
  if (token.length <= 18) return token
  return `${token.slice(0, 8)}…${token.slice(-8)}`
}

export async function mintTrackedServiceEntitlementTokenForBudget(options: {
  env: EntitlementTokenServiceEnv
  budgetKey: string
  budget: BudgetStub
  label?: string | null
}) {
  const { env, budgetKey, budget, label = null } = options

  const secretRes = await budget.fetch(new Request("http://do.internal/?action=getCurrentSecret"))
  if (!secretRes.ok) {
    const rotateRes = await budget.fetch(
      new Request("http://do.internal/?action=rotateSecret", { method: "POST" }),
    )
    if (!rotateRes.ok) {
      throw new Error("Failed to initialize budget secret")
    }
  }

  const currentSecretRes = await budget.fetch(
    new Request("http://do.internal/?action=getCurrentSecret"),
  )
  if (!currentSecretRes.ok) {
    throw new Error("Failed to get budget secret")
  }

  const { version, secret } = (await currentSecretRes.json()) as { version: number; secret: string }
  const budgetRes = await budget.fetch(new Request("http://do.internal/?action=getBudget"))
  if (!budgetRes.ok) {
    throw new Error("Failed to get budget data")
  }

  const budgetData = (await budgetRes.json()) as {
    budgetId: string
    remainingBytes: number
    enabled?: boolean
  }

  const serviceEntitlementToken = await mintToken(budgetData.budgetId, version, secret)
  const tokenClaims = parseToken(serviceEntitlementToken)?.claims
  if (!tokenClaims) {
    throw new Error("Failed to mint service entitlement token")
  }

  await upsertEntitlementTokenRegistry(env, {
    tokenId: tokenClaims.tokenId,
    budgetKey,
    budgetId: budgetData.budgetId,
    secretVersion: version,
    tokenValue: serviceEntitlementToken,
    tokenPreview: buildTokenPreview(serviceEntitlementToken),
    label,
  })

  return {
    serviceEntitlementToken,
    tokenId: tokenClaims.tokenId,
    budgetKey,
    budgetId: budgetData.budgetId,
    secretVersion: version,
    remainingBytes: budgetData.remainingBytes,
  }
}

export async function getReusableServiceEntitlementTokenForBudget(
  env: EntitlementTokenServiceEnv,
  budgetKey: string,
): Promise<string | null> {
  if (!env.HOST_ADMIN_DB) return null

  const tokens = await listEntitlementTokensByBudgetKey(env, budgetKey)
  for (const token of tokens) {
    if (!token.active) continue
    const record = await getEntitlementTokenRegistry(env, token.tokenId)
    if (record?.tokenValue) {
      return record.tokenValue
    }
  }

  return null
}
