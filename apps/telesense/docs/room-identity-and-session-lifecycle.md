# Room Identity and Session Lifecycle

This app separates browser identity, room participant identity, and live transport sessions.

## Identity Layers

- `browserInstanceId`
  - stable local identity stored in browser local storage
  - identifies one browser installation/profile, not a human account
- `participantId`
  - deterministic room-scoped identity derived from `roomId + browserInstanceId`
  - used by the worker and Durable Object as the participant key
- `participantSecret`
  - room-scoped credential proving that the browser may reclaim that participant
  - stored locally per room
- `sessionId`
  - ephemeral live transport identity for one current connection attempt

## Main Rule

One participant may have:

- one active session
- optionally one pending handoff session

Multiple tabs are not supported as concurrent active sessions for the same participant.

## Join and Reconnect Flow

1. Client sends `browserInstanceId` and any stored `participantSecret` to `POST /api/rooms/:roomId/session`.
2. Worker derives `participantId` from `roomId + browserInstanceId`.
3. Durable Object authorizes the participant.
4. If the participant is already active:
   - worker returns `409 PARTICIPANT_TAKEOVER_REQUIRED` unless takeover was confirmed
5. If authorization succeeds:
   - worker allocates a new Cloudflare transport session
   - worker registers a new local `sessionId` in the Durable Object

## Handoff Model

During reconnect/takeover:

- old session remains `active`
- new session is `pending`
- once the new session publishes tracks, it becomes `active`
- old session then becomes invalid and returns `SESSION_REPLACED`

This avoids a visible participant disappearance between session admission and media publish.

## Durable Object Participant Lifecycle

The DO normalizes each participant into one of:

- `ended`
- `active`
- `handoff_pending`

This lifecycle is derived from:

- `activeSessionId`
- `pendingSessionId`

and is the authority for:

- session validity
- remote discovery
- handoff completion
- orphan cleanup

## Client State Machines

The client intentionally uses small state machines in the main unstable domains:

- session lifecycle
  - `creating_session`
  - `acquiring_media`
  - `publishing`
  - `ready`
  - `leaving`
  - `failed`
- call display state
  - `starting`
  - `waiting_for_remote`
  - `connected`
  - `remote_media_interrupted`
  - `remote_left`
- takeover prompt
  - `closed`
  - `prompting`
  - `resolving`

## Presence vs Transport

The app separates:

- presence/identity truth from the Durable Object
- media transport health from WebRTC

That means:

- DO decides whether the participant exists
- WebRTC decides whether media is currently interrupted

So `remote left` and `connection interrupted` are intentionally different states.
