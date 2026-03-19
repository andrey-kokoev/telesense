# Task 20250318-001e: Minimal Repo Plumbing (Phase 4)

**Architectural Authority**: `docs/90-references/consensus-log.md`
**Constraint**: Do not deviate from locked decisions without updating the consensus log.

## Objective

Add only the required project configuration files. Keep dependencies minimal.

## Prerequisites

- [ ] Tasks 20250318-001a through 001d completed
- [ ] Worker scaffold exists
- [ ] Client scaffold exists

## Deliverables

### File: `package.json`

Required dependencies only:

```json
{
  "name": "telesense",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev & vite",
    "build": "vite build",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "hono": "^3.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "wrangler": "^3.x",
    "typescript": "^5.x"
  }
}
```

Preferred stack:

- `hono` — Worker framework
- `wrangler` — Cloudflare dev/deploy
- `vite` — Client bundler
- `typescript` — Type safety

Only add more if strictly needed.

### File: `wrangler.toml`

```toml
name = "telesense"
main = "src/worker/index.ts"
compatibility_date = "2024-01-01"

[vars]
REALTIME_APP_ID = "your-app-id-here"

# Secrets (set via wrangler secret put):
# REALTIME_APP_SECRET
```

Instructions for user:

```bash
# Set the secret
wrangler secret put REALTIME_APP_SECRET
```

### File: `vite.config.ts`

```typescript
import { defineConfig } from "vite"

export default defineConfig({
  root: ".",
  publicDir: "public",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
```

### File: `README.md`

Must include:

````markdown
# Telesense

**Status: [scaffold only | local publish works | full 1:1 call works]**

Raw Cloudflare Realtime SFU spike. 1:1 video call path [blocked/verified].

## Current State

- ✅ Documentation: Protocol wire contract
- ✅ Documentation: Open questions tracked
- ✅ Scaffold: Hono worker, Vite client, minimal HTML
- [❌|✅] Implementation: [blocked pending verification | partial | complete]

## Known Blockers

**Critical**: [Remote-subscribe offer delivery mechanism unverified | resolved]

- [Description of blocker]

See `docs/realtime-open-questions.md` for full list.

## Setup

```bash
npm install

# Set Cloudflare credentials
wrangler secret put REALTIME_APP_SECRET
# Edit wrangler.toml: REALTIME_APP_ID

# Run local dev (worker + vite)
npm run dev
```
````

## Next Step

1. [Current next action]

## Architecture

- Single Worker (Hono) + static client (Vite)
- In-memory `Map` state (dev-only)
- No Durable Objects, no Web Workers, no DB
- Raw HTTPS Connection API only (no RealtimeKit)

## Safety

- App Secret server-only
- Track IDs are Cloudflare-assigned only
- No browser MediaStreamTrack.id used for remote subscription

## Warning

This is raw-SFU experimental scaffolding, not production-ready.

```

### File: `.gitignore`

```

node_modules/
dist/
.env
.wrangler/
.dev.vars

```

## Acceptance Criteria

- [x] `package.json` with minimal dependencies (hono, vite, wrangler, typescript)
- [x] `wrangler.toml` with app ID configured
- [x] `vite.config.ts` with proxy to worker
- [x] `README.md` with status, setup steps, env vars
- [x] `.gitignore` for node_modules, dist, secrets

## Status

✅ **COMPLETED** — 2026-03-18

**Stack**: pnpm, Hono, Vite, Wrangler 4.x, TypeScript

## Final Verification

✅ Worker starts on :8787
✅ Vite starts on :5173
✅ Client loads at http://localhost:5173
✅ Full 1:1 video calls working

## Dependencies

- 20250318-001a-protocol-docs.md ✅

## Next Step

~~After verification: **20250318-001f-unlock-implementation.md**~~ → Completed
```
