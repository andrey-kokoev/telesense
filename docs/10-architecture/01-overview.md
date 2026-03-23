# System Architecture

`telesense` is a Cloudflare Realtime 1:1 calling app built around a few explicit authority layers.

## Main Layers

### Client

The browser owns:

- media capture
- WebRTC peer connection state
- local UI state machines
- local persistence for:
  - `browserInstanceId`
  - room participant credentials
  - service entitlement token
  - host-admin session token

### Worker

The worker owns:

- HTTP API surface
- Cloudflare Realtime API integration
- token verification and admin auth exchange
- routing to Durable Objects

### Durable Objects

#### `CallRoom`

Owns:

- room participant/session state
- participant handoff
- discovery/presence truth
- room lifecycle
- room metering loop

#### `EntitlementBudget`

Owns:

- remaining and consumed allowance
- budget lifecycle:
  - `active`
  - `in_grace`
  - `exhausted`
- single shared grace claim
- service entitlement token secret versions

#### `MonthlyAllowance`

Owns:

- reset policy for one linked budget
- reset amount
- cron expression
- active/inactive state
- next and last reset timestamps

### D1 Host-Admin Registry

Owns discovery/indexing only:

- known budgets
- known monthly allowances
- budget labels

Authority remains in the DOs; D1 is for host-admin enumeration.

## Runtime Relationships

```text
Browser
  -> Worker
    -> CallRoom DO
    -> EntitlementBudget DO
    -> MonthlyAllowance DO
    -> D1 host-admin registry
    -> Cloudflare Realtime API
```

For named authority/delegation shapes, see [03-authority-topologies.md](./03-authority-topologies.md).

## Routing Model

Current app surface:

- `/api/rooms/:roomId/*`
- `/api/auth/verify`
- `/admin/auth/*`
- `/admin/entitlement/*`
- `/admin/host/*`
- `/health`

The older `/api/calls/:callId/*` model is no longer current.

## Identity Model

Identity is intentionally split:

- `browserInstanceId`
  - local browser identity
- `participantId`
  - deterministic room-scoped identity
- `participantSecret`
  - room-scoped reclaim credential
- `sessionId`
  - transport/session instance id

Host-admin auth is also split:

- `HOST_ADMIN_BOOTSTRAP_TOKEN`
  - setup/operator bootstrap credential
- host-admin session token
  - browser working credential after exchange

## Why Durable Objects

DOs are now the actual production authority, not a future migration target.

They are used because the app needs:

- room-local coordination
- budget-local authority
- scheduled policy state
- cross-request persistence without introducing a traditional backend

## Current State Machines

### Client

- service entitlement state
- session lifecycle
- call display state
- takeover prompt state

### Room DO

- `inactive`
- `active`
- `in_grace`
- `terminated`

### Budget DO

- `active`
- `in_grace`
- `exhausted`

### Monthly Allowance DO

- `inactive`
- `scheduled`
- `due`
