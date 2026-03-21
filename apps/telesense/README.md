# telesence App

The main video-calling application.

## Structure

```text
src/
├── worker/
│   ├── index.ts                # Hono worker routes and Cloudflare API wiring
│   ├── call-room.ts            # Durable Object for room/session/participant coordination
│   ├── entitlement-budget.ts   # Durable Object for service entitlement budget
│   ├── monthly-allowance.ts    # Durable Object for cron-driven budget reset policy
│   └── tokens.ts               # Stateless token minting and verification
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
- `SERVICE_ENTITLEMENT_TOKEN` - Admin/master token for mint and rotation routes

Edit `wrangler.toml`:

- `REALTIME_APP_ID` - Your app ID
- `GLOBAL_ENTITLEMENT_BUDGET_ID` - Shared budget name for current rollout
- `SERVICE_ENTITLEMENT_ALLOWANCE_BYTES` - Bytes added to the shared budget per minted token
- `MONTHLY_ALLOWANCE_ACTIVE` - Whether scheduled monthly budget resets are enabled
- `MONTHLY_ALLOWANCE_RESET_AMOUNT_BYTES` - Target shared-budget value after each scheduled reset
- `MONTHLY_ALLOWANCE_CRON_EXPR` - Five-field cron expression interpreted by the monthly allowance DO

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

### Room APIs

- `GET /api/rooms/:roomId/status` - Check whether a room currently exists
- `POST /api/rooms/status` - Batch room availability checks, capped at 100 room IDs
- `POST /api/rooms/:roomId/session` - Create or reconnect a participant session
- `POST /api/rooms/:roomId/publish-offer` - Publish local tracks
- `POST /api/rooms/:roomId/subscribe-offer` - Request remote tracks
- `POST /api/rooms/:roomId/complete-subscribe` - Complete the subscribe handshake
- `GET /api/rooms/:roomId/discover-remote-tracks` - Discover other participants' active tracks
- `POST /api/rooms/:roomId/media-state` - Sync audio/video intent
- `POST /api/rooms/:roomId/heartbeat` - Keep the session alive
- `POST /api/rooms/:roomId/leave` - Clean up session presence
- `POST /api/rooms/:roomId/terminate` - End the room

### Metering APIs

- `POST /api/rooms/:roomId/meter` - Charge budget for room usage (internal)
- `GET /api/rooms/:roomId/meter` - Get metering status including grace period

### Admin APIs (require `X-Service-Entitlement-Token` header)

- `POST /admin/entitlement/mint` - Mint a new service entitlement token
- `POST /admin/entitlement/rotate` - Rotate budget secret (invalidates old tokens)
- `GET /admin/entitlement/budget` - Get full budget inspection data

### Health

- `GET /health` - Health check

## Important Error Semantics

- `401 SERVICE_ENTITLEMENT_REQUIRED`
  - room does not currently exist and a valid service entitlement token is required to create it
- `403 SERVICE_ENTITLEMENT_INVALID`
  - the provided service entitlement token is invalid
- `402 SERVICE_BUDGET_EXHAUSTED`
  - the service entitlement budget is exhausted; room enters grace period
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

## Service Entitlement System

### Token Format

Service entitlement tokens are stateless and self-routing:

```
budgetId.secretVersion.claims.proof
```

- `budgetId` - UUID identifying the budget (shared global budget in current rollout)
- `secretVersion` - Incrementing integer, starts at 1
- `claims` - Base64url-encoded JSON: `{ "tokenFormatVersion": 1, "issuedAt": 1234567890 }`
- `proof` - HMAC-SHA256(secret, `budgetId.secretVersion.claims`)

### Budget Model

- One shared global budget per deployment
- Budget tracks `remainingBytes` and `consumedBytes`
- Each minted service entitlement token adds `SERVICE_ENTITLEMENT_ALLOWANCE_BYTES` to the shared budget
- 60-second metering ticks estimate egress usage
- Grace period (15 minutes) when budget exhausted
- New joins rejected during grace; room terminates at grace end

### Monthly Allowance Model

- One shared `MonthlyAllowance` DO per deployment
- Stores:
  - linked `budgetId`
  - `resetAmountBytes`
  - `cronExpr`
  - `active`
  - `nextResetAt`
  - `lastResetAt`
- Cron is only the trigger; reset policy lives in the DO
- When active and due, cron resets the shared budget to `MONTHLY_ALLOWANCE_RESET_AMOUNT_BYTES`
- This is a budget reset policy, not cumulative period accounting

### Secret Rotation

- Only current secret version is valid after rotation
- Old tokens fail immediately after rotation
- Secret-version metadata history is preserved
- Rotation is admin-only via `POST /admin/entitlement/rotate`

## Architecture Notes

See [room-identity-and-session-lifecycle.md](/home/andrey/src/telesense/apps/telesense/docs/room-identity-and-session-lifecycle.md) for the participant/session handoff model and the main client/worker state machines.

## Testing

- Unit coverage lives in `src/**/*.test.ts` and runs with `vp test`
- End-to-end coverage lives in [`e2e`](/home/andrey/src/telesense/apps/telesense/e2e) and runs with `vp run test`
