// Cloudflare Realtime Worker — UNLOCKED with verified payloads (Echo Demo 2026-03-18)
//
// VERIFIED ENDPOINTS:
// - POST /v1/apps/{appId}/sessions/new → { sessionId }
// - POST /v1/apps/{appId}/sessions/{sessionId}/tracks/new (push) → { sessionDescription, tracks }
// - POST /v1/apps/{appId}/sessions/{sessionId}/tracks/new (pull) → { sessionDescription, tracks }
// - PUT /v1/apps/{appId}/sessions/{sessionId}/renegotiate → {}
//
// See: docs/20260318-001-realtime-wire-contract.md

import { Hono } from 'hono'
import { logger } from 'hono/logger'

type Env = {
  REALTIME_APP_ID: string
  CF_CALLS_SECRET: string
  GENERIC_USER_TOKEN: string
  DO_NOT_ENFORCE_USER_TOKEN?: string  // Dev-only: set 'true' to disable auth
  DEBUG?: string
  BUDGET_KV?: KVNamespace  // Optional: for usage limiting
  ASSETS?: Fetcher  // Workers Sites static assets
}

// VERIFIED: rtc.live.cloudflare.com/v1 (not realtime.cloudflare.com/client/v4)
const REALTIME_API = 'https://rtc.live.cloudflare.com/v1/apps'

// Dev-only ephemeral rendezvous state; invalid across isolates/restarts/deploys.
// Production requires Durable Objects or external shared state.
const calls = new Map<string, Map<string, {
  cfSessionId: string
  publishedTracks: Array<{ trackName: string; mid: string }>
}>>()

// Type definitions
interface CreateSessionResponse {
  sessionId: string
  cloudflareSessionId: string
}

interface PublishOfferRequest {
  sessionId: string
  sdpOffer: string
  tracks: Array<{ mid: string; trackName: string }>
}

interface PublishOfferResponse {
  sessionDescription: {
    type: 'answer'
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
    type: 'offer'
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
}

interface LeaveRequest {
  sessionId: string
}

interface HealthResponse {
  status: 'healthy'
  version: string
  callsActive: number
  sessionsActive: number
}

interface ErrorResponse { 
  error: string
  code?: string
  details?: unknown
}

interface OkResponse { ok: true }

// Helper functions
function isDebugEnabled(env: Env): boolean {
  return env.DEBUG === 'true' || env.DEBUG === '1'
}

function apiHeaders(env: Env) {
  return {
    'Authorization': `Bearer ${env.CF_CALLS_SECRET}`,
    'Content-Type': 'application/json'
  }
}

async function parseCloudflareResponse(
  res: Response, 
  routeName: string, 
  debug: boolean
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
      parseError: (e as Error).message
    })
    throw new Error('Invalid JSON from upstream')
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
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
app.use('*', logger())

// Serve static assets (Workers Sites)
app.get('/', async (c) => {
  const asset = await c.env.ASSETS?.fetch(new Request(c.req.url))
  if (asset && asset.status === 200) {
    return asset
  }
  return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
})

// Auth: Require GENERIC_USER_TOKEN for all API routes (unless disabled in dev)
app.use('/api/*', async (c, next) => {
  const env = c.env
  
  // Skip auth in dev if DO_NOT_ENFORCE_USER_TOKEN is set
  if (env.DO_NOT_ENFORCE_USER_TOKEN === 'true') {
    return next()
  }
  
  const token = c.req.header('X-User-Token')
  
  if (!token) {
    return c.json({ 
      error: 'Missing authentication token', 
      code: 'AUTH_MISSING' 
    }, 401)
  }
  
  if (token !== env.GENERIC_USER_TOKEN) {
    console.warn(`[auth] Invalid token attempt from ${c.req.header('CF-Connecting-IP') || 'unknown'}`)
    return c.json({ 
      error: 'Invalid authentication token', 
      code: 'AUTH_INVALID' 
    }, 403)
  }
  
  return next()
})

// Error handling
app.notFound((c) => c.json({ error: 'Not found', code: 'NOT_FOUND' } as ErrorResponse, 404))

app.onError((err, c) => {
  console.error('[unhandled]', err)
  return c.json({ 
    error: 'Internal error', 
    code: 'INTERNAL_ERROR',
    details: isDebugEnabled(c.env) ? err.message : undefined
  } as ErrorResponse, 500)
})

// Health check endpoint
app.get('/health', (c) => {
  let sessionsActive = 0
  for (const call of calls.values()) {
    sessionsActive += call.size
  }
  
  return c.json({
    status: 'healthy',
    version: '0.0.1',
    callsActive: calls.size,
    sessionsActive
  } as HealthResponse)
})

// 1. SESSION — VERIFIED
app.post('/api/calls/:callId/session', async (c) => {
  const env = c.env
  const callId = c.req.param('callId')
  const debug = isDebugEnabled(env)

  try {
    requireNonEmptyString(callId, 'callId')
  } catch (e) {
    return c.json({ 
      error: (e as Error).message, 
      code: 'BAD_REQUEST' 
    } as ErrorResponse, 400)
  }

  if (debug) {
    console.log(`[sessions/new] Creating session for call: ${callId}`)
  }

  // VERIFIED: Empty body, response is { sessionId: "..." }
  const res = await fetch(`${REALTIME_API}/${env.REALTIME_APP_ID}/sessions/new`, {
    method: 'POST',
    headers: apiHeaders(env)
    // No body - truly empty POST
  })

  let cfResponse: { sessionId?: string }
  try {
    const { data } = await parseCloudflareResponse(res, 'sessions/new', debug)
    cfResponse = data as { sessionId?: string }
  } catch (e) {
    return c.json({ 
      error: (e as Error).message, 
      code: 'UPSTREAM_ERROR' 
    } as ErrorResponse, 502)
  }

  // VERIFIED: Response path is sessionId (not result.id)
  const cfSessionId = cfResponse?.sessionId
  if (!cfSessionId || typeof cfSessionId !== 'string') {
    return c.json({ 
      error: 'Unexpected Realtime response shape: missing sessionId',
      code: 'INVALID_RESPONSE'
    } as ErrorResponse, 502)
  }

  const internalId = crypto.randomUUID()
  if (!calls.has(callId)) calls.set(callId, new Map())
  calls.get(callId)!.set(internalId, { 
    cfSessionId, 
    publishedTracks: [] 
  })

  if (calls.size > 1000) {
    console.warn('[calls] excessive in-memory call count; dev-only store may be leaking')
  }

  if (debug) {
    console.log(`[sessions/new] Created: internal=${internalId.slice(0, 8)}, cf=${cfSessionId.slice(0, 8)}`)
  }

  return c.json({
    sessionId: internalId,
    cloudflareSessionId: cfSessionId
  } as CreateSessionResponse)
})

// 2. PUBLISH (Push) — VERIFIED
app.post('/api/calls/:callId/publish-offer', async (c) => {
  const env = c.env
  const callId = c.req.param('callId')
  const debug = isDebugEnabled(env)

  try {
    requireNonEmptyString(callId, 'callId')
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'BAD_REQUEST' } as ErrorResponse, 400)
  }

  let body: PublishOfferRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, 'sessionId')
    requireNonEmptyString(body.sdpOffer, 'sdpOffer')
    requireNonEmptyArray(body.tracks, 'tracks')
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'BAD_REQUEST' } as ErrorResponse, 400)
  }

  const session = calls.get(callId)?.get(body.sessionId)
  if (!session) {
    return c.json({ error: 'Session not found', code: 'SESSION_NOT_FOUND' } as ErrorResponse, 404)
  }

  if (debug) {
    console.log(`[tracks/new/push] Publishing ${body.tracks.length} tracks for session: ${body.sessionId.slice(0, 8)}`)
  }

  // VERIFIED: tracks/new with location: "local" returns Answer
  const res = await fetch(
    `${REALTIME_API}/${env.REALTIME_APP_ID}/sessions/${session.cfSessionId}/tracks/new`,
    {
      method: 'POST',
      headers: apiHeaders(env),
      body: JSON.stringify({
        sessionDescription: {
          type: 'offer',
          sdp: body.sdpOffer
        },
        tracks: body.tracks.map(t => ({
          location: 'local',
          mid: t.mid,
          trackName: t.trackName
        }))
      })
    }
  )

  let cfResponse: {
    sessionDescription?: { type: string; sdp: string }
    tracks?: Array<{ mid: string; trackName: string }>
  }
  try {
    const { data } = await parseCloudflareResponse(res, 'tracks/new-push', debug)
    cfResponse = data as typeof cfResponse
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'UPSTREAM_ERROR' } as ErrorResponse, 502)
  }

  if (!cfResponse?.sessionDescription || cfResponse.sessionDescription.type !== 'answer') {
    return c.json({ 
      error: 'Unexpected response: expected answer',
      code: 'INVALID_RESPONSE'
    } as ErrorResponse, 502)
  }

  // Store published tracks for remote discovery
  session.publishedTracks = body.tracks

  if (debug) {
    console.log(`[tracks/new/push] Success: got answer, ${cfResponse.tracks?.length || 0} tracks confirmed`)
  }

  return c.json({
    sessionDescription: cfResponse.sessionDescription,
    tracks: cfResponse.tracks || []
  } as PublishOfferResponse)
})

// 3. SUBSCRIBE (Pull) — VERIFIED ⭐ Q8 RESOLVED
// Call tracks/new with location: "remote" to get Offer for remote tracks
app.post('/api/calls/:callId/subscribe-offer', async (c) => {
  const env = c.env
  const callId = c.req.param('callId')
  const debug = isDebugEnabled(env)

  try {
    requireNonEmptyString(callId, 'callId')
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'BAD_REQUEST' } as ErrorResponse, 400)
  }

  let body: SubscribeOfferRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, 'sessionId')
    requireNonEmptyArray(body.remoteTracks, 'remoteTracks')
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'BAD_REQUEST' } as ErrorResponse, 400)
  }

  const session = calls.get(callId)?.get(body.sessionId)
  if (!session) {
    return c.json({ error: 'Session not found', code: 'SESSION_NOT_FOUND' } as ErrorResponse, 404)
  }

  if (debug) {
    console.log(`[tracks/new/pull] Subscribing to ${body.remoteTracks.length} remote tracks`)
  }

  // VERIFIED: tracks/new with location: "remote" returns OFFER
  const res = await fetch(
    `${REALTIME_API}/${env.REALTIME_APP_ID}/sessions/${session.cfSessionId}/tracks/new`,
    {
      method: 'POST',
      headers: apiHeaders(env),
      body: JSON.stringify({
        tracks: body.remoteTracks.map(t => ({
          location: 'remote',
          trackName: t.trackName,
          sessionId: t.sessionId
        }))
      })
    }
  )

  let cfResponse: {
    sessionDescription?: { type: string; sdp: string }
    tracks?: Array<{ sessionId: string; trackName: string; mid: string }>
    requiresImmediateRenegotiation?: boolean
  }
  try {
    const { data } = await parseCloudflareResponse(res, 'tracks/new-pull', debug)
    cfResponse = data as typeof cfResponse
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'UPSTREAM_ERROR' } as ErrorResponse, 502)
  }

  if (!cfResponse?.sessionDescription || cfResponse.sessionDescription.type !== 'offer') {
    return c.json({ 
      error: 'Unexpected response: expected offer',
      code: 'INVALID_RESPONSE'
    } as ErrorResponse, 502)
  }

  if (debug) {
    console.log(`[tracks/new/pull] Success: got offer, ${cfResponse.tracks?.length || 0} tracks`)
  }

  return c.json({
    sessionDescription: cfResponse.sessionDescription,
    tracks: cfResponse.tracks || [],
    requiresImmediateRenegotiation: cfResponse.requiresImmediateRenegotiation ?? true
  } as SubscribeOfferResponse)
})

// 4. COMPLETE-SUBSCRIBE — VERIFIED
// Send Answer to Cloudflare via PUT /renegotiate
app.post('/api/calls/:callId/complete-subscribe', async (c) => {
  const env = c.env
  const callId = c.req.param('callId')
  const debug = isDebugEnabled(env)

  try {
    requireNonEmptyString(callId, 'callId')
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'BAD_REQUEST' } as ErrorResponse, 400)
  }

  let body: CompleteSubscribeRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, 'sessionId')
    requireNonEmptyString(body.sdpAnswer, 'sdpAnswer')
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'BAD_REQUEST' } as ErrorResponse, 400)
  }

  const session = calls.get(callId)?.get(body.sessionId)
  if (!session) {
    return c.json({ error: 'Session not found', code: 'SESSION_NOT_FOUND' } as ErrorResponse, 404)
  }

  if (debug) {
    console.log(`[renegotiate] Sending answer for session: ${body.sessionId.slice(0, 8)}`)
  }

  // VERIFIED: PUT /renegotiate with sessionDescription (Answer)
  const res = await fetch(
    `${REALTIME_API}/${env.REALTIME_APP_ID}/sessions/${session.cfSessionId}/renegotiate`,
    {
      method: 'PUT',  // VERIFIED: PUT not POST
      headers: apiHeaders(env),
      body: JSON.stringify({
        sessionDescription: {
          type: 'answer',
          sdp: body.sdpAnswer
        }
      })
    }
  )

  try {
    await parseCloudflareResponse(res, 'renegotiate', debug)
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'UPSTREAM_ERROR' } as ErrorResponse, 502)
  }

  if (debug) {
    console.log(`[renegotiate] Success: subscription complete`)
  }

  return c.json({ ok: true } as OkResponse)
})

// 5. DISCOVER-REMOTE-TRACKS
// App-level discovery — returns other participants' track refs
app.get('/api/calls/:callId/discover-remote-tracks', (c) => {
  const callId = c.req.param('callId')

  try {
    requireNonEmptyString(callId, 'callId')
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'BAD_REQUEST' } as ErrorResponse, 400)
  }

  const selfId = c.req.query('sessionId')
  const call = calls.get(callId)
  
  if (!call) {
    return c.json({ tracks: [] } as DiscoverRemoteTracksResponse)
  }

  // Collect all tracks from other sessions
  const remoteTracks: DiscoverRemoteTracksResponse['tracks'] = []
  for (const [sessionId, session] of call.entries()) {
    if (sessionId === selfId) continue
    for (const track of session.publishedTracks) {
      remoteTracks.push({
        trackName: track.trackName,
        sessionId: session.cfSessionId,  // Cloudflare session ID
        mid: track.mid
      })
    }
  }

  return c.json({ tracks: remoteTracks })
})

// 6. LEAVE
app.post('/api/calls/:callId/leave', async (c) => {
  const callId = c.req.param('callId')

  try {
    requireNonEmptyString(callId, 'callId')
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'BAD_REQUEST' } as ErrorResponse, 400)
  }

  let body: LeaveRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, 'sessionId')
  } catch (e) {
    return c.json({ error: (e as Error).message, code: 'BAD_REQUEST' } as ErrorResponse, 400)
  }

  const session = calls.get(callId)?.get(body.sessionId)
  if (!session) return c.json({ ok: true } as OkResponse)

  // TODO: Call tracks/close if needed (not verified in Echo Demo)
  calls.get(callId)?.delete(body.sessionId)
  if (calls.get(callId)?.size === 0) calls.delete(callId)

  return c.json({ ok: true } as OkResponse)
})

export default app
