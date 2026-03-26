// Cloudflare Realtime Worker — Durable Objects for cross-device coordination
//
// VERIFIED ENDPOINTS:
// - POST /v1/apps/{appId}/sessions/new → { sessionId }
// - POST /v1/apps/{appId}/sessions/{sessionId}/tracks/new (push) → { sessionDescription, tracks }
// - POST /v1/apps/{appId}/sessions/{sessionId}/tracks/new (pull) → { sessionDescription, tracks }
// - PUT /v1/apps/{appId}/sessions/{sessionId}/renegotiate → {}
//
// Current local contract:
// - room/session APIs are exposed under /api/rooms/:roomId/*
// - participant identity is deterministic per room/browser instance
// - participant continuity is proven with a room-scoped participantSecret
// - Cloudflare session ids remain transport-only and are coordinated through CallRoom

import { Context, Hono } from "hono"
import { logger } from "hono/logger"
import { CallRoom } from "./call-room"
import {
  BUDGET_ADMIN_HEADER,
  BUDGET_ADMIN_SESSION_HEADER,
  DEFAULT_MONTHLY_ALLOWANCE_RESET_BYTES,
  GLOBAL_ENTITLEMENT_BUDGET_NAME,
  GLOBAL_MONTHLY_ALLOWANCE_NAME,
  HOST_ADMIN_HEADER,
  HOST_ADMIN_SESSION_HEADER,
  SERVICE_ENTITLEMENT_HEADER,
} from "./entitlement-constants"
import { EntitlementBudget } from "./entitlement-budget"
import {
  mintBudgetAdminSessionToken,
  mintBudgetAdminToken,
  mintHostAdminSessionToken,
  verifyBudgetAdminSessionToken,
  verifyBudgetAdminToken,
  verifyHostAdminSessionToken,
} from "./host-admin-auth"
import {
  findBudgetKeyByBudgetId,
  getBudgetRegistry,
  getBudgetAdminTokenRegistry,
  getEntitlementTokenRegistry,
  listBudgetRegistry,
  listEntitlementTokensByBudgetKey,
  listMonthlyAllowanceRegistry,
  deleteEntitlementTokenRegistry,
  deleteEntitlementTokensByBudgetKey,
  deleteBudgetAdminTokenRegistry,
  deleteBudgetRegistry,
  deleteMonthlyAllowanceRegistryByBudgetKey,
  updateEntitlementTokenActive,
  updateEntitlementTokenLabel,
  updateBudgetRegistryLabel,
  updateBudgetMeterAtTokenLevel,
  upsertBudgetAdminTokenRegistry,
  upsertBudgetRegistry,
  upsertEntitlementTokenRegistry,
  upsertMonthlyAllowanceRegistry,
} from "./host-admin-registry"
import { MonthlyAllowance } from "./monthly-allowance"
import { TokenUsageLedger } from "./token-usage-ledger"
import { mintToken, parseToken, verifyTokenWithSecret } from "./tokens"
import {
  buildTokenPreview,
  getReusableServiceEntitlementTokenForBudget,
  mintTrackedServiceEntitlementTokenForBudget,
} from "./entitlement-token-service"
import {
  resolveBudgetAdminAccess,
  resolveHostAdminAccess,
  type AuthResolveEnv,
} from "./auth-resolve"
import {
  badRequest,
  createAdminAccessHelpers,
  readJsonBody,
  requiredTrimmedField,
  serviceEntitlementErrorResponse,
} from "./admin-access"
import { registerAdminBudgetTokenRoutes } from "./admin-budget-token-routes"
import { registerAdminAuthRoutes } from "./admin-auth-routes"
import { registerAdminMonthlyAllowanceRoutes } from "./admin-monthly-allowance-routes"

type Env = {
  REALTIME_APP_ID: string
  CF_CALLS_SECRET: string
  SERVICE_ENTITLEMENT_TOKEN: string
  HOST_ADMIN_BOOTSTRAP_TOKEN: string
  SERVICE_ENTITLEMENT_ALLOWANCE_BYTES: string
  GLOBAL_ENTITLEMENT_BUDGET_ID?: string
  GLOBAL_MONTHLY_ALLOWANCE_ID?: string
  DO_NOT_ENFORCE_SERVICE_ENTITLEMENT?: string // Dev-only: set 'true' to disable auth
  DEBUG?: string
  HOST_ADMIN_DB?: D1Database
  ASSETS?: Fetcher // Workers Sites static assets
  CALL_ROOMS: DurableObjectNamespace
  ENTITLEMENT_BUDGETS: DurableObjectNamespace
  MONTHLY_ALLOWANCES: DurableObjectNamespace
  TOKEN_USAGE_LEDGERS: DurableObjectNamespace
}

// VERIFIED: rtc.live.cloudflare.com/v1 (not realtime.cloudflare.com/client/v4)
const REALTIME_API = "https://rtc.live.cloudflare.com/v1/apps"

// Helper to get CallRoom DO instance
function getCallRoom(env: Env, roomId: string): DurableObjectStub {
  const id = env.CALL_ROOMS.idFromName(roomId)
  return env.CALL_ROOMS.get(id)
}

// Helper to get EntitlementBudget DO instance (shared global budget)
function getEntitlementBudget(env: Env): DurableObjectStub {
  const id = env.ENTITLEMENT_BUDGETS.idFromName(
    env.GLOBAL_ENTITLEMENT_BUDGET_ID || GLOBAL_ENTITLEMENT_BUDGET_NAME,
  )
  return env.ENTITLEMENT_BUDGETS.get(id)
}

function getEntitlementBudgetByKey(env: Env, budgetKey: string): DurableObjectStub {
  const id = env.ENTITLEMENT_BUDGETS.idFromName(budgetKey)
  return env.ENTITLEMENT_BUDGETS.get(id)
}

function getTokenUsageLedger(env: Env, tokenId: string): DurableObjectStub {
  const id = env.TOKEN_USAGE_LEDGERS.idFromName(tokenId)
  return env.TOKEN_USAGE_LEDGERS.get(id)
}

function getMonthlyAllowance(env: Env): DurableObjectStub {
  const id = env.MONTHLY_ALLOWANCES.idFromName(
    env.GLOBAL_MONTHLY_ALLOWANCE_ID || GLOBAL_MONTHLY_ALLOWANCE_NAME,
  )
  return env.MONTHLY_ALLOWANCES.get(id)
}

function getMonthlyAllowanceById(env: Env, allowanceId: string): DurableObjectStub {
  const id = env.MONTHLY_ALLOWANCES.idFromName(allowanceId)
  return env.MONTHLY_ALLOWANCES.get(id)
}

function defaultBudgetKey(env: Env): string {
  return env.GLOBAL_ENTITLEMENT_BUDGET_ID || GLOBAL_ENTITLEMENT_BUDGET_NAME
}

function defaultMonthlyAllowanceId(env: Env): string {
  return env.GLOBAL_MONTHLY_ALLOWANCE_ID || GLOBAL_MONTHLY_ALLOWANCE_NAME
}

async function ensureMonthlyAllowanceForBudget(
  env: Env,
  budgetKey: string,
  allowanceId = budgetKey === defaultBudgetKey(env)
    ? defaultMonthlyAllowanceId(env)
    : `${budgetKey}-monthly`,
) {
  const monthlyAllowance = getMonthlyAllowanceById(env, allowanceId)
  const statusRes = await monthlyAllowance.fetch(
    new Request("http://do.internal/?action=getStatus"),
  )
  if (!statusRes.ok) {
    throw new Error("Failed to get monthly allowance")
  }

  const status = (await statusRes.json()) as {
    budgetKey: string
    active: boolean
    cronExpr: string
    resetAmountBytes: number
    nextResetAt: number | null
    lastResetAt: number | null
    lifecycle: "inactive" | "scheduled" | "due"
  }

  const needsConfiguration =
    status.budgetKey !== budgetKey ||
    (!status.active && status.resetAmountBytes === 0 && !status.lastResetAt)

  const effective = needsConfiguration
    ? await (async () => {
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
          throw new Error(errorText || "Failed to configure monthly allowance")
        }
        return (await configureRes.json()) as typeof status
      })()
    : status

  await upsertMonthlyAllowanceRegistry(env, {
    allowanceId,
    budgetKey: effective.budgetKey,
    active: effective.active,
    cronExpr: effective.cronExpr,
  })

  await materializeBudgetSnapshotIfNeeded(
    env,
    effective.budgetKey,
    effective.resetAmountBytes,
    effective.active,
  )

  return {
    allowanceId,
    ...effective,
  }
}

type MonthlyAllowanceStatus = {
  budgetKey: string
  active: boolean
  cronExpr: string
  resetAmountBytes: number
  nextResetAt: number | null
  lastResetAt: number | null
  lifecycle: "inactive" | "scheduled" | "due"
}

async function getMonthlyAllowanceStatusById(
  env: Env,
  allowanceId: string,
): Promise<MonthlyAllowanceStatus> {
  const monthlyAllowance = getMonthlyAllowanceById(env, allowanceId)
  const statusRes = await monthlyAllowance.fetch(
    new Request("http://do.internal/?action=getStatus"),
  )
  if (!statusRes.ok) {
    throw new Error(await statusRes.text())
  }
  return (await statusRes.json()) as MonthlyAllowanceStatus
}

async function configureMonthlyAllowanceById(
  env: Env,
  allowanceId: string,
  config: {
    budgetKey: string
    resetAmountBytes: number
    cronExpr: string
    active: boolean
  },
) {
  const monthlyAllowance = getMonthlyAllowanceById(env, allowanceId)
  const configureRes = await monthlyAllowance.fetch(
    new Request("http://do.internal/?action=configure", {
      method: "POST",
      body: JSON.stringify(config),
    }),
  )
  if (!configureRes.ok) {
    throw new Error(await configureRes.text())
  }
  return (await configureRes.json()) as MonthlyAllowanceStatus
}

// Type definitions
interface CreateSessionResponse {
  sessionId: string
  cloudflareSessionId: string
  participantId: string
  participantSecret: string
}

interface CreateSessionRequest {
  browserInstanceId: string
  participantSecret?: string
  confirmTakeover?: boolean
}

async function deriveParticipantId(roomId: string, browserInstanceId: string): Promise<string> {
  const data = new TextEncoder().encode(`${roomId}:${browserInstanceId}`)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

interface PublishOfferRequest {
  sessionId: string
  sdpOffer: string
  tracks: Array<{ mid: string; trackName: string }>
}

interface PublishOfferResponse {
  sessionDescription: {
    type: "answer"
    sdp: string
  }
  tracks: Array<{ mid: string; trackName: string }>
}

interface SubscribeOfferRequest {
  sessionId: string
  remoteTracks: Array<{
    trackName: string
    sessionId: string
  }>
}

interface SubscribeOfferResponse {
  sessionDescription: {
    type: "offer"
    sdp: string
  }
  tracks: Array<{
    sessionId: string
    trackName: string
    mid: string
  }>
  requiresImmediateRenegotiation: boolean
}

interface CompleteSubscribeRequest {
  sessionId: string
  sdpAnswer: string
}

interface DiscoverRemoteTracksResponse {
  tracks: Array<{
    trackName: string
    sessionId: string
    mid: string
  }>
  remoteParticipantCount: number
  remoteParticipants: Array<{
    sessionId: string
    audioEnabled: boolean
    videoEnabled: boolean
  }>
}

interface LeaveRequest {
  sessionId: string
}

interface HeartbeatRequest {
  sessionId: string
}

interface MediaStateRequest {
  sessionId: string
  audioEnabled?: boolean
  videoEnabled?: boolean
}

interface TerminateRoomResponse {
  ok: true
}

// Normalize roomId to uppercase for case-insensitive matching
function normalizeRoomId(roomId: string): string {
  return roomId.toUpperCase()
}

interface HealthResponse {
  status: "healthy"
  version: string
  callsActive: number
  sessionsActive: number
}

interface ErrorResponse {
  error: string
  code?: string
  details?: unknown
}

interface OkResponse {
  ok: true
}

type ServiceEntitlementVerificationResult =
  | {
      ok: true
      budgetId: string
      budgetKey: string
      remainingBytes: number
      tokenId: string
      meterAtTokenLevel: boolean
    }
  | {
      ok: false
      status: 401 | 402 | 403 | 503
      error: string
      code: string
    }

type AppContext = Context<{ Bindings: Env }>
const ROOM_STATUS_BATCH_LIMIT = 100

function isAuthDisabled(env: Env): boolean {
  return env.DO_NOT_ENFORCE_SERVICE_ENTITLEMENT === "true"
}

function serviceEntitlementHeader(c: AppContext): string | undefined {
  return c.req.header(SERVICE_ENTITLEMENT_HEADER)
}

const { isKnownBudgetKey, requireAdminSession, requireBudgetAccess } = createAdminAccessHelpers({
  isAuthDisabled,
  defaultBudgetKey,
  getBudgetRegistry,
  verifyHostAdminSessionToken,
  verifyBudgetAdminSessionToken,
  hostAdminSessionHeader: HOST_ADMIN_SESSION_HEADER,
  budgetAdminSessionHeader: BUDGET_ADMIN_SESSION_HEADER,
})

async function getOrCreateBudgetAdminToken(env: Env, budgetKey: string): Promise<string> {
  const existing = await getBudgetAdminTokenRegistry(env, budgetKey)
  if (existing?.token) {
    return existing.token
  }

  const token = await mintBudgetAdminToken(env.HOST_ADMIN_BOOTSTRAP_TOKEN, budgetKey)
  await upsertBudgetAdminTokenRegistry(env, { budgetKey, token })
  return token
}

async function mintServiceEntitlementTokenForBudget(
  env: Env,
  budgetKey: string,
  label: string | null = null,
) {
  return mintTrackedServiceEntitlementTokenForBudget({
    env,
    budgetKey,
    budget: getEntitlementBudgetByKey(env, budgetKey),
    label,
  })
}

async function verifyServiceEntitlementToken(
  env: Env,
  providedToken: string | null | undefined,
): Promise<ServiceEntitlementVerificationResult> {
  if (isAuthDisabled(env)) {
    const budget = getEntitlementBudget(env)
    const budgetRes = await budget.fetch(new Request("http://do.internal/?action=getBudget"))
    if (!budgetRes.ok) {
      return {
        ok: false,
        status: 503,
        error: "Service entitlement not available",
        code: "SERVICE_ENTITLEMENT_UNAVAILABLE",
      }
    }
    const budgetData = (await budgetRes.json()) as { budgetId: string; remainingBytes: number }
    return {
      ok: true,
      budgetId: budgetData.budgetId,
      budgetKey: defaultBudgetKey(env),
      remainingBytes: budgetData.remainingBytes,
      tokenId: "",
      meterAtTokenLevel: false,
    }
  }

  const token = providedToken?.trim()
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Service entitlement required",
      code: "SERVICE_ENTITLEMENT_REQUIRED",
    }
  }

  const parsed = parseToken(token)
  if (!parsed) {
    return {
      ok: false,
      status: 403,
      error: "Invalid service entitlement token",
      code: "SERVICE_ENTITLEMENT_INVALID",
    }
  }

  let budgetKey = await findBudgetKeyByBudgetId(env, parsed.budgetId)

  if (!budgetKey) {
    const fallbackBudget = getEntitlementBudget(env)
    const fallbackRes = await fallbackBudget.fetch(
      new Request("http://do.internal/?action=getBudget"),
    )
    if (fallbackRes.ok) {
      const fallbackData = (await fallbackRes.json()) as { budgetId: string }
      if (fallbackData.budgetId === parsed.budgetId) {
        budgetKey = defaultBudgetKey(env)
      }
    }
  }

  if (!budgetKey) {
    return {
      ok: false,
      status: 403,
      error: "Invalid service entitlement token",
      code: "SERVICE_ENTITLEMENT_INVALID",
    }
  }

  const budget = getEntitlementBudgetByKey(env, budgetKey)
  const secretRes = await budget.fetch(
    new Request(`http://do.internal/?action=getSecretByVersion&version=${parsed.secretVersion}`),
  )
  if (!secretRes.ok) {
    return {
      ok: false,
      status: 403,
      error: "Invalid service entitlement token",
      code: "SERVICE_ENTITLEMENT_INVALID",
    }
  }

  const { secret } = (await secretRes.json()) as { secret: string }
  const verification = await verifyTokenWithSecret(token, secret)

  if (!verification.valid || verification.budgetId !== parsed.budgetId) {
    return {
      ok: false,
      status: 403,
      error: "Invalid service entitlement token",
      code: "SERVICE_ENTITLEMENT_INVALID",
    }
  }

  let meterAtTokenLevel = false
  if (env.HOST_ADMIN_DB) {
    const [tokenRecord, budgetRegistry] = await Promise.all([
      getEntitlementTokenRegistry(env, verification.claims.tokenId),
      getBudgetRegistry(env, budgetKey),
    ])
    if (
      !tokenRecord ||
      !tokenRecord.active ||
      tokenRecord.budgetId !== parsed.budgetId ||
      tokenRecord.budgetKey !== budgetKey ||
      tokenRecord.secretVersion !== parsed.secretVersion
    ) {
      return {
        ok: false,
        status: 403,
        error: "Invalid service entitlement token",
        code: "SERVICE_ENTITLEMENT_INVALID",
      }
    }
    meterAtTokenLevel = budgetRegistry?.meterAtTokenLevel ?? false
  }

  const budgetRes = await budget.fetch(new Request("http://do.internal/?action=getBudget"))
  if (!budgetRes.ok) {
    return {
      ok: false,
      status: 503,
      error: "Service entitlement not available",
      code: "SERVICE_ENTITLEMENT_UNAVAILABLE",
    }
  }
  const budgetData = (await budgetRes.json()) as {
    budgetId: string
    remainingBytes: number
    enabled?: boolean
  }

  if (budgetData.enabled === false) {
    return {
      ok: false,
      status: 403,
      error: "Service entitlement budget disabled",
      code: "SERVICE_ENTITLEMENT_DISABLED",
    }
  }

  if (budgetData.budgetId !== parsed.budgetId) {
    return {
      ok: false,
      status: 403,
      error: "Invalid service entitlement token",
      code: "SERVICE_ENTITLEMENT_INVALID",
    }
  }

  if (budgetData.remainingBytes <= 0) {
    return {
      ok: false,
      status: 402,
      error: "Service entitlement budget exhausted",
      code: "SERVICE_ENTITLEMENT_EXHAUSTED",
    }
  }

  return {
    ok: true,
    budgetId: budgetData.budgetId,
    budgetKey,
    remainingBytes: budgetData.remainingBytes,
    tokenId: verification.claims.tokenId,
    meterAtTokenLevel,
  }
}

// Helper functions
function isDebugEnabled(env: Env): boolean {
  return env.DEBUG === "true" || env.DEBUG === "1"
}

function apiHeaders(env: Env) {
  return {
    Authorization: `Bearer ${env.CF_CALLS_SECRET}`,
    "Content-Type": "application/json",
  }
}

async function getRoomStatus(
  env: Env,
  roomId: string,
): Promise<{
  exists: boolean
  sessionCount: number
}> {
  const callRoom = getCallRoom(env, roomId)
  const roomExistsRes = await callRoom.fetch(new Request("http://do.internal/?action=roomExists"))
  const roomExistsData = (await roomExistsRes.json()) as {
    roomCreated?: boolean
    sessionCount?: number
  }

  return {
    exists: !!roomExistsData.roomCreated,
    sessionCount: roomExistsData.sessionCount ?? 0,
  }
}

type BudgetInspection = {
  budgetKey: string
  budgetId: string
  enabled: boolean
  allowance: {
    remainingBytes: number
    consumedBytes: number
  }
  secret: {
    currentVersion: number
    versionHistory: Array<{
      version: number
      createdAt: number
      retiredAt?: number
      hasSecretMaterial: boolean
    }>
  }
  grace: {
    lifecycle: "uninitialized" | "active" | "in_grace" | "exhausted"
    graceEndsAt: number | null
  }
  initialized: boolean
}

async function inspectBudget(env: Env, budgetKey: string): Promise<BudgetInspection> {
  const budget = getEntitlementBudgetByKey(env, budgetKey)
  const budgetRes = await budget.fetch(new Request("http://do.internal/?action=getBudget"))
  if (!budgetRes.ok) {
    throw new Error("Failed to get budget data")
  }

  const data = (await budgetRes.json()) as {
    budgetId: string
    enabled?: boolean
    initialized?: boolean
    remainingBytes: number
    consumedBytes: number
    currentSecretVersion: number
    secretVersions: Array<{
      version: number
      createdAt: number
      retiredAt?: number
      hasSecret: boolean
    }>
    graceEndsAt: number | null
    lifecycle: "uninitialized" | "active" | "in_grace" | "exhausted"
  }

  return {
    budgetKey,
    budgetId: data.budgetId,
    enabled: data.enabled !== false,
    allowance: {
      remainingBytes: data.remainingBytes,
      consumedBytes: data.consumedBytes,
    },
    initialized: data.initialized !== false,
    secret: {
      currentVersion: data.currentSecretVersion,
      versionHistory: data.secretVersions.map((sv) => ({
        version: sv.version,
        createdAt: sv.createdAt,
        retiredAt: sv.retiredAt,
        hasSecretMaterial: sv.hasSecret,
      })),
    },
    grace: {
      lifecycle: data.lifecycle,
      graceEndsAt: data.graceEndsAt,
    },
  }
}

async function materializeBudgetSnapshotIfNeeded(
  env: Env,
  budgetKey: string,
  resetAmountBytes: number,
  active: boolean,
) {
  if (!active || resetAmountBytes <= 0) return

  const currentBudget = await inspectBudget(env, budgetKey)
  if (currentBudget.initialized) return

  const budget = getEntitlementBudgetByKey(env, budgetKey)
  const resetRes = await budget.fetch(
    new Request("http://do.internal/?action=setSnapshot", {
      method: "POST",
      body: JSON.stringify({ remainingBytes: resetAmountBytes, consumedBytes: 0 }),
    }),
  )
  if (!resetRes.ok) {
    throw new Error("Failed to initialize budget snapshot")
  }
}

async function getKnownBudgets(env: Env) {
  const records = await listBudgetRegistry(env)
  if (records.length > 0) {
    const seededDefaultBudgetKey = defaultBudgetKey(env)
    return records.map((record) => ({
      ...record,
      isDefault: record.budgetKey === seededDefaultBudgetKey,
    }))
  }

  const budget = await inspectBudget(env, defaultBudgetKey(env))
  await upsertBudgetRegistry(env, {
    budgetKey: budget.budgetKey,
    budgetId: budget.budgetId,
    label: "Default budget",
  })
  return [
    {
      budgetKey: budget.budgetKey,
      budgetId: budget.budgetId,
      isDefault: true,
      label: "Default budget",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]
}

async function getKnownMonthlyAllowances(env: Env) {
  const records = await listMonthlyAllowanceRegistry(env)
  if (records.length > 0) return records

  const allowance = getMonthlyAllowance(env)
  const statusRes = await allowance.fetch(new Request("http://do.internal/?action=getStatus"))
  if (!statusRes.ok) return []
  let status = (await statusRes.json()) as {
    budgetKey: string
    active: boolean
    cronExpr: string
    resetAmountBytes?: number
    nextResetAt?: number | null
    lastResetAt?: number | null
    lifecycle?: "inactive" | "scheduled" | "due"
  }

  if (!status.budgetKey) {
    const seededBudgetKey = defaultBudgetKey(env)
    const configureRes = await allowance.fetch(
      new Request("http://do.internal/?action=configure", {
        method: "POST",
        body: JSON.stringify({
          budgetKey: seededBudgetKey,
          resetAmountBytes:
            status.resetAmountBytes && status.resetAmountBytes > 0
              ? status.resetAmountBytes
              : DEFAULT_MONTHLY_ALLOWANCE_RESET_BYTES,
          cronExpr: status.cronExpr || "0 0 1 * *",
          active: true,
        }),
      }),
    )
    if (configureRes.ok) {
      status = (await configureRes.json()) as typeof status
    } else {
      status.budgetKey = seededBudgetKey
    }
  }

  const allowanceId = defaultMonthlyAllowanceId(env)
  await upsertMonthlyAllowanceRegistry(env, {
    allowanceId,
    budgetKey: status.budgetKey,
    active: status.active,
    cronExpr: status.cronExpr,
  })

  return [
    {
      allowanceId,
      budgetKey: status.budgetKey,
      active: status.active,
      cronExpr: status.cronExpr,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]
}

async function ensureHostAdminRegistrySeeded(env: Env) {
  if (!env.HOST_ADMIN_DB) return

  await getKnownBudgets(env)
  await getKnownMonthlyAllowances(env)
}

async function parseCloudflareResponse(
  res: Response,
  routeName: string,
  debug: boolean,
): Promise<{ data: unknown; text: string }> {
  const text = await res.text()

  if (!res.ok) {
    const errorInfo: Record<string, unknown> = {
      status: res.status,
      statusText: res.statusText,
    }
    if (debug) {
      errorInfo.bodyPreview = text.slice(0, 500)
      errorInfo.bodyLength = text.length
    }
    console.error(`[${routeName}] Upstream Cloudflare failure:`, errorInfo)
    throw new Error(`Upstream failure: ${res.status} ${res.statusText}`)
  }

  try {
    const data = JSON.parse(text)
    if (debug) {
      console.log(`[${routeName}] Response:`, JSON.stringify(data, null, 2).slice(0, 1000))
    }
    return { data, text }
  } catch (e) {
    console.error(`[${routeName}] Failed to parse upstream JSON:`, {
      preview: text.slice(0, 200),
      parseError: (e as Error).message,
    })
    throw new Error("Invalid JSON from upstream")
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing or empty required field: ${field}`)
  }
  return value
}

function requireNonEmptyArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Missing or empty required array: ${field}`)
  }
  return value as T[]
}

async function handleGetRoomStatus(c: AppContext) {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId") || "")

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json(
      {
        error: (e as Error).message,
        code: "BAD_REQUEST",
      } as ErrorResponse,
      400,
    )
  }

  const roomStatus = await getRoomStatus(env, roomId)

  return c.json({
    exists: roomStatus.exists,
    sessionCount: roomStatus.sessionCount,
  })
}

async function handleBatchRoomStatus(c: AppContext) {
  let body: { roomIds?: string[] }
  try {
    body = await c.req.json()
  } catch {
    return c.json(
      {
        error: "Invalid request body",
        code: "BAD_REQUEST",
      } as ErrorResponse,
      400,
    )
  }

  const roomIds = Array.isArray(body.roomIds)
    ? body.roomIds
        .map((roomId) => normalizeRoomId(roomId))
        .filter(Boolean)
        .slice(0, ROOM_STATUS_BATCH_LIMIT)
    : []

  if (roomIds.length === 0) {
    return c.json(
      {
        error: "roomIds is required",
        code: "BAD_REQUEST",
      } as ErrorResponse,
      400,
    )
  }

  const ip = c.req.header("CF-Connecting-IP") || "unknown"
  const rateLimit = checkStatusRateLimit(ip, roomIds.length)

  c.header("X-RateLimit-Limit", String(STATUS_RATE_LIMIT_MAX))
  c.header("X-RateLimit-Remaining", String(rateLimit.remaining))

  if (!rateLimit.allowed) {
    return c.json(
      {
        error: "Rate limit exceeded",
        code: "RATE_LIMITED",
        message: "Too many room status checks. Please wait before retrying.",
      },
      429,
    )
  }

  const rooms: Record<string, { exists: boolean }> = {}
  for (const roomId of roomIds) {
    const roomStatus = await getRoomStatus(c.env, roomId)
    rooms[roomId] = { exists: roomStatus.exists }
  }

  return c.json({ rooms })
}

async function handleCreateSession(c: AppContext) {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId") || "")
  const debug = isDebugEnabled(env)

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json(
      {
        error: (e as Error).message,
        code: "BAD_REQUEST",
      } as ErrorResponse,
      400,
    )
  }

  if (debug) {
    console.log(`[sessions/new] Creating session for room: ${roomId}`)
  }

  let body: CreateSessionRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.browserInstanceId, "browserInstanceId")
  } catch (e) {
    return c.json(
      {
        error: (e as Error).message,
        code: "BAD_REQUEST",
      } as ErrorResponse,
      400,
    )
  }

  const roomStatus = await getRoomStatus(env, roomId)
  const callRoom = getCallRoom(env, roomId)

  // Extract and verify service entitlement token
  const token = serviceEntitlementHeader(c)
  let tokenBudgetId: string | null = null
  let tokenBudgetKey: string | null = null

  if (!roomStatus.exists) {
    // Room doesn't exist - require valid token and check budget
    const verification = await verifyServiceEntitlementToken(env, token)
    if (!verification.ok) {
      return c.json(
        {
          error: verification.error,
          code: verification.code,
        } as ErrorResponse,
        verification.status,
      )
    }

    tokenBudgetId = verification.budgetId
    tokenBudgetKey = verification.budgetKey

    // Bind room to budget on activation
    await callRoom.fetch(
      new Request("http://do.internal/?action=setBudgetId", {
        method: "POST",
        body: JSON.stringify({
          budgetId: tokenBudgetId,
          budgetKey: tokenBudgetKey,
          roomId,
          tokenId: verification.tokenId || null,
          meterAtTokenLevel: verification.meterAtTokenLevel,
        }),
      }),
    )
  } else {
    // Room exists - check if already bound to a budget
    const budgetIdRes = await callRoom.fetch(new Request("http://do.internal/?action=getBudgetId"))
    if (budgetIdRes.ok) {
      const { budgetId, budgetKey } = (await budgetIdRes.json()) as {
        budgetId: string
        budgetKey?: string
      }
      if (budgetId) {
        // Room is already affiliated - ignore token for budget routing
        tokenBudgetId = budgetId
        tokenBudgetKey = budgetKey ?? null
      }
    }
  }

  const authorizeParticipantRes = await callRoom.fetch(
    new Request("http://do.internal/?action=authorizeParticipant", {
      method: "POST",
      body: JSON.stringify({
        participantId: await deriveParticipantId(roomId, body.browserInstanceId),
        participantSecret: body.participantSecret,
        confirmTakeover: body.confirmTakeover,
      }),
    }),
  )

  if (!authorizeParticipantRes.ok) {
    if (authorizeParticipantRes.status === 409) {
      return c.json(
        {
          error: "Participant takeover confirmation required",
          code: "PARTICIPANT_TAKEOVER_REQUIRED",
        } as ErrorResponse,
        409,
      )
    }
    if (authorizeParticipantRes.status === 403) {
      return c.json(
        {
          error: "Participant authentication failed",
          code: "PARTICIPANT_AUTH_FAILED",
        } as ErrorResponse,
        403,
      )
    }
    return c.json(
      { error: "Failed to authorize participant", code: "INTERNAL_ERROR" } as ErrorResponse,
      500,
    )
  }

  const authorizedParticipant = (await authorizeParticipantRes.json()) as {
    participantId: string
    participantSecret: string
  }

  const res = await fetch(`${REALTIME_API}/${env.REALTIME_APP_ID}/sessions/new`, {
    method: "POST",
    headers: apiHeaders(env),
  })

  let cfResponse: { sessionId?: string }
  try {
    const { data } = await parseCloudflareResponse(res, "sessions/new", debug)
    cfResponse = data as { sessionId?: string }
  } catch (e) {
    return c.json(
      {
        error: (e as Error).message,
        code: "UPSTREAM_ERROR",
      } as ErrorResponse,
      502,
    )
  }

  const cfSessionId = cfResponse?.sessionId
  if (!cfSessionId || typeof cfSessionId !== "string") {
    return c.json(
      {
        error: "Unexpected Realtime response shape: missing sessionId",
        code: "INVALID_RESPONSE",
      } as ErrorResponse,
      502,
    )
  }

  const internalId = crypto.randomUUID()
  const createSessionRes = await callRoom.fetch(
    new Request("http://do.internal/?action=createSession", {
      method: "POST",
      body: JSON.stringify({
        internalId,
        participantId: authorizedParticipant.participantId,
        participantSecret: authorizedParticipant.participantSecret,
        cfSessionId,
      }),
    }),
  )

  if (!createSessionRes.ok) {
    if (createSessionRes.status === 403) {
      return c.json(
        {
          error: "Participant authentication failed",
          code: "PARTICIPANT_AUTH_FAILED",
        } as ErrorResponse,
        403,
      )
    }
    return c.json(
      { error: "Failed to register session", code: "INTERNAL_ERROR" } as ErrorResponse,
      500,
    )
  }

  const createSessionData = (await createSessionRes.json()) as {
    participantId: string
    participantSecret: string
  }

  if (debug) {
    console.log(
      `[sessions/new] Created: internal=${internalId.slice(0, 8)}, cf=${cfSessionId.slice(0, 8)}`,
    )
  }

  return c.json({
    sessionId: internalId,
    cloudflareSessionId: cfSessionId,
    participantId: createSessionData.participantId,
    participantSecret: createSessionData.participantSecret,
  } as CreateSessionResponse)
}

// Hono app
export const app = new Hono<{ Bindings: Env }>()

// Request logging in development
app.use("*", logger())

registerAdminAuthRoutes<Env>(app, {
  defaultBudgetKey,
  badRequest,
  readJsonBody,
  requireAdminSession,
  requireBudgetAccess,
  isKnownBudgetKey,
  isAuthDisabled,
  serviceEntitlementHeader,
  serviceEntitlementErrorResponse,
  verifyServiceEntitlementToken,
  hostAdminHeader: HOST_ADMIN_HEADER,
  budgetAdminHeader: BUDGET_ADMIN_HEADER,
  mintHostAdminSessionToken,
  mintBudgetAdminSessionToken,
  verifyBudgetAdminToken,
  getBudgetAdminTokenRegistry,
  resolveHostAdminAccess: (options) =>
    resolveHostAdminAccess({
      ...options,
      env: options.env as AuthResolveEnv,
      getReusableServiceEntitlementTokenForBudget:
        options.getReusableServiceEntitlementTokenForBudget as (
          env: AuthResolveEnv,
          budgetKey: string,
        ) => Promise<string | null>,
      mintServiceEntitlementTokenForBudget: options.mintServiceEntitlementTokenForBudget as (
        env: AuthResolveEnv,
        budgetKey: string,
        label?: string | null,
      ) => Promise<{ serviceEntitlementToken: string; budgetKey: string }>,
    }),
  resolveBudgetAdminAccess: (options) =>
    resolveBudgetAdminAccess({
      ...options,
      env: options.env as AuthResolveEnv,
      getReusableServiceEntitlementTokenForBudget:
        options.getReusableServiceEntitlementTokenForBudget as (
          env: AuthResolveEnv,
          budgetKey: string,
        ) => Promise<string | null>,
      mintServiceEntitlementTokenForBudget: options.mintServiceEntitlementTokenForBudget as (
        env: AuthResolveEnv,
        budgetKey: string,
        label?: string | null,
      ) => Promise<{ serviceEntitlementToken: string; budgetKey: string }>,
    }),
  getReusableServiceEntitlementTokenForBudget,
  mintServiceEntitlementTokenForBudget: async (env, budgetKey, label) => {
    const entitlement = await mintServiceEntitlementTokenForBudget(env as Env, budgetKey, label)
    return {
      serviceEntitlementToken: entitlement.serviceEntitlementToken,
      budgetKey: entitlement.budgetKey,
    }
  },
})

app.post("/admin/bootstrap/seed-credentials", async (c) => {
  if (!isAuthDisabled(c.env)) {
    const bootstrapToken = c.req.header(HOST_ADMIN_HEADER)
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

  const budgetKey = defaultBudgetKey(c.env)
  const budgetData = await inspectBudget(c.env, budgetKey)
  await ensureMonthlyAllowanceForBudget(c.env, budgetKey)

  const budgetAdminToken = await getOrCreateBudgetAdminToken(c.env, budgetKey)

  const budget = getEntitlementBudgetByKey(c.env, budgetKey)
  const secretRes = await budget.fetch(new Request("http://do.internal/?action=getCurrentSecret"))
  if (!secretRes.ok) {
    const rotateRes = await budget.fetch(
      new Request("http://do.internal/?action=rotateSecret", { method: "POST" }),
    )
    if (!rotateRes.ok) {
      return c.json({ error: "Failed to initialize budget secret" }, 500)
    }
  }

  const currentSecretRes = await budget.fetch(
    new Request("http://do.internal/?action=getCurrentSecret"),
  )
  if (!currentSecretRes.ok) {
    return c.json({ error: "Failed to get budget secret" }, 500)
  }

  const { version, secret } = (await currentSecretRes.json()) as { version: number; secret: string }
  const serviceEntitlementToken = await mintToken(budgetData.budgetId, version, secret)
  const tokenClaims = parseToken(serviceEntitlementToken)?.claims
  if (!tokenClaims) {
    return c.json({ error: "Failed to mint service entitlement token" }, 500)
  }

  await upsertEntitlementTokenRegistry(c.env, {
    tokenId: tokenClaims.tokenId,
    budgetKey,
    budgetId: budgetData.budgetId,
    secretVersion: version,
    tokenValue: serviceEntitlementToken,
    tokenPreview: buildTokenPreview(serviceEntitlementToken),
    label: "Example token label",
  })

  return c.json({
    ok: true,
    budgetKey,
    budgetId: budgetData.budgetId,
    hostAdminBootstrapToken: c.env.HOST_ADMIN_BOOTSTRAP_TOKEN,
    budgetAdminToken,
    serviceEntitlementToken,
  })
})

// Rate limiting for call ID discovery (prevents brute force scanning)
const DISCOVERY_RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const DISCOVERY_RATE_LIMIT_MAX = 60 // 60 discovery requests per minute per IP
const discoveryRateLimitStore = new Map<string, { count: number; resetAt: number }>()
const STATUS_RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const STATUS_RATE_LIMIT_MAX = 120 // 120 room checks per minute per IP
const statusRateLimitStore = new Map<string, { count: number; resetAt: number }>()

function checkDiscoveryRateLimit(ip: string): {
  allowed: boolean
  remaining: number
  resetAt: number
} {
  const now = Date.now()
  const record = discoveryRateLimitStore.get(ip)

  if (!record || now > record.resetAt) {
    discoveryRateLimitStore.set(ip, { count: 1, resetAt: now + DISCOVERY_RATE_LIMIT_WINDOW })
    return {
      allowed: true,
      remaining: DISCOVERY_RATE_LIMIT_MAX - 1,
      resetAt: now + DISCOVERY_RATE_LIMIT_WINDOW,
    }
  }

  if (record.count >= DISCOVERY_RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt }
  }

  record.count++
  return {
    allowed: true,
    remaining: DISCOVERY_RATE_LIMIT_MAX - record.count,
    resetAt: record.resetAt,
  }
}

function checkStatusRateLimit(
  ip: string,
  cost: number,
): {
  allowed: boolean
  remaining: number
  resetAt: number
} {
  const now = Date.now()
  const record = statusRateLimitStore.get(ip)

  if (!record || now > record.resetAt) {
    const nextCount = Math.min(cost, STATUS_RATE_LIMIT_MAX)
    statusRateLimitStore.set(ip, { count: nextCount, resetAt: now + STATUS_RATE_LIMIT_WINDOW })
    return {
      allowed: cost <= STATUS_RATE_LIMIT_MAX,
      remaining: Math.max(0, STATUS_RATE_LIMIT_MAX - nextCount),
      resetAt: now + STATUS_RATE_LIMIT_WINDOW,
    }
  }

  if (record.count + cost > STATUS_RATE_LIMIT_MAX) {
    return {
      allowed: false,
      remaining: Math.max(0, STATUS_RATE_LIMIT_MAX - record.count),
      resetAt: record.resetAt,
    }
  }

  record.count += cost
  return {
    allowed: true,
    remaining: STATUS_RATE_LIMIT_MAX - record.count,
    resetAt: record.resetAt,
  }
}

// Error handling
app.notFound((c) => c.json({ error: "Not found", code: "NOT_FOUND" } as ErrorResponse, 404))

app.onError((err, c) => {
  console.error("[unhandled]", err)
  return c.json(
    {
      error: "Internal error",
      code: "INTERNAL_ERROR",
      details: isDebugEnabled(c.env) ? err.message : undefined,
    } as ErrorResponse,
    500,
  )
})

registerAdminBudgetTokenRoutes(app, {
  defaultBudgetKey,
  badRequest,
  readJsonBody,
  requiredTrimmedField,
  upsertBudgetRegistry,
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
  updateBudgetMeterAtTokenLevel,
  getTokenUsageLedger,
  getBudgetMeterAtTokenLevel: async (env: Env, budgetKey: string) => {
    const record = await getBudgetRegistry(env, budgetKey)
    return record?.meterAtTokenLevel ?? false
  },
})

registerAdminMonthlyAllowanceRoutes(app, {
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
})

app.get("/admin/host/budgets", async (c) => {
  const adminError = await requireAdminSession(c)
  if (adminError) return adminError

  await ensureHostAdminRegistrySeeded(c.env)

  return c.json({
    budgets: await getKnownBudgets(c.env),
  })
})

app.get("/admin/host/monthly-allowances", async (c) => {
  const adminError = await requireAdminSession(c)
  if (adminError) return adminError

  await ensureHostAdminRegistrySeeded(c.env)

  return c.json({
    monthlyAllowances: await getKnownMonthlyAllowances(c.env),
  })
})

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    version: "1.0.0",
    // Note: Call counts not available with Durable Objects architecture
    callsActive: -1,
    sessionsActive: -1,
  } as HealthResponse)
})

// 1. SESSION — VERIFIED
app.get("/api/rooms/:roomId/status", handleGetRoomStatus)

app.post("/api/rooms/status", handleBatchRoomStatus)

app.post("/api/rooms/:roomId/session", handleCreateSession)

// 2. PUBLISH (Push) — VERIFIED
app.post("/api/rooms/:roomId/publish-offer", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))
  const debug = isDebugEnabled(env)

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  let body: PublishOfferRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, "sessionId")
    requireNonEmptyString(body.sdpOffer, "sdpOffer")
    requireNonEmptyArray(body.tracks, "tracks")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  // Look up session in Durable Object to get cfSessionId
  let cfSessionId: string
  const callRoom = getCallRoom(env, roomId)

  try {
    const sessionRes = await callRoom.fetch(
      new Request(`http://do.internal/?action=getSession&internalId=${body.sessionId}`),
    )

    if (!sessionRes.ok) {
      if (sessionRes.status === 409) {
        return c.json({ error: "Session replaced", code: "SESSION_REPLACED" } as ErrorResponse, 409)
      }
      const errorText = await sessionRes.text()
      console.error(`[publish] DO lookup failed: ${sessionRes.status}`, errorText)
      if (sessionRes.status === 404) {
        return c.json(
          { error: "Session not found", code: "SESSION_NOT_FOUND" } as ErrorResponse,
          404,
        )
      }
      return c.json(
        { error: "Failed to look up session", code: "INTERNAL_ERROR" } as ErrorResponse,
        500,
      )
    }

    const sessionData = (await sessionRes.json()) as { cfSessionId: string }
    cfSessionId = sessionData.cfSessionId
  } catch (e) {
    console.error("[publish] DO lookup exception:", e)
    return c.json(
      { error: `DO lookup failed: ${String(e)}`, code: "INTERNAL_ERROR" } as ErrorResponse,
      500,
    )
  }

  if (debug) {
    console.log(
      `[tracks/new/push] Publishing ${body.tracks.length} tracks for session: ${body.sessionId.slice(0, 8)}`,
    )
  }

  // VERIFIED: tracks/new with location: "local" returns Answer
  const res = await fetch(
    `${REALTIME_API}/${env.REALTIME_APP_ID}/sessions/${cfSessionId}/tracks/new`,
    {
      method: "POST",
      headers: apiHeaders(env),
      body: JSON.stringify({
        sessionDescription: {
          type: "offer",
          sdp: body.sdpOffer,
        },
        tracks: body.tracks.map((t) => ({
          location: "local",
          mid: t.mid,
          trackName: t.trackName,
        })),
      }),
    },
  )

  let cfResponse: {
    sessionDescription?: { type: string; sdp: string }
    tracks?: Array<{ mid: string; trackName: string }>
  }
  try {
    const { data } = await parseCloudflareResponse(res, "tracks/new-push", debug)
    cfResponse = data as typeof cfResponse
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "UPSTREAM_ERROR" } as ErrorResponse, 502)
  }

  if (!cfResponse?.sessionDescription || cfResponse.sessionDescription.type !== "answer") {
    return c.json(
      {
        error: "Unexpected response: expected answer",
        code: "INVALID_RESPONSE",
      } as ErrorResponse,
      502,
    )
  }

  // Store published tracks in Durable Object for remote discovery
  const publishStateRes = await callRoom.fetch(
    new Request("http://do.internal/?action=publishTracks", {
      method: "POST",
      body: JSON.stringify({
        internalId: body.sessionId,
        tracks: body.tracks,
      }),
    }),
  )

  if (!publishStateRes.ok) {
    if (publishStateRes.status === 409) {
      return c.json({ error: "Session replaced", code: "SESSION_REPLACED" } as ErrorResponse, 409)
    }
    if (publishStateRes.status === 404) {
      return c.json({ error: "Session not found", code: "SESSION_NOT_FOUND" } as ErrorResponse, 404)
    }
    return c.json(
      { error: "Failed to store published tracks", code: "INTERNAL_ERROR" } as ErrorResponse,
      500,
    )
  }

  if (debug) {
    console.log(
      `[tracks/new/push] Success: got answer, ${cfResponse.tracks?.length || 0} tracks confirmed`,
    )
  }

  return c.json({
    sessionDescription: cfResponse.sessionDescription,
    tracks: cfResponse.tracks || [],
  } as PublishOfferResponse)
})

// 3. SUBSCRIBE (Pull) — VERIFIED ⭐ Q8 RESOLVED
// Call tracks/new with location: "remote" to get Offer for remote tracks
app.post("/api/rooms/:roomId/subscribe-offer", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))
  const debug = isDebugEnabled(env)

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  let body: SubscribeOfferRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, "sessionId")
    requireNonEmptyArray(body.remoteTracks, "remoteTracks")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  // Look up session in Durable Object to get cfSessionId
  const callRoom = getCallRoom(env, roomId)
  const sessionRes = await callRoom.fetch(
    new Request(`http://do.internal/?action=getSession&internalId=${body.sessionId}`),
  )

  if (!sessionRes.ok) {
    if (sessionRes.status === 409) {
      return c.json({ error: "Session replaced", code: "SESSION_REPLACED" } as ErrorResponse, 409)
    }
    if (sessionRes.status === 404) {
      return c.json({ error: "Session not found", code: "SESSION_NOT_FOUND" } as ErrorResponse, 404)
    }
    return c.json(
      { error: "Failed to look up session", code: "INTERNAL_ERROR" } as ErrorResponse,
      500,
    )
  }

  const sessionData = (await sessionRes.json()) as { cfSessionId: string }
  const cfSessionId = sessionData.cfSessionId

  if (debug) {
    console.log(`[tracks/new/pull] Subscribing to ${body.remoteTracks.length} remote tracks`)
    console.log(`[tracks/new/pull] Local session cfId: ${cfSessionId.slice(0, 8)}`)
  }

  // VERIFIED: tracks/new with location: "remote" returns OFFER
  const tracksToSubscribe = body.remoteTracks.map((t) => ({
    location: "remote" as const,
    trackName: t.trackName,
    sessionId: t.sessionId,
  }))

  if (debug) {
    console.log(`[tracks/new/pull] Subscribing ${body.remoteTracks.length} tracks`)
    console.log(`[tracks/new/pull] Local session cfId: ${cfSessionId.slice(0, 8)}`)
    console.log(
      `[tracks/new/pull] Request body:`,
      JSON.stringify({ tracks: tracksToSubscribe }, null, 2),
    )
  }

  const res = await fetch(
    `${REALTIME_API}/${env.REALTIME_APP_ID}/sessions/${cfSessionId}/tracks/new`,
    {
      method: "POST",
      headers: apiHeaders(env),
      body: JSON.stringify({ tracks: tracksToSubscribe }),
    },
  )

  if (!res.ok) {
    const errorText = await res.text()
    console.error(`[tracks/new/pull] Cloudflare error ${res.status}:`, errorText.slice(0, 500))
  }

  let cfResponse: {
    sessionDescription?: { type: string; sdp: string }
    tracks?: Array<{ sessionId: string; trackName: string; mid: string }>
    requiresImmediateRenegotiation?: boolean
  }
  try {
    const { data } = await parseCloudflareResponse(res, "tracks/new-pull", debug)
    cfResponse = data as typeof cfResponse
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "UPSTREAM_ERROR" } as ErrorResponse, 502)
  }

  if (!cfResponse?.sessionDescription || cfResponse.sessionDescription.type !== "offer") {
    return c.json(
      {
        error: "Unexpected response: expected offer",
        code: "INVALID_RESPONSE",
      } as ErrorResponse,
      502,
    )
  }

  if (debug) {
    console.log(`[tracks/new/pull] Success: got offer, ${cfResponse.tracks?.length || 0} tracks`)
  }

  return c.json({
    sessionDescription: cfResponse.sessionDescription,
    tracks: cfResponse.tracks || [],
    requiresImmediateRenegotiation: cfResponse.requiresImmediateRenegotiation ?? true,
  } as SubscribeOfferResponse)
})

// 4. COMPLETE-SUBSCRIBE — VERIFIED
// Send Answer to Cloudflare via PUT /renegotiate
app.post("/api/rooms/:roomId/complete-subscribe", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))
  const debug = isDebugEnabled(env)

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  let body: CompleteSubscribeRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, "sessionId")
    requireNonEmptyString(body.sdpAnswer, "sdpAnswer")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  // Look up session in Durable Object to get cfSessionId
  const callRoom = getCallRoom(env, roomId)
  const sessionRes = await callRoom.fetch(
    new Request(`http://do.internal/?action=getSession&internalId=${body.sessionId}`),
  )

  if (!sessionRes.ok) {
    if (sessionRes.status === 409) {
      return c.json({ error: "Session replaced", code: "SESSION_REPLACED" } as ErrorResponse, 409)
    }
    if (sessionRes.status === 404) {
      return c.json({ error: "Session not found", code: "SESSION_NOT_FOUND" } as ErrorResponse, 404)
    }
    return c.json(
      { error: "Failed to look up session", code: "INTERNAL_ERROR" } as ErrorResponse,
      500,
    )
  }

  const sessionData = (await sessionRes.json()) as { cfSessionId: string }
  const cfSessionId = sessionData.cfSessionId

  if (debug) {
    console.log(`[renegotiate] Sending answer for session: ${body.sessionId.slice(0, 8)}`)
  }

  // VERIFIED: PUT /renegotiate with sessionDescription (Answer)
  const res = await fetch(
    `${REALTIME_API}/${env.REALTIME_APP_ID}/sessions/${cfSessionId}/renegotiate`,
    {
      method: "PUT", // VERIFIED: PUT not POST
      headers: apiHeaders(env),
      body: JSON.stringify({
        sessionDescription: {
          type: "answer",
          sdp: body.sdpAnswer,
        },
      }),
    },
  )

  try {
    await parseCloudflareResponse(res, "renegotiate", debug)
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "UPSTREAM_ERROR" } as ErrorResponse, 502)
  }

  if (debug) {
    console.log(`[renegotiate] Success: subscription complete`)
  }

  return c.json({ ok: true } as OkResponse)
})

// 5. DISCOVER-REMOTE-TRACKS
// App-level discovery — returns other participants' track refs
app.get("/api/rooms/:roomId/discover-remote-tracks", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))
  const debug = isDebugEnabled(env)

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  // Rate limit discovery requests (prevents brute force scanning of call IDs)
  const ip = c.req.header("CF-Connecting-IP") || "unknown"
  const rateLimit = checkDiscoveryRateLimit(ip)

  c.header("X-RateLimit-Limit", String(DISCOVERY_RATE_LIMIT_MAX))
  c.header("X-RateLimit-Remaining", String(rateLimit.remaining))

  if (!rateLimit.allowed) {
    return c.json(
      {
        error: "Rate limit exceeded",
        code: "RATE_LIMITED",
        message: "Too many discovery requests. Please wait before retrying.",
      },
      429,
    )
  }

  const selfId = c.req.query("sessionId")

  // Get remote tracks from Durable Object
  const callRoom = getCallRoom(env, roomId)
  const tracksRes = await callRoom.fetch(
    new Request(`http://do.internal/?action=getRemoteTracks&selfId=${selfId || ""}`),
  )

  if (!tracksRes.ok) {
    if (tracksRes.status === 409) {
      return c.json({ error: "Session replaced", code: "SESSION_REPLACED" } as ErrorResponse, 409)
    }
    if (tracksRes.status === 404) {
      return c.json({ error: "Session not found", code: "SESSION_NOT_FOUND" } as ErrorResponse, 404)
    }
    return c.json({
      tracks: [],
      remoteParticipantCount: 0,
      remoteParticipants: [],
    } as DiscoverRemoteTracksResponse)
  }

  const tracksData = (await tracksRes.json()) as DiscoverRemoteTracksResponse

  if (debug) {
    console.log(
      `[discover] roomId: ${roomId}, selfId: ${selfId?.slice(0, 8)}, remote tracks: ${tracksData.tracks.length}, remote participants: ${tracksData.remoteParticipantCount}`,
    )
  }

  return c.json(tracksData)
})

// 6. HEARTBEAT
app.post("/api/rooms/:roomId/heartbeat", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  let body: HeartbeatRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, "sessionId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  const callRoom = getCallRoom(env, roomId)
  const heartbeatRes = await callRoom.fetch(
    new Request("http://do.internal/?action=heartbeat", {
      method: "POST",
      body: JSON.stringify({ internalId: body.sessionId }),
    }),
  )

  if (!heartbeatRes.ok) {
    if (heartbeatRes.status === 409) {
      return c.json({ error: "Session replaced", code: "SESSION_REPLACED" } as ErrorResponse, 409)
    }
    if (heartbeatRes.status === 404) {
      return c.json({ error: "Session not found", code: "SESSION_NOT_FOUND" } as ErrorResponse, 404)
    }
    return c.json(
      { error: "Failed to update presence", code: "INTERNAL_ERROR" } as ErrorResponse,
      500,
    )
  }

  return c.json({ ok: true } as OkResponse)
})

// 7. MEDIA STATE
app.post("/api/rooms/:roomId/media-state", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  let body: MediaStateRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, "sessionId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  const callRoom = getCallRoom(env, roomId)
  const stateRes = await callRoom.fetch(
    new Request("http://do.internal/?action=updateMediaState", {
      method: "POST",
      body: JSON.stringify({
        internalId: body.sessionId,
        audioEnabled: body.audioEnabled,
        videoEnabled: body.videoEnabled,
      }),
    }),
  )

  if (!stateRes.ok) {
    if (stateRes.status === 409) {
      return c.json({ error: "Session replaced", code: "SESSION_REPLACED" } as ErrorResponse, 409)
    }
    if (stateRes.status === 404) {
      return c.json({ error: "Session not found", code: "SESSION_NOT_FOUND" } as ErrorResponse, 404)
    }
    return c.json(
      { error: "Failed to update media state", code: "INTERNAL_ERROR" } as ErrorResponse,
      500,
    )
  }

  return c.json({ ok: true } as OkResponse)
})

// 8. TERMINATE ROOM
app.post("/api/rooms/:roomId/terminate", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  const adminError = await requireAdminSession(c)
  if (adminError) return adminError

  const callRoom = getCallRoom(env, roomId)
  await callRoom.fetch(
    new Request("http://do.internal/?action=terminateRoom", {
      method: "POST",
    }),
  )

  return c.json({ ok: true } as TerminateRoomResponse)
})

// 9. METERING - Charge budget for room usage
app.post("/api/rooms/:roomId/meter", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  let body: {
    bytes: number
    budgetId: string
    budgetKey: string
    tokenId?: string
    meterAtTokenLevel?: boolean
  }
  try {
    body = await c.req.json()
    if (typeof body.bytes !== "number" || body.bytes <= 0) {
      throw new Error("Invalid bytes value")
    }
    if (!body.budgetId) {
      throw new Error("budgetId required")
    }
    if (!body.budgetKey) {
      throw new Error("budgetKey required")
    }
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  // Charge the budget (and token ledger in parallel when token-level metering is on)
  const budget = getEntitlementBudgetByKey(env, body.budgetKey)
  const chargeResPromise = budget.fetch(
    new Request("http://do.internal/?action=charge", {
      method: "POST",
      body: JSON.stringify({ bytes: body.bytes, roomId }),
    }),
  )
  if (body.meterAtTokenLevel && body.tokenId) {
    const ledger = getTokenUsageLedger(env, body.tokenId)
    c.executionCtx.waitUntil(
      ledger
        .fetch(
          new Request("http://do.internal/?action=charge", {
            method: "POST",
            body: JSON.stringify({ bytes: body.bytes }),
          }),
        )
        .catch((e) => console.warn("[meter] Token ledger charge failed", e)),
    )
  }
  const chargeRes = await chargeResPromise

  const chargeResult = (await chargeRes.json()) as {
    ok: boolean
    reason?: "uninitialized" | "exhausted" | "disabled"
    remainingBytes?: number
    lifecycle?: "uninitialized" | "active" | "in_grace" | "exhausted"
    graceEndsAt?: number
    graceClaimedByRoomId?: string | null
  }

  // Update room with charge result
  const callRoom = getCallRoom(env, roomId)
  await callRoom.fetch(
    new Request("http://do.internal/?action=handleChargeResult", {
      method: "POST",
      body: JSON.stringify(chargeResult),
    }),
  )

  if (!chargeRes.ok && chargeResult.reason === "disabled") {
    return c.json(
      {
        error: "Service budget disabled",
        code: "SERVICE_BUDGET_DISABLED",
        lifecycle: chargeResult.lifecycle,
        graceEndsAt: chargeResult.graceEndsAt,
        graceClaimedByRoomId: chargeResult.graceClaimedByRoomId,
      },
      403,
    )
  }

  if (!chargeRes.ok && chargeResult.reason === "uninitialized") {
    return c.json(
      {
        error: "Service budget not initialized",
        code: "SERVICE_BUDGET_UNINITIALIZED",
        lifecycle: chargeResult.lifecycle,
        graceEndsAt: chargeResult.graceEndsAt,
        graceClaimedByRoomId: chargeResult.graceClaimedByRoomId,
      },
      409,
    )
  }

  if (!chargeRes.ok && chargeRes.status === 402) {
    return c.json(
      {
        error: "Service budget exhausted",
        code: "SERVICE_BUDGET_EXHAUSTED",
        lifecycle: chargeResult.lifecycle,
        graceEndsAt: chargeResult.graceEndsAt,
        graceClaimedByRoomId: chargeResult.graceClaimedByRoomId,
      },
      402,
    )
  }

  return c.json({
    ok: true,
    remainingBytes: chargeResult.remainingBytes,
    lifecycle: chargeResult.lifecycle,
    graceEndsAt: chargeResult.graceEndsAt,
    graceClaimedByRoomId: chargeResult.graceClaimedByRoomId,
  })
})

// 10. GET METERING STATUS
app.get("/api/rooms/:roomId/meter", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  // Get status from budget
  const callRoom = getCallRoom(env, roomId)
  const budgetLookupRes = await callRoom.fetch(
    new Request("http://do.internal/?action=getBudgetId"),
  )
  if (!budgetLookupRes.ok) {
    return c.json({ error: "Failed to resolve room budget", code: "INTERNAL_ERROR" }, 500)
  }
  const budgetLookup = (await budgetLookupRes.json()) as { budgetKey?: string | null }
  if (!budgetLookup.budgetKey) {
    return c.json({ error: "Room budget not bound", code: "ROOM_BUDGET_UNBOUND" }, 409)
  }

  const budget = getEntitlementBudgetByKey(env, budgetLookup.budgetKey)
  const statusRes = await budget.fetch(new Request("http://do.internal/?action=getChargeStatus"))
  const status = (await statusRes.json()) as {
    remainingBytes: number
    lifecycle: "uninitialized" | "active" | "in_grace" | "exhausted"
    graceEndsAt: number | null
    graceClaimedByRoomId: string | null
    graceRemainingMs: number
  }

  return c.json({
    remainingBytes: status.remainingBytes,
    lifecycle: status.lifecycle,
    graceEndsAt: status.graceEndsAt,
    graceClaimedByRoomId: status.graceClaimedByRoomId,
    graceRemainingMinutes: Math.ceil(status.graceRemainingMs / 60000),
  })
})

// 11. LEAVE
app.post("/api/rooms/:roomId/leave", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))

  try {
    requireNonEmptyString(roomId, "roomId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  let body: LeaveRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, "sessionId")
  } catch (e) {
    return c.json({ error: (e as Error).message, code: "BAD_REQUEST" } as ErrorResponse, 400)
  }

  // Remove from Durable Object
  const callRoom = getCallRoom(env, roomId)
  await callRoom.fetch(
    new Request("http://do.internal/?action=leave", {
      method: "POST",
      body: JSON.stringify({ internalId: body.sessionId }),
    }),
  )

  return c.json({ ok: true } as OkResponse)
})

/**
 * Serve static assets (SPA)
 * When ASSETS binding is available, serve the frontend
 * This catch-all must be LAST after all API routes
 */
app.get("*", async (c) => {
  // Try to serve from ASSETS binding if available
  if (c.env.ASSETS) {
    try {
      const assetResponse = await c.env.ASSETS.fetch(c.req.raw)
      if (assetResponse.status !== 404) {
        return assetResponse
      }
    } catch {
      // Fall through to serve index.html for SPA routing
    }

    // For SPA routing, serve index.html for non-API routes
    try {
      const indexResponse = await c.env.ASSETS.fetch(new URL("/index.html", c.req.url))
      if (indexResponse.ok) {
        return indexResponse
      }
    } catch {
      // Fall through to API response
    }
  }

  // Fallback API response if no assets or 404
  return c.json({
    message: "telesense API",
    version: "1.0.0",
    status: "running",
    note: "Frontend not built or ASSETS binding not configured",
  })
})

async function runScheduledMonthlyAllowance(env: Env) {
  await ensureHostAdminRegistrySeeded(env)

  const configuredAllowances = await getKnownMonthlyAllowances(env)
  const allowanceIds =
    configuredAllowances.length > 0
      ? configuredAllowances.map((record) => record.allowanceId)
      : [defaultMonthlyAllowanceId(env)]

  for (const allowanceId of allowanceIds) {
    const monthlyAllowance = getMonthlyAllowanceById(env, allowanceId)
    const statusRes = await monthlyAllowance.fetch(
      new Request("http://do.internal/?action=getStatus"),
    )
    if (!statusRes.ok) continue
    const status = (await statusRes.json()) as {
      budgetKey: string
      resetAmountBytes: number
      lifecycle: "inactive" | "scheduled" | "due"
      active: boolean
      cronExpr: string
    }

    await upsertMonthlyAllowanceRegistry(env, {
      allowanceId,
      budgetKey: status.budgetKey,
      active: status.active,
      cronExpr: status.cronExpr,
    })

    if (status.lifecycle !== "due") continue

    const budget = getEntitlementBudgetByKey(env, status.budgetKey)
    const resetRes = await budget.fetch(
      new Request("http://do.internal/?action=setSnapshot", {
        method: "POST",
        body: JSON.stringify({
          remainingBytes: status.resetAmountBytes,
          consumedBytes: 0,
        }),
      }),
    )
    if (!resetRes.ok) continue

    await monthlyAllowance.fetch(
      new Request("http://do.internal/?action=acknowledgeReset", {
        method: "POST",
        body: JSON.stringify({ appliedAt: Date.now() }),
      }),
    )

    // Reset token-level ledgers if this budget uses per-token metering
    const budgetRegistry = await getBudgetRegistry(env, status.budgetKey)
    if (budgetRegistry?.meterAtTokenLevel) {
      const tokens = await listEntitlementTokensByBudgetKey(env, status.budgetKey)
      await Promise.allSettled(
        tokens.map((token) =>
          getTokenUsageLedger(env, token.tokenId).fetch(
            new Request("http://do.internal/?action=resetUsage", { method: "POST" }),
          ),
        ),
      )
    }
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await runScheduledMonthlyAllowance(env)
  },
}

// Export Durable Object classes
export { CallRoom }
export { EntitlementBudget }
export { MonthlyAllowance }
export { TokenUsageLedger }
