// Cloudflare Realtime Worker — Durable Objects for cross-device coordination
//
// VERIFIED ENDPOINTS:
// - POST /v1/apps/{appId}/sessions/new → { sessionId }
// - POST /v1/apps/{appId}/sessions/{sessionId}/tracks/new (push) → { sessionDescription, tracks }
// - POST /v1/apps/{appId}/sessions/{sessionId}/tracks/new (pull) → { sessionDescription, tracks }
// - PUT /v1/apps/{appId}/sessions/{sessionId}/renegotiate → {}
//
// See: docs/20260318-001-realtime-wire-contract.md

import { Hono } from "hono"
import { logger } from "hono/logger"
import { CallRoom } from "./call-room"

type Env = {
  REALTIME_APP_ID: string
  CF_CALLS_SECRET: string
  GENERIC_USER_TOKEN: string
  DO_NOT_ENFORCE_USER_TOKEN?: string // Dev-only: set 'true' to disable auth
  DEBUG?: string
  BUDGET_KV?: KVNamespace // Optional: for usage limiting
  ASSETS?: Fetcher // Workers Sites static assets
  CALL_ROOMS: DurableObjectNamespace
}

// VERIFIED: rtc.live.cloudflare.com/v1 (not realtime.cloudflare.com/client/v4)
const REALTIME_API = "https://rtc.live.cloudflare.com/v1/apps"

// Helper to get CallRoom DO instance
function getCallRoom(env: Env, roomId: string): DurableObjectStub {
  const id = env.CALL_ROOMS.idFromName(roomId)
  return env.CALL_ROOMS.get(id)
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
  participantId?: string
  participantSecret?: string
  confirmTakeover?: boolean
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

function isAuthDisabled(env: Env): boolean {
  return env.DO_NOT_ENFORCE_USER_TOKEN === "true"
}

function hasValidUserToken(request: Request, env: Env): boolean {
  if (isAuthDisabled(env)) {
    return true
  }

  const token = request.headers.get("X-User-Token")
  return !!token && token === env.GENERIC_USER_TOKEN
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

// Hono app
const app = new Hono<{ Bindings: Env }>()

// Request logging in development
app.use("*", logger())

app.get("/api/auth/verify", (c) => {
  if (!hasValidUserToken(c.req.raw, c.env)) {
    return c.json(
      {
        error: "Invalid authentication token",
        code: c.req.header("X-User-Token") ? "AUTH_INVALID" : "AUTH_MISSING",
      },
      c.req.header("X-User-Token") ? 403 : 401,
    )
  }

  return c.json({ ok: true } as OkResponse)
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
app.get("/api/rooms/:roomId/status", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))

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
})

app.post("/api/rooms/status", async (c) => {
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
        .slice(0, 12)
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
})

app.post("/api/rooms/:roomId/session", async (c) => {
  const env = c.env
  const roomId = normalizeRoomId(c.req.param("roomId"))
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

  if (!roomStatus.exists) {
    if (!hasValidUserToken(c.req.raw, env)) {
      return c.json(
        {
          error: "Room not found",
          code: c.req.header("X-User-Token") ? "ROOM_NOT_FOUND" : "AUTH_REQUIRED",
        } as ErrorResponse,
        c.req.header("X-User-Token") ? 404 : 401,
      )
    }
  }

  const authorizeParticipantRes = await callRoom.fetch(
    new Request("http://do.internal/?action=authorizeParticipant", {
      method: "POST",
      body: JSON.stringify({
        browserInstanceId: body.browserInstanceId,
        participantId: body.participantId,
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

  // VERIFIED: Empty body, response is { sessionId: "..." }
  const res = await fetch(`${REALTIME_API}/${env.REALTIME_APP_ID}/sessions/new`, {
    method: "POST",
    headers: apiHeaders(env),
    // No body - truly empty POST
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

  // VERIFIED: Response path is sessionId (not result.id)
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

  // Register with Durable Object for cross-device coordination
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
})

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

  if (!hasValidUserToken(c.req.raw, env)) {
    return c.json(
      {
        error: "Invalid authentication token",
        code: c.req.header("X-User-Token") ? "AUTH_INVALID" : "AUTH_MISSING",
      } as ErrorResponse,
      c.req.header("X-User-Token") ? 403 : 401,
    )
  }

  const callRoom = getCallRoom(env, roomId)
  await callRoom.fetch(
    new Request("http://do.internal/?action=terminateRoom", {
      method: "POST",
    }),
  )

  return c.json({ ok: true } as TerminateRoomResponse)
})

// 9. LEAVE
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
    message: "telesence API",
    version: "1.0.0",
    status: "running",
    note: "Frontend not built or ASSETS binding not configured",
  })
})

export default app

// Export Durable Object class
export { CallRoom }
