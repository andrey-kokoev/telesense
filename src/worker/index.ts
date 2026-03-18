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

type Env = {
  REALTIME_APP_ID: string
  REALTIME_APP_SECRET: string
}

// VERIFIED: rtc.live.cloudflare.com/v1 (not realtime.cloudflare.com/client/v4)
const REALTIME_API = 'https://rtc.live.cloudflare.com/v1/apps'
const DEBUG_PROTOCOL = false

// Dev-only ephemeral rendezvous state; invalid across isolates/restarts/deploys.
// Production requires Durable Objects or external shared state.
const calls = new Map<string, Map<string, {
  cfSessionId: string
  publishedTracks: Array<{ trackName: string; mid: string }>
}>>()

interface CreateSessionRequest {
  // Empty body verified
}

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
    sessionId: string  // Publisher's session ID
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

interface OkResponse { ok: true }
interface ErrorResponse { error: string }

const apiHeaders = (env: Env) => ({
  'Authorization': `Bearer ${env.REALTIME_APP_SECRET}`,
  'Content-Type': 'application/json'
})

async function parseCloudflareResponse(res: Response, routeName: string): Promise<{ data: unknown; text: string }> {
  const text = await res.text()
  if (!res.ok) {
    console.error(`[${routeName}] Upstream Cloudflare failure:`, {
      status: res.status,
      statusText: res.statusText,
      ...(DEBUG_PROTOCOL ? { body: text.slice(0, 500) } : {})
    })
    throw new Error(`Upstream failure: ${res.status}`)
  }
  try {
    const data = JSON.parse(text)
    return { data, text }
  } catch (e) {
    console.error(`[${routeName}] Failed to parse upstream JSON:`, {
      ...(DEBUG_PROTOCOL ? { rawBody: text.slice(0, 500) } : {}),
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

const app = new Hono<{ Bindings: Env }>()

app.notFound((c) => c.json({ error: 'Not found' } as ErrorResponse, 404))
app.onError((err, c) => {
  console.error('[unhandled]', err)
  return c.json({ error: 'Internal error' } as ErrorResponse, 500)
})

// 1. SESSION — VERIFIED
app.post('/api/calls/:callId/session', async (c) => {
  const env = c.env
  const callId = c.req.param('callId')

  try {
    requireNonEmptyString(callId, 'callId')
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }

  // VERIFIED: Empty body, response is { sessionId: "..." }
  const res = await fetch(`${REALTIME_API}/${env.REALTIME_APP_ID}/sessions/new`, {
    method: 'POST',
    headers: apiHeaders(env)
    // No body - truly empty POST
  })

  let cfResponse: { sessionId?: string }
  try {
    const { data } = await parseCloudflareResponse(res, 'sessions/new')
    cfResponse = data as { sessionId?: string }
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502)
  }

  // VERIFIED: Response path is sessionId (not result.id)
  const cfSessionId = cfResponse?.sessionId
  if (!cfSessionId || typeof cfSessionId !== 'string') {
    return c.json({ error: 'Unexpected Realtime response shape: missing sessionId' }, 502)
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

  return c.json({
    sessionId: internalId,
    cloudflareSessionId: cfSessionId
  } as CreateSessionResponse)
})

// 2. PUBLISH (Push) — VERIFIED
app.post('/api/calls/:callId/publish-offer', async (c) => {
  const env = c.env
  const callId = c.req.param('callId')

  try {
    requireNonEmptyString(callId, 'callId')
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }

  let body: PublishOfferRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, 'sessionId')
    requireNonEmptyString(body.sdpOffer, 'sdpOffer')
    requireNonEmptyArray(body.tracks, 'tracks')
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }

  const session = calls.get(callId)?.get(body.sessionId)
  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
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
    const { data } = await parseCloudflareResponse(res, 'tracks/new-push')
    cfResponse = data as typeof cfResponse
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502)
  }

  if (!cfResponse?.sessionDescription || cfResponse.sessionDescription.type !== 'answer') {
    return c.json({ error: 'Unexpected response: expected answer' }, 502)
  }

  // Store published tracks for remote discovery
  session.publishedTracks = body.tracks

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

  try {
    requireNonEmptyString(callId, 'callId')
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }

  let body: SubscribeOfferRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, 'sessionId')
    requireNonEmptyArray(body.remoteTracks, 'remoteTracks')
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }

  const session = calls.get(callId)?.get(body.sessionId)
  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
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
    const { data } = await parseCloudflareResponse(res, 'tracks/new-pull')
    cfResponse = data as typeof cfResponse
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502)
  }

  if (!cfResponse?.sessionDescription || cfResponse.sessionDescription.type !== 'offer') {
    return c.json({ error: 'Unexpected response: expected offer' }, 502)
  }

  return c.json({
    sessionDescription: cfResponse.sessionDescription,
    tracks: cfResponse.tracks || [],
    requiresImmediateRenegotiation: cfResponse.requiresImmediateRenegotiation || true
  } as SubscribeOfferResponse)
})

// 4. COMPLETE-SUBSCRIBE — VERIFIED
// Send Answer to Cloudflare via PUT /renegotiate
app.post('/api/calls/:callId/complete-subscribe', async (c) => {
  const env = c.env
  const callId = c.req.param('callId')

  try {
    requireNonEmptyString(callId, 'callId')
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }

  let body: CompleteSubscribeRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, 'sessionId')
    requireNonEmptyString(body.sdpAnswer, 'sdpAnswer')
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }

  const session = calls.get(callId)?.get(body.sessionId)
  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
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
    await parseCloudflareResponse(res, 'renegotiate')
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502)
  }

  return c.json({ ok: true } as OkResponse)
})

// 5. DISCOVER-REMOTE-TRACKS
// App-level discovery — returns other participants' track refs
app.get('/api/calls/:callId/discover-remote-tracks', async (c) => {
  const callId = c.req.param('callId')

  try {
    requireNonEmptyString(callId, 'callId')
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
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
    return c.json({ error: (e as Error).message }, 400)
  }

  let body: LeaveRequest
  try {
    body = await c.req.json()
    requireNonEmptyString(body.sessionId, 'sessionId')
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }

  const session = calls.get(callId)?.get(body.sessionId)
  if (!session) return c.json({ ok: true } as OkResponse)

  // TODO: Call tracks/close if needed (not verified in Echo Demo)
  calls.get(callId)?.delete(body.sessionId)
  if (calls.get(callId)?.size === 0) calls.delete(callId)

  return c.json({ ok: true } as OkResponse)
})

export default app
