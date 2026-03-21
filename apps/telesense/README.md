# telesence App

The main video-calling application.

## Structure

```text
src/
├── worker/
│   ├── index.ts                # Hono worker routes and Cloudflare API wiring
│   └── call-room.ts            # Durable Object for room/session/participant coordination
├── client/
│   ├── main.ts                 # Browser entry
│   ├── views/                  # Landing and call views
│   ├── components/             # UI components
│   └── composables/            # Client state and interaction logic
└── e2e/
    └── one-to-one-call.spec.ts # Playwright tests
```

## Scripts

```bash
vp dev                # Start dev servers (Worker + Vite)
vp run dev:debug      # With debug logging
vp build              # Build for production
vp run deploy         # Deploy to Cloudflare
vp test               # Run unit tests
vp run test           # Run E2E tests (Playwright)
vp run test:ui        # Interactive Playwright mode
vp run test:debug     # Playwright debug mode
vp run health         # Check health endpoint
```

## Configuration

Copy `.dev.vars.example` to `.dev.vars` and set:

- `CF_CALLS_SECRET` - From Cloudflare dashboard
- `SERVICE_ENTITLEMENT_TOKEN` - Shared secret for room creation (generate with `openssl rand -hex 32`)

Edit `wrangler.toml`:

- `REALTIME_APP_ID` - Your app ID

## Identity Model

- `browserInstanceId`
  - stable local browser identity stored in local storage
- `participantId`
  - deterministic room-scoped identity derived from `roomId + browserInstanceId`
- `participantSecret`
  - room-scoped credential proving participant ownership across reconnects
- `sessionId`
  - ephemeral live transport/session identifier

Multiple tabs are not supported for the same browser participant. Taking over from a second tab requires explicit confirmation.

## API Endpoints

- `GET /api/rooms/:roomId/status` - Check whether a room currently exists
- `POST /api/rooms/status` - Batch room availability checks, capped at 12 room IDs
- `POST /api/rooms/:roomId/session` - Create or reconnect a participant session
- `POST /api/rooms/:roomId/publish-offer` - Publish local tracks
- `POST /api/rooms/:roomId/subscribe-offer` - Request remote tracks
- `POST /api/rooms/:roomId/complete-subscribe` - Complete the subscribe handshake
- `GET /api/rooms/:roomId/discover-remote-tracks` - Discover other participants' active tracks
- `POST /api/rooms/:roomId/media-state` - Sync audio/video intent
- `POST /api/rooms/:roomId/heartbeat` - Keep the session alive
- `POST /api/rooms/:roomId/leave` - Clean up session presence
- `POST /api/rooms/:roomId/terminate` - End the room
- `GET /health` - Health check

## Important Error Semantics

- `401 SERVICE_ENTITLEMENT_REQUIRED`
  - room does not currently exist and a valid service entitlement token is required to create it
- `403 SERVICE_ENTITLEMENT_INVALID`
  - the provided service entitlement token is invalid or expired
- `404 ROOM_NOT_FOUND`
  - room does not currently exist and a token was provided but is not allowed to create it
- `403 PARTICIPANT_AUTH_FAILED`
  - the browser presented the wrong room-scoped participant credential
- `409 PARTICIPANT_TAKEOVER_REQUIRED`
  - the same browser participant is already active in another tab and takeover must be confirmed
- `409 SESSION_REPLACED`
  - this session was superseded by a newer one for the same participant
- `404 SESSION_NOT_FOUND`
  - the current session is no longer valid in the Durable Object

## Architecture Notes

See [room-identity-and-session-lifecycle.md](/home/andrey/src/telesense/apps/telesense/docs/room-identity-and-session-lifecycle.md) for the participant/session handoff model and the main client/worker state machines.

## Testing

- Unit coverage lives in `src/**/*.test.ts` and runs with `vp test`
- End-to-end coverage lives in [`e2e`](/home/andrey/src/telesense/apps/telesense/e2e) and runs with `vp run test`
