// Durable Object for managing call state across worker instances
// Enables cross-device session discovery and coordination

export interface Session {
  internalId: string
  cfSessionId: string
  publishedTracks: Array<{ trackName: string; mid: string }>
  joinedAt: number
}

export interface CallState {
  sessions: Map<string, Session>
}

export class CallRoom {
  private state: DurableObjectState
  private sessions: Map<string, Session> = new Map()
  private initialized: boolean = false

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async initialize() {
    if (this.initialized) return
    
    // Load persisted state
    const stored = await this.state.storage.get<[string, Session][]>('sessions')
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
    
    const url = new URL(request.url)
    const action = url.searchParams.get('action')
    
    console.log(`[CallRoom] Received request: action=${action}, sessions=${this.sessions.size}`)
    
    try {
      switch (action) {
        case 'createSession':
          return await this.createSession(request)
        case 'getSession':
          return await this.getSession(request)
        case 'publishTracks':
          return await this.publishTracks(request)
        case 'getRemoteTracks':
          return await this.getRemoteTracks(request)
        case 'leave':
          return await this.leave(request)
        case 'getState':
          return this.getState()
        default:
          console.error(`[CallRoom] Unknown action: ${action}`)
          return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
    } catch (e) {
      console.error('[CallRoom] Error:', e)
      return new Response(JSON.stringify({ error: String(e) }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  private async createSession(request: Request): Promise<Response> {
    const { internalId, cfSessionId } = await request.json() as {
      internalId: string
      cfSessionId: string
    }
    
    const session: Session = {
      internalId,
      cfSessionId,
      publishedTracks: [],
      joinedAt: Date.now()
    }
    
    this.sessions.set(internalId, session)
    await this.persist()
    
    console.log(`[CallRoom] Session created: ${internalId.slice(0, 8)}, total sessions: ${this.sessions.size}`)
    
    return new Response(JSON.stringify({ success: true, sessionCount: this.sessions.size }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private async getSession(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const internalId = url.searchParams.get('internalId')
    
    if (!internalId) {
      return new Response(JSON.stringify({ error: 'Missing internalId' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    const session = this.sessions.get(internalId)
    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    return new Response(JSON.stringify({
      internalId: session.internalId,
      cfSessionId: session.cfSessionId,
      trackCount: session.publishedTracks.length
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private async publishTracks(request: Request): Promise<Response> {
    const { internalId, tracks } = await request.json() as {
      internalId: string
      tracks: Array<{ trackName: string; mid: string }>
    }
    
    const session = this.sessions.get(internalId)
    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    session.publishedTracks = tracks
    await this.persist()
    
    console.log(`[CallRoom] Tracks published for ${internalId.slice(0, 8)}: ${tracks.length} tracks`)
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private async getRemoteTracks(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const selfId = url.searchParams.get('selfId')
    
    if (!selfId) {
      return new Response(JSON.stringify({ error: 'Missing selfId' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    const remoteTracks: Array<{
      trackName: string
      sessionId: string
      mid: string
    }> = []
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (sessionId === selfId) continue
      
      for (const track of session.publishedTracks) {
        remoteTracks.push({
          trackName: track.trackName,
          sessionId: session.cfSessionId,
          mid: track.mid
        })
      }
    }
    
    console.log(`[CallRoom] Discover: self=${selfId.slice(0, 8)}, found ${remoteTracks.length} remote tracks from ${this.sessions.size - 1} other sessions`)
    
    return new Response(JSON.stringify({ tracks: remoteTracks }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private async leave(request: Request): Promise<Response> {
    const { internalId } = await request.json() as { internalId: string }
    
    const existed = this.sessions.delete(internalId)
    if (existed) {
      await this.persist()
      console.log(`[CallRoom] Session left: ${internalId.slice(0, 8)}, remaining: ${this.sessions.size}`)
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private getState(): Response {
    return new Response(JSON.stringify({
      sessionCount: this.sessions.size,
      sessions: Array.from(this.sessions.keys()).map(id => id.slice(0, 8))
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private async persist() {
    // Persist to storage
    const entries = Array.from(this.sessions.entries())
    console.log(`[CallRoom] Persisting ${entries.length} sessions`)
    await this.state.storage.put('sessions', entries)
  }
}
