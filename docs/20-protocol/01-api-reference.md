# API Reference

Current worker API reference for `telesense`.

## Base URLs

| Environment             | URL                                                |
| ----------------------- | -------------------------------------------------- |
| Local Worker            | `http://localhost:8787`                            |
| Local Client            | `http://localhost:5173`                            |
| Cloudflare Realtime API | `https://rtc.live.cloudflare.com/v1/apps/{APP_ID}` |

## Authentication

### Service Entitlement

Used when creating a room that does not already exist.

```http
X-Service-Entitlement-Token: {service_entitlement_token}
```

### Host Admin Bootstrap

Used only for exchanging into a host-admin session.

```http
X-Host-Admin-Token: {host_admin_bootstrap_token}
```

### Host Admin Session

Used for all host-admin operations after bootstrap exchange.

```http
X-Host-Admin-Session: {host_admin_session_token}
```

## Room APIs

### GET /api/rooms/:roomId/status

Check whether a room currently exists.

### POST /api/rooms/status

Batch room-status lookup.

- capped at `100` room ids per request

### POST /api/rooms/:roomId/session

Create or reconnect a participant session.

Request body:

```json
{
  "browserInstanceId": "browser-uuid",
  "participantSecret": "optional-room-secret",
  "confirmTakeover": false
}
```

Response:

```json
{
  "sessionId": "local-session-id",
  "cloudflareSessionId": "cloudflare-session-id",
  "participantId": "room-scoped-participant-id",
  "participantSecret": "room-scoped-secret"
}
```

### POST /api/rooms/:roomId/publish-offer

Publish local media tracks for a session.

### POST /api/rooms/:roomId/subscribe-offer

Request a subscription offer for remote tracks.

### POST /api/rooms/:roomId/complete-subscribe

Complete the subscribe flow by sending the browser’s answer SDP.

### GET /api/rooms/:roomId/discover-remote-tracks

Discover currently published remote tracks and remote participant media state.

### POST /api/rooms/:roomId/heartbeat

Refresh session presence.

### POST /api/rooms/:roomId/media-state

Update declared audio/video intent.

### POST /api/rooms/:roomId/leave

Leave the room and release presence.

### POST /api/rooms/:roomId/terminate

Terminate a room immediately.

- requires `X-Host-Admin-Session`

## Metering APIs

### POST /api/rooms/:roomId/meter

Internal metering charge path used by the room Durable Object.

### GET /api/rooms/:roomId/meter

Get current room metering/grace status.

## Service Entitlement API

### GET /api/auth/verify

Verify a service entitlement token and inspect its bound budget.

Requires:

```http
X-Service-Entitlement-Token: {service_entitlement_token}
```

## Host Admin Auth APIs

### POST /admin/auth/exchange

Exchange a host-admin bootstrap token for a host-admin session token.

Requires:

```http
X-Host-Admin-Token: {host_admin_bootstrap_token}
```

Response:

```json
{
  "ok": true,
  "hostAdminSessionToken": "signed-session-token"
}
```

### GET /admin/auth/verify

Verify a host-admin session token.

Requires:

```http
X-Host-Admin-Session: {host_admin_session_token}
```

## Host Admin APIs

All endpoints below require `X-Host-Admin-Session`.

### GET /admin/host/budgets

Enumerate known budgets from the registry.

### GET /admin/host/monthly-allowances

Enumerate known monthly allowance policies from the registry.

### POST /admin/entitlement/mint

Mint a new service entitlement token for a selected budget and add allowance.

### POST /admin/entitlement/rotate

Rotate a selected budget secret.

### GET /admin/entitlement/budget?budgetKey=...

Inspect a selected budget.

### POST /admin/entitlement/budget-label

Update a budget label in the host-admin registry.

### POST /admin/entitlement/monthly-allowance

Configure a monthly allowance policy.

### GET /admin/entitlement/monthly-allowance?allowanceId=...

Inspect one monthly allowance policy.

## Health

### GET /health

Health check.

## Important Error Codes

- `401 SERVICE_ENTITLEMENT_REQUIRED`
- `403 SERVICE_ENTITLEMENT_INVALID`
- `402 SERVICE_ENTITLEMENT_EXHAUSTED`
- `403 PARTICIPANT_AUTH_FAILED`
- `409 PARTICIPANT_TAKEOVER_REQUIRED`
- `409 SESSION_REPLACED`
- `404 SESSION_NOT_FOUND`
- `401 HOST_ADMIN_REQUIRED`
- `403 HOST_ADMIN_INVALID`
- `401 HOST_ADMIN_SESSION_REQUIRED`
- `403 HOST_ADMIN_SESSION_INVALID`
