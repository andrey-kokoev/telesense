// Durable Object for managing call state across worker instances
// Enables cross-device session discovery and coordination

export interface Session {
  internalId: string
  cfSessionId: string
  publishedTracks: Array<{ trackName: string; mid: string }>
  joinedAt: number
  lastSeenAt: number
  audioEnabled: boolean
  videoEnabled: boolean
}

export interface CallState {
  sessions: Map<string, Session>
}

export class CallRoom {
  private static readonly SESSION_TTL_MS = 15000
  private state: DurableObjectState
  private sessions: Map<string, Session> = new Map()
  private initialized: boolean = false

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async initialize() {
    if (this.initialized) return

    // Load persisted state
    const stored = await this.state.storage.get<[string, Session][]>("sessions")

    if (stored && Array.isArray(stored)) {
      this.sessions = new Map(stored)
      console.log(`[CallRoom] Loaded ${this.sessions.size} sessions from storage`)
    } else {
      console.log(`[CallRoom] No stored sessions found`)
    }
    this.initialized = true
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize()
    let didMutateSessions = this.pruneExpiredSessions()

    const url = new URL(request.url)
    const action = url.searchParams.get("action")

    console.log(`[CallRoom] Received request: action=${action}, sessions=${this.sessions.size}`)

    try {
      switch (action) {
        case "createSession":
          return await this.createSession(request)
        case "getSession":
          return await this.getSession(request)
        case "roomExists":
          return this.roomExists()
        case "publishTracks":
          return await this.publishTracks(request)
        case "updateMediaState":
          return await this.updateMediaState(request)
        case "heartbeat":
          return await this.heartbeat(request)
        case "getRemoteTracks":
          return await this.getRemoteTracks(request)
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
      if (didMutateSessions) {
        await this.persist()
      }
    }
  }

  private async createSession(request: Request): Promise<Response> {
    const { internalId, cfSessionId } = (await request.json()) as {
      internalId: string
      cfSessionId: string
    }

    const session: Session = {
      internalId,
      cfSessionId,
      publishedTracks: [],
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      audioEnabled: true,
      videoEnabled: true,
    }

    this.sessions.set(internalId, session)
    await this.persist()

    console.log(
      `[CallRoom] Session created: ${internalId.slice(0, 8)}, total sessions: ${this.sessions.size}`,
    )

    return new Response(JSON.stringify({ success: true, sessionCount: this.sessions.size }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  private roomExists(): Response {
    return new Response(
      JSON.stringify({
        roomCreated: this.sessions.size > 0,
        sessionCount: this.sessions.size,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  private async getSession(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const internalId = url.searchParams.get("internalId")

    if (!internalId) {
      return new Response(JSON.stringify({ error: "Missing internalId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const session = this.sessions.get(internalId)
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(
      JSON.stringify({
        internalId: session.internalId,
        cfSessionId: session.cfSessionId,
        trackCount: session.publishedTracks.length,
        lastSeenAt: session.lastSeenAt,
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

    const session = this.sessions.get(internalId)
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    session.publishedTracks = tracks
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

    const session = this.sessions.get(internalId)
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (typeof audioEnabled === "boolean") {
      session.audioEnabled = audioEnabled
    }

    if (typeof videoEnabled === "boolean") {
      session.videoEnabled = videoEnabled
    }

    await this.persist()

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  private async heartbeat(request: Request): Promise<Response> {
    const { internalId } = (await request.json()) as { internalId: string }

    const session = this.sessions.get(internalId)
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    session.lastSeenAt = Date.now()
    await this.persist()

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  private async getRemoteTracks(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const selfId = url.searchParams.get("selfId")

    if (!selfId) {
      return new Response(JSON.stringify({ error: "Missing selfId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

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
    let remoteParticipantCount = 0

    for (const [sessionId, session] of this.sessions.entries()) {
      if (sessionId === selfId) continue
      remoteParticipantCount++
      remoteParticipants.push({
        sessionId: session.cfSessionId,
        audioEnabled: session.audioEnabled,
        videoEnabled: session.videoEnabled,
      })

      for (const track of session.publishedTracks) {
        remoteTracks.push({
          trackName: track.trackName,
          sessionId: session.cfSessionId,
          mid: track.mid,
        })
      }
    }

    console.log(
      `[CallRoom] Discover: self=${selfId.slice(0, 8)}, found ${remoteTracks.length} remote tracks from ${this.sessions.size - 1} other sessions`,
    )

    return new Response(
      JSON.stringify({ tracks: remoteTracks, remoteParticipantCount, remoteParticipants }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  }

  private async leave(request: Request): Promise<Response> {
    const { internalId } = (await request.json()) as { internalId: string }

    const existed = this.sessions.delete(internalId)
    if (existed) {
      await this.persist()
      console.log(
        `[CallRoom] Session left: ${internalId.slice(0, 8)}, remaining: ${this.sessions.size}`,
      )
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  private async terminateRoom(): Promise<Response> {
    this.sessions.clear()
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
        sessions: Array.from(this.sessions.values()).map((session) => ({
          id: session.internalId.slice(0, 8),
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
      if (now - session.lastSeenAt > CallRoom.SESSION_TTL_MS) {
        this.sessions.delete(sessionId)
        removed = true
        console.log(
          `[CallRoom] Session expired: ${sessionId.slice(0, 8)}, remaining: ${this.sessions.size}`,
        )
      }
    }

    return removed
  }

  private async persist() {
    // Persist to storage
    const entries = Array.from(this.sessions.entries())
    console.log(`[CallRoom] Persisting ${entries.length} sessions`)
    await this.state.storage.put("sessions", entries)
  }
}
