# Telesense

**Status: `full 1:1 call works` (protocol verified via Echo Demo 2026-03-18)**

Raw Cloudflare Realtime SFU implementation with verified protocol from Echo Demo capture (2026-03-18).

## Current State

- ✅ Documentation: Protocol wire contract ([`docs/90-references/wire-format.md`](./docs/90-references/wire-format.md))
- ✅ Documentation: Open questions ([`docs/90-references/open-questions.md`](./docs/90-references/open-questions.md))
- ✅ Implementation: Backend Worker with verified endpoints
- ✅ Implementation: Browser client with full 1:1 flow
- ✅ Testing: Two-tab video call **verified working**

## Verified Protocol (Echo Demo 2026-03-18)

| Endpoint | Status | Finding |
|----------|--------|---------|
| `POST /sessions/new` | ✅ | Empty body, returns `{sessionId}` |
| `POST /tracks/new` (push) | ✅ | `location: "local"` returns Answer |
| `POST /tracks/new` (pull) | ✅ | `location: "remote"` returns **Offer** ⭐ |
| `PUT /renegotiate` | ✅ | Send Answer, receive `{}` |

**Critical Discovery (Q8 Resolved)**: Remote subscription uses `POST /tracks/new` with `location: "remote"` to request an Offer from Cloudflare. This is an **orchestration/pull model** — not push, not WebSocket.

## Setup

```bash
# Install dependencies
pnpm install

# Setup credentials
cp .dev.vars.example .dev.vars
# Edit .dev.vars and add your REALTIME_APP_SECRET
# Edit wrangler.toml and set REALTIME_APP_ID

# Run local dev (worker + vite)
pnpm dev
```

### Prerequisites

1. Cloudflare account with Realtime (Calls) enabled: https://dash.cloudflare.com/?to=/:account/calls
2. Create a Calls app, copy:
   - **App ID** → `wrangler.toml` → `REALTIME_APP_ID`
   - **App Token** → `.dev.vars` → `REALTIME_APP_SECRET`

## Development Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev servers (Vite + Wrangler) with process management |
| `pnpm dev:debug` | Start with verbose Cloudflare API logging |
| `pnpm health` | Quick health check of running services |
| `pnpm test` | **Run E2E tests** (automated 1:1 call test) |
| `pnpm test:ui` | Run E2E tests with interactive UI |
| `pnpm test:debug` | Run E2E tests in debug mode |
| `pnpm test:call` | Reminder for manual 1:1 call test |
| `pnpm build` | Build for production |
| `pnpm deploy` | Deploy to Cloudflare Workers |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint` | Alias for typecheck |
| `pnpm check` | Run all validation checks |
| `pnpm clean` | Remove build artifacts |
| `pnpm clean:all` | Remove build artifacts + node_modules |
| `pnpm logs` | View production logs |
| `make help` | Show all available make commands |

### Debug Mode

Enable verbose logging to see Cloudflare API requests/responses:

```bash
# Option 1: Use debug script
pnpm dev:debug

# Option 2: Set in .dev.vars
DEBUG=true
pnpm dev
```

### Quick Health Check

```bash
# While dev server is running
pnpm health
# → { "status": "healthy", "version": "0.0.1", ... }
```

### Or use `make`:
```bash
make dev      # Start development
make check    # Run type checks
make deploy   # Deploy to production
make setup    # Show setup instructions
```

## Usage

1. Open browser to `http://localhost:5173/?call=test`
2. Allow camera/mic permissions
3. Open second tab to same URL
4. Wait 2-5 seconds for remote video to appear

## Architecture

- **Single Worker (Hono)** + static client (Vite)
- **In-memory `Map` state** (dev-only)
- **No Durable Objects**, no Web Workers, no DB
- **Raw HTTPS Connection API** (no RealtimeKit)
- **Poll-based signaling** (WebSocket deferred to Phase 2)

### Flow

```
Tab A (Publisher)          Backend                Cloudflare               Tab B (Subscriber)
    |                         |                         |                         |
    +-- POST /session ------> | -- POST sessions/new -> |                         |
    |                         |                         |                         |
    +-- POST /publish-offer-> | -- POST tracks/new ---> | (location: "local")     |
    |                         | <-- Answer -------------|                         |
    |                         |                         |                         |
    |                         |                         |                         | +-- POST /session -->
    |                         |                         |                         | +-- POST /publish-offer->
    |                         |                         |                         |
    |                         | <-- tracks published ---|                         |
    |                         |                         |                         |
    +-- GET /discover ------> |                         |                         |
    |                         | finds Tab B's tracks    |                         |
    | <--- [track refs] ------|                         |                         |
    |                         |                         |                         |
    +-- POST /subscribe ----> | -- POST tracks/new ---> | (location: "remote")    |
    |                         | <-- Offer --------------|                         |
    |                         |                         |                         |
    +-- POST /complete -----> | -- PUT /renegotiate --> |                         |
    | (with Answer)           |                         |                         |
    |                         |                         |                         |
    <==== MEDIA FLOWS ======= Cloudflare SFU ========> |                         |
```

## Safety

- App Secret server-only (in Worker)
- Track refs include Cloudflare sessionId (not browser track.id)
- No browser MediaStreamTrack.id used for remote subscription

## Known Limitations

- In-memory state lost on Worker restart
- No automatic reconnection
- No TURN server (STUN only)
- Tracks/close not implemented (not verified in Echo Demo)

## Documentation

- [`docs/README.md`](./docs/README.md) — Documentation index
- [`docs/90-references/consensus-log.md`](./docs/90-references/consensus-log.md) — Architectural decisions (consensus-locked)
- [`docs/90-references/wire-format.md`](./docs/90-references/wire-format.md) — Verified API payloads
- [`docs/90-references/open-questions.md`](./docs/90-references/open-questions.md) — Q&A tracking (Q8 resolved)

## Warning

Experimental scaffolding for protocol verification. Production use requires:
- Durable Objects for state
- Proper error handling and reconnection
- TURN servers for NAT traversal
- Rate limiting and auth
