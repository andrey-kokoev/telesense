// Durable Object for managing call state across worker instances
// Enables cross-device session discovery and coordination

export interface Session {
  internalId: string
  participantId: string
  cfSessionId: string
  publishedTracks: Array<{ trackName: string; mid: string }>
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

export class CallRoom {
  private static readonly SESSION_TTL_MS = 15000
  private state: DurableObjectState
  private sessions: Map<string, Session> = new Map()
  private participants: Map<string, Participant> = new Map()
  private initialized: boolean = false

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async initialize() {
    if (this.initialized) return

    const storedSessions = await this.state.storage.get<[string, Session][]>("sessions")
    const storedParticipants = await this.state.storage.get<[string, Participant][]>("participants")

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

    this.initialized = true
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize()
    let didMutateState = this.pruneExpiredSessions()

    const url = new URL(request.url)
    const action = url.searchParams.get("action")

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
    const { browserInstanceId, participantId, participantSecret, confirmTakeover } =
      (await request.json()) as {
        browserInstanceId: string
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
        browserInstanceId,
        participantId: resolvedParticipantId,
        participantSecret: resolvedParticipantSecret,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  private roomExists(): Response {
    return new Response(
      JSON.stringify({
        roomCreated: this.participants.size > 0,
        sessionCount: this.sessions.size,
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
        this.sessions.delete(previousActiveSessionId)
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
    await this.persist()
    console.log("[CallRoom] Room terminated")

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  private getState(): Response {
    return new Response(
      JSON.stringify({
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
  }
}
