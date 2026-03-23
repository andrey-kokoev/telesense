// Durable Object for managing call state across worker instances
// Enables cross-device session discovery and coordination

import { GRACE_PERIOD_MS } from "./entitlement-constants"

// Metering constants
const METERING_TICK_MS = 60 * 1000 // 60 seconds between metering ticks

// Estimated bitrate per track type (bytes per second)
const TRACK_BITRATE_ESTIMATES = {
  audio: 32_000 / 8, // 32 kbps in bytes/sec
  video: 1_500_000 / 8, // 1.5 Mbps in bytes/sec (high quality)
  screenshare: 3_000_000 / 8, // 3 Mbps in bytes/sec
}

export interface Session {
  internalId: string
  participantId: string
  cfSessionId: string
  publishedTracks: Array<{
    trackName: string
    mid: string
    trackType?: "audio" | "video" | "screenshare"
  }>
  joinedAt: number
  lastSeenAt: number
}

export interface Participant {
  participantId: string
  participantSecret: string
  activeSessionId: string | null
  pendingSessionId: string | null
  audioEnabled: boolean
  videoEnabled: boolean
  joinedAt: number
  lastSeenAt: number
}

export interface CallState {
  sessions: Map<string, Session>
  participants: Map<string, Participant>
  budgetId: string | null
  budgetKey: string | null
}

type SessionLookup =
  | { kind: "missing" }
  | { kind: "replaced"; session: Session }
  | { kind: "ok"; session: Session; participant: Participant }

type ParticipantLifecycle =
  | { kind: "ended" }
  | { kind: "active"; participant: Participant; activeSessionId: string }
  | {
      kind: "handoff_pending"
      participant: Participant
      activeSessionId: string
      pendingSessionId: string
    }

type RoomLifecycle = "inactive" | "active" | "in_grace" | "terminated"

export class CallRoom {
  private static readonly SESSION_TTL_MS = 15000
  private state: DurableObjectState
  private sessions: Map<string, Session> = new Map()
  private participants: Map<string, Participant> = new Map()
  private budgetId: string | null = null
  private budgetKey: string | null = null
  private roomId: string | null = null
  private workerBaseUrl: string | null = null
  private initialized: boolean = false

  // Metering state
  private meteringTimer: number | null = null
  private lastMeteredAt: number | null = null
  private graceEndsAt: number | null = null
  private shouldTerminateAt: number | null = null

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async initialize() {
    if (this.initialized) return

    const storedSessions = await this.state.storage.get<[string, Session][]>("sessions")
    const storedParticipants = await this.state.storage.get<[string, Participant][]>("participants")
    const storedBudgetId = await this.state.storage.get<string>("budgetId")
    const storedBudgetKey = await this.state.storage.get<string>("budgetKey")
    const storedRoomId = await this.state.storage.get<string>("roomId")
    const storedMetering = await this.state.storage.get<{
      lastMeteredAt: number | null
      graceEndsAt: number | null
    }>("metering")

    if (storedSessions && Array.isArray(storedSessions)) {
      this.sessions = new Map(storedSessions)
      console.log(`[CallRoom] Loaded ${this.sessions.size} sessions from storage`)
    } else {
      console.log("[CallRoom] No stored sessions found")
    }

    if (storedParticipants && Array.isArray(storedParticipants)) {
      this.participants = new Map(
        storedParticipants.map(([participantId, participant]) => [
          participantId,
          {
            ...participant,
            participantSecret: participant.participantSecret || "",
          } satisfies Participant,
        ]),
      )
      console.log(`[CallRoom] Loaded ${this.participants.size} participants from storage`)
    } else {
      this.rebuildParticipantsFromSessions()
      console.log(`[CallRoom] Rebuilt ${this.participants.size} participants from sessions`)
    }

    if (storedBudgetId) {
      this.budgetId = storedBudgetId
      console.log(`[CallRoom] Loaded budgetId: ${storedBudgetId.slice(0, 8)}`)
    }
    if (storedBudgetKey) {
      this.budgetKey = storedBudgetKey
      console.log(`[CallRoom] Loaded budgetKey: ${storedBudgetKey}`)
    }
    if (storedRoomId) {
      this.roomId = storedRoomId
    }

    if (storedMetering) {
      this.lastMeteredAt = storedMetering.lastMeteredAt
      this.graceEndsAt = storedMetering.graceEndsAt
      console.log(`[CallRoom] Loaded metering state, lifecycle: ${this.getRoomLifecycle()}`)
    }

    // Resume metering if budget is bound
    if (this.budgetId && this.budgetKey) {
      this.startMetering()
    }
    this.initialized = true
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize()
    let didMutateState = this.pruneExpiredSessions()

    const url = new URL(request.url)
    const action = url.searchParams.get("action")

    // Capture worker base URL from incoming requests for callbacks
    if (!this.workerBaseUrl && url.host !== "do.internal") {
      this.workerBaseUrl = `${url.protocol}//${url.host}`
    }

    console.log(
      `[CallRoom] Received request: action=${action}, sessions=${this.sessions.size}, participants=${this.participants.size}`,
    )

    try {
      switch (action) {
        case "authorizeParticipant":
          return await this.authorizeParticipant(request)
        case "createSession":
          return await this.createSession(request)
        case "getSession":
          return this.getSession(request)
        case "roomExists":
          return this.roomExists()
        case "publishTracks":
          return await this.publishTracks(request)
        case "updateMediaState":
          return await this.updateMediaState(request)
        case "heartbeat":
          return await this.heartbeat(request)
        case "getRemoteTracks":
          return this.getRemoteTracks(request)
        case "leave":
          return await this.leave(request)
        case "terminateRoom":
          return await this.terminateRoom()
        case "getState":
          return this.getState()
        case "setBudgetId":
          return await this.setBudgetId(request)
        case "getBudgetId":
          return this.getBudgetId()
        case "getMeteringStatus":
          return this.handleGetMeteringStatus()
        case "handleChargeResult":
          return await this.handleChargeResultAction(request)
        default:
          console.error(`[CallRoom] Unknown action: ${action}`)
          return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          })
      }
    } catch (e) {
      console.error("[CallRoom] Error:", e)
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    } finally {
      if (didMutateState) {
        await this.persist()
      }
    }
  }

  private rebuildParticipantsFromSessions() {
    this.participants.clear()

    for (const session of this.sessions.values()) {
      const existing = this.participants.get(session.participantId)
      if (!existing) {
        this.participants.set(session.participantId, {
          participantId: session.participantId,
          participantSecret: "",
          activeSessionId: session.internalId,
          pendingSessionId: null,
          audioEnabled: true,
          videoEnabled: true,
          joinedAt: session.joinedAt,
          lastSeenAt: session.lastSeenAt,
        })
        continue
      }

      if (!existing.activeSessionId || session.joinedAt > existing.joinedAt) {
        existing.activeSessionId = session.internalId
        existing.joinedAt = session.joinedAt
      }
      existing.lastSeenAt = Math.max(existing.lastSeenAt, session.lastSeenAt)
    }
  }

  private resolveSession(internalId: string): SessionLookup {
    const session = this.sessions.get(internalId)
    if (!session) return { kind: "missing" }

    const lifecycle = this.getParticipantLifecycle(session.participantId)
    if (lifecycle.kind === "ended") return { kind: "missing" }

    if (
      lifecycle.activeSessionId === internalId ||
      (lifecycle.kind === "handoff_pending" && lifecycle.pendingSessionId === internalId)
    ) {
      return { kind: "ok", session, participant: lifecycle.participant }
    }

    return { kind: "replaced", session }
  }

  private sessionNotFoundResponse() {
    return new Response(JSON.stringify({ error: "Session not found", code: "SESSION_NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  private sessionReplacedResponse() {
    return new Response(JSON.stringify({ error: "Session replaced", code: "SESSION_REPLACED" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    })
  }

  private cleanupParticipantIfOrphaned(participantId: string) {
    const participant = this.participants.get(participantId)
    if (!participant) return

    const lifecycle = this.normalizeParticipantLifecycle(participant)
    if (lifecycle.kind === "ended") {
      this.participants.delete(participantId)
    }
  }

  private normalizeParticipantLifecycle(participant: Participant): ParticipantLifecycle {
    const activeSessionId =
      participant.activeSessionId && this.sessions.has(participant.activeSessionId)
        ? participant.activeSessionId
        : null
    const pendingSessionId =
      participant.pendingSessionId && this.sessions.has(participant.pendingSessionId)
        ? participant.pendingSessionId
        : null

    participant.activeSessionId = activeSessionId
    participant.pendingSessionId = pendingSessionId

    if (activeSessionId && pendingSessionId) {
      return {
        kind: "handoff_pending",
        participant,
        activeSessionId,
        pendingSessionId,
      }
    }

    if (activeSessionId) {
      return {
        kind: "active",
        participant,
        activeSessionId,
      }
    }

    if (pendingSessionId) {
      participant.activeSessionId = pendingSessionId
      participant.pendingSessionId = null

      return {
        kind: "active",
        participant,
        activeSessionId: pendingSessionId,
      }
    }

    return { kind: "ended" }
  }

  private getParticipantLifecycle(participantId: string): ParticipantLifecycle {
    const participant = this.participants.get(participantId)
    if (!participant) return { kind: "ended" }
    return this.normalizeParticipantLifecycle(participant)
  }

  private countLiveSessions() {
    let count = 0

    for (const participant of this.participants.values()) {
      const lifecycle = this.normalizeParticipantLifecycle(participant)
      if (lifecycle.kind === "ended") continue
      count += lifecycle.kind === "handoff_pending" ? 2 : 1
    }

    return count
  }

  private getRoomLifecycle(now = Date.now()): RoomLifecycle {
    const hasLiveParticipants = this.participants.size > 0

    if (!hasLiveParticipants) {
      return this.budgetId || this.roomId ? "terminated" : "inactive"
    }

    if (this.graceEndsAt && now < this.graceEndsAt) {
      return "in_grace"
    }

    return "active"
  }

  private async createSession(request: Request): Promise<Response> {
    const { internalId, participantId, participantSecret, cfSessionId } =
      (await request.json()) as {
        internalId: string
        participantId: string
        participantSecret?: string
        cfSessionId: string
      }

    const now = Date.now()
    const existingParticipant = this.participants.get(participantId)
    if (
      existingParticipant &&
      existingParticipant.participantSecret &&
      existingParticipant.participantSecret !== participantSecret
    ) {
      return new Response(
        JSON.stringify({
          error: "Participant authentication failed",
          code: "PARTICIPANT_AUTH_FAILED",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    const existingLifecycle = existingParticipant
      ? this.normalizeParticipantLifecycle(existingParticipant)
      : { kind: "ended" as const }
    const previousActiveSessionId =
      existingLifecycle.kind === "ended" ? null : existingLifecycle.activeSessionId

    const resolvedParticipantSecret =
      existingParticipant?.participantSecret || participantSecret || crypto.randomUUID()

    const session: Session = {
      internalId,
      participantId,
      cfSessionId,
      publishedTracks: [],
      joinedAt: now,
      lastSeenAt: now,
    }

    this.sessions.set(internalId, session)
    this.participants.set(participantId, {
      participantId,
      participantSecret: resolvedParticipantSecret,
      activeSessionId: previousActiveSessionId ? previousActiveSessionId : internalId,
      pendingSessionId:
        previousActiveSessionId && previousActiveSessionId !== internalId ? internalId : null,
      audioEnabled: existingParticipant?.audioEnabled ?? true,
      videoEnabled: existingParticipant?.videoEnabled ?? true,
      joinedAt: existingParticipant?.joinedAt ?? now,
      lastSeenAt: now,
    })

    await this.persist()

    console.log(
      `[CallRoom] Session created: ${internalId.slice(0, 8)}, participant=${participantId.slice(0, 8)}, total sessions: ${this.sessions.size}, total participants: ${this.participants.size}`,
    )

    return new Response(
      JSON.stringify({
        success: true,
        sessionCount: this.sessions.size,
        participantCount: this.participants.size,
        participantId,
        participantSecret: resolvedParticipantSecret,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  private async authorizeParticipant(request: Request): Promise<Response> {
    // Check if in grace period - reject new joins
    if (this.shouldRejectNewJoins()) {
      return new Response(
        JSON.stringify({
          error: "Service budget exhausted - new joins temporarily disabled",
          code: "SERVICE_BUDGET_EXHAUSTED",
          graceEndsAt: this.graceEndsAt,
        }),
        {
          status: 402,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    const { participantId, participantSecret, confirmTakeover } = (await request.json()) as {
      participantId: string
      participantSecret?: string
      confirmTakeover?: boolean
    }

    const resolvedParticipantId = participantId
    const existingParticipant = this.participants.get(resolvedParticipantId)
    if (
      existingParticipant &&
      existingParticipant.participantSecret &&
      existingParticipant.participantSecret !== participantSecret
    ) {
      return new Response(
        JSON.stringify({
          error: "Participant authentication failed",
          code: "PARTICIPANT_AUTH_FAILED",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    const existingLifecycle = existingParticipant
      ? this.normalizeParticipantLifecycle(existingParticipant)
      : { kind: "ended" as const }

    if (existingLifecycle.kind !== "ended" && !confirmTakeover) {
      return new Response(
        JSON.stringify({
          error: "Participant takeover confirmation required",
          code: "PARTICIPANT_TAKEOVER_REQUIRED",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    const resolvedParticipantSecret =
      existingParticipant?.participantSecret || participantSecret || crypto.randomUUID()

    return new Response(
      JSON.stringify({
        participantId: resolvedParticipantId,
        participantSecret: resolvedParticipantSecret,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  private roomExists(): Response {
    const lifecycle = this.getRoomLifecycle()
    return new Response(
      JSON.stringify({
        roomCreated: lifecycle !== "inactive" && lifecycle !== "terminated",
        lifecycle,
        sessionCount: this.countLiveSessions(),
        participantCount: this.participants.size,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  private getSession(request: Request): Response {
    const url = new URL(request.url)
    const internalId = url.searchParams.get("internalId")

    if (!internalId) {
      return new Response(JSON.stringify({ error: "Missing internalId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const lookup = this.resolveSession(internalId)
    if (lookup.kind === "missing") return this.sessionNotFoundResponse()
    if (lookup.kind === "replaced") return this.sessionReplacedResponse()

    return new Response(
      JSON.stringify({
        internalId: lookup.session.internalId,
        cfSessionId: lookup.session.cfSessionId,
        trackCount: lookup.session.publishedTracks.length,
        lastSeenAt: lookup.session.lastSeenAt,
        participantId: lookup.participant.participantId,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  private async publishTracks(request: Request): Promise<Response> {
    const { internalId, tracks } = (await request.json()) as {
      internalId: string
      tracks: Array<{ trackName: string; mid: string }>
    }

    const lookup = this.resolveSession(internalId)
    if (lookup.kind === "missing") return this.sessionNotFoundResponse()
    if (lookup.kind === "replaced") return this.sessionReplacedResponse()

    lookup.session.publishedTracks = tracks
    lookup.session.lastSeenAt = Date.now()
    lookup.participant.lastSeenAt = lookup.session.lastSeenAt

    const participantLifecycle = this.normalizeParticipantLifecycle(lookup.participant)
    if (
      participantLifecycle.kind === "handoff_pending" &&
      participantLifecycle.pendingSessionId === internalId
    ) {
      const previousActiveSessionId = participantLifecycle.activeSessionId
      lookup.participant.activeSessionId = internalId
      lookup.participant.pendingSessionId = null

      if (previousActiveSessionId && previousActiveSessionId !== internalId) {
        console.log(
          `[CallRoom] Completed participant handoff: ${previousActiveSessionId.slice(0, 8)} -> ${internalId.slice(0, 8)}`,
        )
      }
    }

    await this.persist()

    console.log(
      `[CallRoom] Tracks published for ${internalId.slice(0, 8)}: ${tracks.length} tracks`,
    )

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  private async updateMediaState(request: Request): Promise<Response> {
    const { internalId, audioEnabled, videoEnabled } = (await request.json()) as {
      internalId: string
      audioEnabled?: boolean
      videoEnabled?: boolean
    }

    const lookup = this.resolveSession(internalId)
    if (lookup.kind === "missing") return this.sessionNotFoundResponse()
    if (lookup.kind === "replaced") return this.sessionReplacedResponse()

    if (typeof audioEnabled === "boolean") {
      lookup.participant.audioEnabled = audioEnabled
    }

    if (typeof videoEnabled === "boolean") {
      lookup.participant.videoEnabled = videoEnabled
    }

    lookup.session.lastSeenAt = Date.now()
    lookup.participant.lastSeenAt = lookup.session.lastSeenAt

    await this.persist()

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  private async heartbeat(request: Request): Promise<Response> {
    const { internalId } = (await request.json()) as { internalId: string }

    const lookup = this.resolveSession(internalId)
    if (lookup.kind === "missing") return this.sessionNotFoundResponse()
    if (lookup.kind === "replaced") return this.sessionReplacedResponse()

    const now = Date.now()
    lookup.session.lastSeenAt = now
    lookup.participant.lastSeenAt = now
    await this.persist()

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  private getRemoteTracks(request: Request): Response {
    const url = new URL(request.url)
    const selfId = url.searchParams.get("selfId")

    if (!selfId) {
      return new Response(JSON.stringify({ error: "Missing selfId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const selfLookup = this.resolveSession(selfId)
    if (selfLookup.kind === "missing") return this.sessionNotFoundResponse()
    if (selfLookup.kind === "replaced") return this.sessionReplacedResponse()

    const remoteTracks: Array<{
      trackName: string
      sessionId: string
      mid: string
    }> = []
    const remoteParticipants: Array<{
      sessionId: string
      audioEnabled: boolean
      videoEnabled: boolean
    }> = []

    for (const participant of this.participants.values()) {
      if (participant.participantId === selfLookup.participant.participantId) continue

      const lifecycle = this.normalizeParticipantLifecycle(participant)
      if (lifecycle.kind === "ended") continue

      const activeSession = this.sessions.get(lifecycle.activeSessionId)
      if (!activeSession) continue

      remoteParticipants.push({
        sessionId: activeSession.cfSessionId,
        audioEnabled: participant.audioEnabled,
        videoEnabled: participant.videoEnabled,
      })

      for (const track of activeSession.publishedTracks) {
        remoteTracks.push({
          trackName: track.trackName,
          sessionId: activeSession.cfSessionId,
          mid: track.mid,
        })
      }
    }

    console.log(
      `[CallRoom] Discover: self=${selfId.slice(0, 8)}, found ${remoteTracks.length} remote tracks from ${remoteParticipants.length} other participants`,
    )

    return new Response(
      JSON.stringify({
        tracks: remoteTracks,
        remoteParticipantCount: remoteParticipants.length,
        remoteParticipants,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  private async leave(request: Request): Promise<Response> {
    const { internalId } = (await request.json()) as { internalId: string }

    const session = this.sessions.get(internalId)
    if (!session) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const participant = this.participants.get(session.participantId)
    this.sessions.delete(internalId)

    if (participant) {
      const lifecycle = this.normalizeParticipantLifecycle(participant)
      if (lifecycle.kind !== "ended" && lifecycle.activeSessionId === internalId) {
        participant.activeSessionId =
          lifecycle.kind === "handoff_pending" ? lifecycle.pendingSessionId : null
        participant.pendingSessionId = null
      } else if (
        lifecycle.kind === "handoff_pending" &&
        lifecycle.pendingSessionId === internalId
      ) {
        participant.pendingSessionId = null
      }

      this.cleanupParticipantIfOrphaned(participant.participantId)
    }

    await this.persist()
    console.log(
      `[CallRoom] Session left: ${internalId.slice(0, 8)}, remaining sessions: ${this.sessions.size}, remaining participants: ${this.participants.size}`,
    )

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  private async terminateRoom(): Promise<Response> {
    this.sessions.clear()
    this.participants.clear()
    this.stopMetering()
    await this.persist()
    console.log("[CallRoom] Room terminated")

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  private getState(): Response {
    const lifecycle = this.getRoomLifecycle()
    return new Response(
      JSON.stringify({
        lifecycle,
        sessionCount: this.sessions.size,
        participantCount: this.participants.size,
        participants: Array.from(this.participants.values()).map((participant) => ({
          lifecycle: this.normalizeParticipantLifecycle(participant).kind,
          participantId: participant.participantId.slice(0, 8),
          participantSecret: "[redacted]",
          activeSessionId: participant.activeSessionId?.slice(0, 8) ?? null,
          pendingSessionId: participant.pendingSessionId?.slice(0, 8) ?? null,
          audioEnabled: participant.audioEnabled,
          videoEnabled: participant.videoEnabled,
          lastSeenAt: participant.lastSeenAt,
        })),
        sessions: Array.from(this.sessions.values()).map((session) => ({
          id: session.internalId.slice(0, 8),
          participantId: session.participantId.slice(0, 8),
          lastSeenAt: session.lastSeenAt,
          trackCount: session.publishedTracks.length,
        })),
        budgetId: this.budgetId,
        budgetKey: this.budgetKey,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  private pruneExpiredSessions(): boolean {
    const now = Date.now()
    let removed = false

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastSeenAt <= CallRoom.SESSION_TTL_MS) continue

      this.sessions.delete(sessionId)
      removed = true

      const participant = this.participants.get(session.participantId)
      if (participant) {
        const lifecycle = this.normalizeParticipantLifecycle(participant)
        if (lifecycle.kind !== "ended" && lifecycle.activeSessionId === sessionId) {
          participant.activeSessionId =
            lifecycle.kind === "handoff_pending" ? lifecycle.pendingSessionId : null
          participant.pendingSessionId = null
        } else if (
          lifecycle.kind === "handoff_pending" &&
          lifecycle.pendingSessionId === sessionId
        ) {
          participant.pendingSessionId = null
        }
        this.cleanupParticipantIfOrphaned(participant.participantId)
      }

      console.log(
        `[CallRoom] Session expired: ${sessionId.slice(0, 8)}, remaining sessions: ${this.sessions.size}, remaining participants: ${this.participants.size}`,
      )
    }

    return removed
  }

  private async persist() {
    const sessionEntries = Array.from(this.sessions.entries())
    const participantEntries = Array.from(this.participants.entries())
    console.log(
      `[CallRoom] Persisting ${sessionEntries.length} sessions and ${participantEntries.length} participants`,
    )
    await this.state.storage.put("sessions", sessionEntries)
    await this.state.storage.put("participants", participantEntries)
    if (this.budgetId) {
      await this.state.storage.put("budgetId", this.budgetId)
    }
    if (this.budgetKey) {
      await this.state.storage.put("budgetKey", this.budgetKey)
    }
    // Persist metering state
    await this.state.storage.put("metering", {
      lastMeteredAt: this.lastMeteredAt,
      graceEndsAt: this.graceEndsAt,
    })
  }

  private async setBudgetId(request: Request): Promise<Response> {
    const body = (await request.json()) as { budgetId: string; budgetKey: string; roomId: string }
    if (!body.budgetId) {
      return new Response(JSON.stringify({ error: "budgetId required" }), { status: 400 })
    }
    if (!body.budgetKey) {
      return new Response(JSON.stringify({ error: "budgetKey required" }), { status: 400 })
    }
    if (!body.roomId) {
      return new Response(JSON.stringify({ error: "roomId required" }), { status: 400 })
    }
    this.budgetId = body.budgetId
    this.budgetKey = body.budgetKey
    this.roomId = body.roomId
    await this.state.storage.put("budgetId", body.budgetId)
    await this.state.storage.put("budgetKey", body.budgetKey)
    await this.state.storage.put("roomId", body.roomId)
    // Start metering when budget is bound
    this.startMetering()
    return new Response(
      JSON.stringify({ ok: true, budgetId: body.budgetId, budgetKey: body.budgetKey }),
      { status: 200 },
    )
  }

  private getBudgetId(): Response {
    return new Response(JSON.stringify({ budgetId: this.budgetId, budgetKey: this.budgetKey }), {
      status: 200,
    })
  }

  // ==================== Metering ====================

  private startMetering() {
    if (this.meteringTimer) return // Already running

    console.log("[CallRoom] Starting metering timer")
    void this.performMeteringTick() // Immediate first tick
    this.meteringTimer = setInterval(() => {
      void this.performMeteringTick()
    }, METERING_TICK_MS) as unknown as number
  }

  private stopMetering() {
    if (this.meteringTimer) {
      clearInterval(this.meteringTimer)
      this.meteringTimer = null
      console.log("[CallRoom] Stopped metering timer")
    }
  }

  private async performMeteringTick() {
    if (!this.budgetId || !this.budgetKey) return

    const now = Date.now()
    const elapsedSeconds = this.lastMeteredAt ? (now - this.lastMeteredAt) / 1000 : 60
    this.lastMeteredAt = now

    // Check if grace period has expired
    if (this.graceEndsAt && now > this.graceEndsAt) {
      console.log("[CallRoom] Grace period expired, terminating room")
      await this.terminateRoom()
      return
    }

    // Estimate usage
    const estimatedBytes = this.estimateUsage(elapsedSeconds)
    if (estimatedBytes <= 0) {
      console.log("[CallRoom] No active media, skipping charge")
      return
    }

    console.log(`[CallRoom] Metering tick: ${estimatedBytes} bytes estimated`)

    // Call worker to charge the budget
    await this.chargeBudget(estimatedBytes)
  }

  /**
   * Call worker to charge the budget for estimated usage
   */
  private async chargeBudget(bytes: number): Promise<void> {
    if (!this.roomId || !this.budgetId || !this.budgetKey || !this.workerBaseUrl) return

    try {
      // Call the worker's metering endpoint to charge the budget
      const response = await fetch(`${this.workerBaseUrl}/api/rooms/${this.roomId}/meter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bytes, budgetId: this.budgetId, budgetKey: this.budgetKey }),
      })

      if (response.status === 402) {
        const data = (await response.json()) as {
          lifecycle?: "in_grace" | "exhausted"
          graceEndsAt: number | null
          graceClaimedByRoomId?: string | null
        }

        if (data.lifecycle === "in_grace") {
          this.graceEndsAt = data.graceEndsAt
          console.log(
            `[CallRoom] Budget exhausted, entered grace until ${new Date(data.graceEndsAt ?? Date.now()).toISOString()}`,
          )
          await this.persist()
        } else {
          console.log(
            `[CallRoom] Budget grace already claimed by ${data.graceClaimedByRoomId ?? "another room"}, terminating immediately`,
          )
          await this.terminateRoom()
        }
      } else if (response.ok) {
        const data = (await response.json()) as {
          lifecycle?: RoomLifecycle
          graceEndsAt?: number
          remainingBytes: number
        }
        if (data.lifecycle === "in_grace") {
          this.graceEndsAt = data.graceEndsAt || null
        }
        console.log(`[CallRoom] Charged ${bytes} bytes, remaining: ${data.remainingBytes}`)
      } else {
        console.error(`[CallRoom] Charge failed: ${response.status}`)
      }
    } catch (error) {
      console.error(`[CallRoom] Charge error:`, error)
      // Fail open - we'll retry on next tick
    }
  }

  /**
   * Estimate usage based on published tracks and subscriber count
   */
  private estimateUsage(elapsedSeconds: number): number {
    let totalBytes = 0

    // Count active sessions (subscribers)
    const activeSessions = Array.from(this.sessions.values()).filter(
      (s) => Date.now() - s.lastSeenAt < CallRoom.SESSION_TTL_MS,
    )
    const subscriberCount = activeSessions.length

    if (subscriberCount === 0) return 0

    // For each session, estimate egress based on published tracks
    for (const session of activeSessions) {
      for (const track of session.publishedTracks) {
        const bitrate = TRACK_BITRATE_ESTIMATES[track.trackType || "video"]
        // Egress = bitrate × elapsed time × (subscribers - 1 for the publisher)
        // Each subscriber receives the track except the publisher
        const egressSubscribers = Math.max(0, subscriberCount - 1)
        totalBytes += bitrate * elapsedSeconds * egressSubscribers
      }
    }

    return Math.round(totalBytes)
  }

  /**
   * Get current metering and grace status
   */
  getMeteringStatus(): {
    lifecycle: RoomLifecycle
    budgetId: string | null
    budgetKey: string | null
    lastMeteredAt: number | null
    graceEndsAt: number | null
    graceRemainingMs: number
    shouldTerminate: boolean
  } {
    const now = Date.now()
    const shouldTerminate = this.shouldTerminateAt ? now > this.shouldTerminateAt : false
    const lifecycle = this.getRoomLifecycle(now)

    return {
      lifecycle,
      budgetId: this.budgetId,
      budgetKey: this.budgetKey,
      lastMeteredAt: this.lastMeteredAt,
      graceEndsAt: this.graceEndsAt,
      graceRemainingMs:
        lifecycle === "in_grace" && this.graceEndsAt ? Math.max(0, this.graceEndsAt - now) : 0,
      shouldTerminate,
    }
  }

  /**
   * Enter grace period (called when budget is exhausted)
   */
  enterGrace(): void {
    if (this.getRoomLifecycle() === "in_grace") return

    this.graceEndsAt = Date.now() + GRACE_PERIOD_MS
    console.log(
      `[CallRoom] Entering grace period until ${new Date(this.graceEndsAt).toISOString()}`,
    )
  }

  /**
   * Check if new joins should be rejected (during grace)
   */
  shouldRejectNewJoins(): boolean {
    return this.getRoomLifecycle() === "in_grace"
  }

  /**
   * Handle budget charge response
   */
  async handleChargeResult(result: {
    ok: boolean
    lifecycle?: "uninitialized" | "active" | "in_grace" | "exhausted"
    graceEndsAt?: number | null
    graceClaimedByRoomId?: string | null
  }): Promise<void> {
    if (!result.ok) {
      if (result.lifecycle === "in_grace") {
        this.enterGrace()
        this.graceEndsAt = result.graceEndsAt || this.graceEndsAt
      } else {
        await this.terminateRoom()
        return
      }
    } else if (result.lifecycle === "in_grace") {
      // Already in grace from budget side
      this.graceEndsAt = result.graceEndsAt || null
    } else if (result.lifecycle === "active") {
      this.graceEndsAt = null
    }
    await this.persist()
  }

  /**
   * HTTP action handler for charge results
   */
  private async handleChargeResultAction(request: Request): Promise<Response> {
    const result = (await request.json()) as {
      ok: boolean
      lifecycle?: "uninitialized" | "active" | "in_grace" | "exhausted"
      graceEndsAt?: number
    }
    await this.handleChargeResult(result)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  /**
   * HTTP action handler for metering status
   */
  private handleGetMeteringStatus(): Response {
    const status = this.getMeteringStatus()
    return new Response(JSON.stringify(status), { status: 200 })
  }
}
