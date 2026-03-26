# telesense App

The main video-calling application.

## Structure

```text
src/
├── worker/
│   ├── index.ts                # Hono worker routes and Cloudflare API wiring
│   ├── call-room.ts            # Durable Object for room/session/participant coordination
│   ├── entitlement-budget.ts   # Durable Object for service entitlement budget
│   ├── host-admin-registry.ts  # Optional D1-backed registry helpers for host admin discovery
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
- `SERVICE_ENTITLEMENT_TOKEN` - Worker secret for minting and verifying service entitlement tokens
- `HOST_ADMIN_BOOTSTRAP_TOKEN` - One-time bootstrap token used to exchange for a host-admin session

Edit `wrangler.toml`:

- `REALTIME_APP_ID` - Your app ID
- `GLOBAL_ENTITLEMENT_BUDGET_ID` - Shared budget name for current rollout
- `GLOBAL_MONTHLY_ALLOWANCE_ID` - Shared monthly allowance policy name for current rollout
- Bind `HOST_ADMIN_DB` to a D1 database to enable deployment-wide budget/allowance enumeration in host admin
- `wrangler.toml` includes the binding stanza with a placeholder `database_id`; replace it with the real D1 id before deploy
- Apply all SQL files in [migrations](/home/andrey/src/telesense/apps/telesense/migrations) to that database before using host admin and token registries

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

### Admin Auth APIs

- `POST /admin/auth/exchange` - Exchange `X-Host-Admin-Token` for a host-admin session token
- `GET /admin/auth/verify` - Verify `X-Host-Admin-Session`
- `POST /budget-admin/auth/exchange` - Exchange `X-Budget-Admin-Token` for a budget-admin session token
- `GET /budget-admin/auth/verify` - Verify access to one budget
- `POST /auth/resolve` - Resolve one pasted token into host-admin, budget-admin, or service-entitlement behavior

### Host Admin APIs

- `GET /admin/host/budgets` - Enumerate known budgets for host admin
- `GET /admin/host/monthly-allowances` - Enumerate known monthly allowance policies for host admin
- `POST /admin/budget-admin/mint` - Return the canonical budget-admin token for one budget
- `POST /admin/entitlement/rotate` - Rotate a selected budget secret (invalidates old tokens)
- `GET /admin/entitlement/budget?budgetKey=...` - Get full inspection data for a selected budget
- `POST /admin/entitlement/monthly-allowance` - Configure a selected monthly allowance policy
- `GET /admin/entitlement/monthly-allowance?allowanceId=...` - Inspect a selected monthly allowance policy

### Budget-Scoped Admin APIs

These routes accept either `X-Host-Admin-Session` or a matching `X-Budget-Admin-Session`.

- `POST /admin/entitlement/mint` - Mint a new service entitlement token for a selected budget
- `POST /admin/entitlement/budget-label` - Update a budget label
- `GET /admin/entitlement/tokens?budgetKey=...` - List service entitlement tokens for one budget
- `POST /admin/entitlement/tokens/label` - Update one service entitlement token label
- `POST /admin/entitlement/tokens/active` - Activate or deactivate one service entitlement token

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

- `SERVICE_ENTITLEMENT_TOKEN`
  - server-side secret used for minting and verifying service entitlement tokens
- `HOST_ADMIN_BOOTSTRAP_TOKEN`
  - separate bootstrap credential used only to exchange for a host-admin session token
- budget-admin tokens are canonical per budget and exchange into budget-admin sessions
- host-admin routes require `X-Host-Admin-Session`, not the bootstrap token directly
- the bootstrap secret and service-entitlement secret are intentionally separate so browser admin bootstrap does not share the worker's mint/verify secret and does not remain the long-lived browser credential
- the landing page has one token entry field; the worker resolves whether the pasted token is host-admin, budget-admin, or service-entitlement

### Token Format

Service entitlement tokens are stateless and self-routing:

```
budgetId.secretVersion.claims.proof
```

- `budgetId` - UUID identifying the budget (shared global budget in current rollout)
- `budgetKey` - routable Durable Object name for the budget; host admin and room metering use this for routing
- `secretVersion` - Incrementing integer, starts at 1
- `claims` - Base64url-encoded JSON: `{ "tokenFormatVersion": 1, "issuedAt": 1234567890, "tokenId": "..." }`
- `proof` - HMAC-SHA256(secret, `budgetId.secretVersion.claims`)

### Budget Model

- One shared global budget per deployment
- Budget tracks `remainingBytes` and `consumedBytes`
- Many service entitlement tokens can share the same budget
- 60-second metering ticks estimate egress usage
- Grace period (15 minutes) when budget exhausted
- New joins rejected during grace; room terminates at grace end

### Monthly Allowance Model

- One shared `MonthlyAllowance` DO per deployment
- Stores:
  - linked `budgetKey`
  - `resetAmountBytes`
  - `cronExpr`
  - `active`
  - `nextResetAt`
  - `lastResetAt`
- Cron is only the trigger; reset policy lives in the DO
- Admin routes configure the DO-backed policy state
- When active and due, cron resets the linked budget to the DO-configured `resetAmountBytes`
- This is a budget reset policy, not cumulative period accounting

### Host Admin Registry

- Host admin uses `HOST_ADMIN_DB` as its discovery registry
- The worker records known:
  - budgets by `budgetKey -> budgetId`
  - monthly allowances by `allowanceId -> budgetKey`
- On first host-admin access or scheduled allowance processing, the worker seeds D1 from the current global budget and monthly allowance DOs if the registry is empty
- This registry exists for deployment-wide admin discovery only; budget and allowance authority remains in the DOs

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
