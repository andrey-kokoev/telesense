# Telesense

**Status: `local publish works` → `full 1:1 call works` (protocol verified)**

Raw Cloudflare Realtime SFU implementation with verified protocol from Echo Demo capture (2026-03-18).

## Current State

- ✅ Documentation: Protocol wire contract (`docs/20260318-001-realtime-wire-contract.md`)
- ✅ Documentation: Open questions (`docs/20260318-002-realtime-open-questions.md`)
- ✅ Implementation: Backend Worker with verified endpoints
- ✅ Implementation: Browser client with full 1:1 flow
- 🔄 Testing: Two-tab video call (ready for verification)

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
# Install dependencies (npm or pnpm)
npm install
# or: pnpm install

# Set Cloudflare credentials
npx wrangler secret put REALTIME_APP_SECRET
# or: pnpm exec wrangler secret put REALTIME_APP_SECRET

# Edit wrangler.toml: REALTIME_APP_ID

# Run local dev (worker + vite)
npm run dev
# or: pnpm dev
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

## Protocol References

- `docs/20260318-000-codex-review-summary.md` — Architectural decisions
- `docs/20260318-001-realtime-wire-contract.md` — Verified payloads
- `docs/20260318-002-realtime-open-questions.md` — Q&A tracking

## Warning

Experimental scaffolding for protocol verification. Production use requires:
- Durable Objects for state
- Proper error handling and reconnection
- TURN servers for NAT traversal
- Rate limiting and auth
