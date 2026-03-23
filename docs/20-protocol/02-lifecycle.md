# Call Lifecycle

Current end-to-end lifecycle for a `telesense` room.

## 1. Room Admission

When a browser enters `/?room=ABC123`:

1. client calls `POST /api/rooms/:roomId/session`
2. sends:
   - `browserInstanceId`
   - optional stored `participantSecret`
   - optional `confirmTakeover`
3. worker derives deterministic `participantId`
4. room Durable Object authorizes that participant
5. if accepted, worker creates a Cloudflare session

If the room does not already exist, a valid `X-Service-Entitlement-Token` is required so the room can bind to a budget.

## 2. Local Media Startup

After session admission:

1. browser captures camera/mic
2. client syncs initial media intent to the room DO
3. client creates a WebRTC offer

## 3. Publish

Client calls `POST /api/rooms/:roomId/publish-offer`.

Worker:

1. resolves the local session through the room DO
2. forwards the publish request to Cloudflare Realtime
3. stores published tracks in the room DO
4. completes pending handoff if this publish replaced an earlier active session

The room is considered fully active only after publish succeeds.

## 4. Discovery

Client polls `GET /api/rooms/:roomId/discover-remote-tracks`.

The room DO returns:

- currently published remote tracks
- remote participant media intent
- remote participant count

This is the presence source of truth for the UI.

## 5. Subscribe

When remote tracks are present:

1. client calls `POST /api/rooms/:roomId/subscribe-offer`
2. worker asks Cloudflare for a remote-track offer
3. browser sets that remote offer
4. browser creates an answer
5. client calls `POST /api/rooms/:roomId/complete-subscribe`

After that, remote media can flow.

## 6. Steady State

While the room is active:

- `POST /api/rooms/:roomId/heartbeat` maintains participant presence
- `POST /api/rooms/:roomId/media-state` updates audio/video intent
- room DO meters estimated usage every 60 seconds
- budget DO may move the room into grace or hard exhaustion

## 7. Handoff / Multi-Tab Takeover

The participant lifecycle is:

- `active`
- `handoff_pending`
- `ended`

If the same browser participant reconnects:

1. old session remains active
2. new session becomes pending
3. once the new session publishes, it becomes active
4. old session starts returning `SESSION_REPLACED`

This avoids visible gaps during reconnect.

## 8. Budget and Grace

Each room binds to one budget when it is first created.

- later joins do not rebind the room to a different budget
- room metering charges that bound budget
- the shared budget grants grace to only one room at a time

Budget lifecycle:

- `active`
- `in_grace`
- `exhausted`

Room lifecycle:

- `inactive`
- `active`
- `in_grace`
- `terminated`

If a room wins the shared grace claim:

- current participants continue temporarily
- new joins are rejected
- room terminates when grace expires

If another room already claimed grace:

- the room hard-terminates immediately on exhaustion

## 9. Leave / Terminate

Normal participant exit:

- client calls `POST /api/rooms/:roomId/leave`

Admin termination:

- host admin calls `POST /api/rooms/:roomId/terminate`

## 10. Token Resolution Lifecycle

Admin-capable tokens use a two-step exchange flow behind one landing-page token field:

1. browser submits the pasted token to `POST /auth/resolve`
2. worker classifies it as:
   - host-admin
   - budget-admin
   - service-entitlement
3. if admin-capable, browser stores the returned admin session token
4. if service-capable, browser stores the resolved service-entitlement token state

Bootstrap/admin tokens and browser sessions are intentionally separate:

- bootstrap token is setup-time/operator credential
- budget-admin token is one-budget operator credential
- browser sessions are the working admin credentials
