# How telesence Works

High-level mental model of the current app.

## The Short Version

1. Browser opens a room like `/?room=ABC123`
2. Client asks the worker for a room session
3. Worker authorizes a room participant through the `CallRoom` DO
4. Worker creates a Cloudflare Realtime session
5. Browser publishes local media
6. Browser polls for remote tracks
7. When remote tracks appear, browser subscribes to them
8. Room DO meters usage against the bound budget

## The Important Split

This app separates:

- room identity and presence
- live WebRTC transport
- service budget authority
- host-admin authority

Those are different layers on purpose.

## Rooms, Participants, Sessions

### Room

A room is the app-level rendezvous identified by `roomId`.

### Participant

A participant is deterministic per:

- `roomId`
- `browserInstanceId`

That means the same browser can reconnect as the same participant in the same room.

### Session

A session is one live transport attempt.

Sessions are replaceable; participants are the longer-lived concept.

## Why the Room DO Exists

`CallRoom` is the authority for:

- participant admission
- participant handoff between tabs/reconnects
- published remote tracks
- presence
- room metering status

It lets the worker stay stateless while keeping room-level coordination coherent.

## Why the Budget DO Exists

`EntitlementBudget` is the authority for:

- remaining allowance
- consumed allowance
- grace and exhaustion
- service entitlement token secret versions

Rooms do not decide whether budget remains; the budget DO does.

## Why the Monthly Allowance DO Exists

`MonthlyAllowance` is a small policy controller:

- points at one budget
- knows reset amount
- knows reset schedule
- resets the budget when due

Cron is only the trigger; policy lives in the DO.

## Host Admin

Authority is intentionally layered, but entry is unified through one landing-page token field.

Flow:

1. user pastes one token into the landing page
2. worker resolves whether it is:
   - host-admin
   - budget-admin
   - service-entitlement
3. browser stores the resulting session/access state
4. if the token is admin-capable, the Admin button routes to the correct admin surface

So bootstrap/admin tokens are not the same thing as the long-lived browser session credential.

## Media Flow

Media does not go through your worker.

The worker only handles signaling and coordination.

Actual media path:

```text
Browser A <-> Cloudflare Realtime SFU <-> Browser B
```

## Presence vs Media

The app distinguishes:

- participant still exists, but media is interrupted
- participant is gone entirely

That is why the UI can show:

- connection interrupted
- participant disconnected

as different states.
