import { beforeEach, describe, expect, test } from "vite-plus/test"
import { CallRoom } from "./call-room"

class MemoryStorage {
  private data = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
  }
}

function createCallRoom() {
  const state = {
    storage: new MemoryStorage(),
  } as unknown as DurableObjectState

  return new CallRoom(state)
}

async function requestJson(callRoom: CallRoom, action: string, init?: RequestInit) {
  const response = await callRoom.fetch(new Request(`http://do.internal/?action=${action}`, init))
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
  return { response, data }
}

describe("CallRoom", () => {
  let callRoom: CallRoom

  beforeEach(() => {
    callRoom = createCallRoom()
  })

  test("creates a first participant session and issues a participant secret", async () => {
    const authorize = await requestJson(callRoom, "authorizeParticipant", {
      method: "POST",
      body: JSON.stringify({
        participantId: "participant-a",
      }),
    })

    expect(authorize.response.status).toBe(200)
    expect(authorize.data?.participantId).toBe("participant-a")
    expect(typeof authorize.data?.participantSecret).toBe("string")

    const createSession = await requestJson(callRoom, "createSession", {
      method: "POST",
      body: JSON.stringify({
        internalId: "session-a",
        participantId: "participant-a",
        participantSecret: authorize.data?.participantSecret,
        cfSessionId: "cf-session-a",
      }),
    })

    expect(createSession.response.status).toBe(200)

    const state = await requestJson(callRoom, "getState")
    expect(state.data?.participantCount).toBe(1)
    expect(state.data?.sessionCount).toBe(1)
    expect(state.data?.participants).toEqual([
      expect.objectContaining({
        participantId: "particip",
        lifecycle: "active",
        activeSessionId: "session-",
        pendingSessionId: null,
      }),
    ])
  })

  test("requires takeover confirmation for an already-active participant", async () => {
    const authorize = await requestJson(callRoom, "authorizeParticipant", {
      method: "POST",
      body: JSON.stringify({
        participantId: "participant-a",
      }),
    })

    await requestJson(callRoom, "createSession", {
      method: "POST",
      body: JSON.stringify({
        internalId: "session-a",
        participantId: "participant-a",
        participantSecret: authorize.data?.participantSecret,
        cfSessionId: "cf-session-a",
      }),
    })

    const secondAuthorize = await requestJson(callRoom, "authorizeParticipant", {
      method: "POST",
      body: JSON.stringify({
        participantId: "participant-a",
        participantSecret: authorize.data?.participantSecret,
      }),
    })

    expect(secondAuthorize.response.status).toBe(409)
    expect(secondAuthorize.data?.code).toBe("PARTICIPANT_TAKEOVER_REQUIRED")
  })

  test("rejects reconnect with the wrong participant secret", async () => {
    const authorize = await requestJson(callRoom, "authorizeParticipant", {
      method: "POST",
      body: JSON.stringify({
        participantId: "participant-a",
      }),
    })

    await requestJson(callRoom, "createSession", {
      method: "POST",
      body: JSON.stringify({
        internalId: "session-a",
        participantId: "participant-a",
        participantSecret: authorize.data?.participantSecret,
        cfSessionId: "cf-session-a",
      }),
    })

    const invalidAuthorize = await requestJson(callRoom, "authorizeParticipant", {
      method: "POST",
      body: JSON.stringify({
        participantId: "participant-a",
        participantSecret: "wrong-secret",
        confirmTakeover: true,
      }),
    })

    expect(invalidAuthorize.response.status).toBe(403)
    expect(invalidAuthorize.data?.code).toBe("PARTICIPANT_AUTH_FAILED")
  })

  test("keeps a pending handoff and reports the old session as replaced after publish", async () => {
    const authorize = await requestJson(callRoom, "authorizeParticipant", {
      method: "POST",
      body: JSON.stringify({
        participantId: "participant-a",
      }),
    })
    const participantSecret = authorize.data?.participantSecret

    await requestJson(callRoom, "createSession", {
      method: "POST",
      body: JSON.stringify({
        internalId: "session-a",
        participantId: "participant-a",
        participantSecret,
        cfSessionId: "cf-session-a",
      }),
    })

    await requestJson(callRoom, "publishTracks", {
      method: "POST",
      body: JSON.stringify({
        internalId: "session-a",
        tracks: [{ trackName: "camera", mid: "0" }],
      }),
    })

    const confirmedAuthorize = await requestJson(callRoom, "authorizeParticipant", {
      method: "POST",
      body: JSON.stringify({
        participantId: "participant-a",
        participantSecret,
        confirmTakeover: true,
      }),
    })

    await requestJson(callRoom, "createSession", {
      method: "POST",
      body: JSON.stringify({
        internalId: "session-b",
        participantId: "participant-a",
        participantSecret: confirmedAuthorize.data?.participantSecret,
        cfSessionId: "cf-session-b",
      }),
    })

    const handoffState = await requestJson(callRoom, "getState")
    expect(handoffState.data?.participants).toEqual([
      expect.objectContaining({
        lifecycle: "handoff_pending",
        activeSessionId: "session-",
        pendingSessionId: "session-",
      }),
    ])

    const oldSessionBeforePublish = await callRoom.fetch(
      new Request("http://do.internal/?action=getSession&internalId=session-a"),
    )
    expect(oldSessionBeforePublish.status).toBe(200)

    const pendingSessionBeforePublish = await callRoom.fetch(
      new Request("http://do.internal/?action=getSession&internalId=session-b"),
    )
    expect(pendingSessionBeforePublish.status).toBe(200)

    await requestJson(callRoom, "publishTracks", {
      method: "POST",
      body: JSON.stringify({
        internalId: "session-b",
        tracks: [{ trackName: "camera", mid: "0" }],
      }),
    })

    const replacedLookup = await callRoom.fetch(
      new Request("http://do.internal/?action=getSession&internalId=session-a"),
    )
    expect(replacedLookup.status).toBe(409)
    await expect(replacedLookup.json()).resolves.toEqual(
      expect.objectContaining({ code: "SESSION_REPLACED" }),
    )

    const finalState = await requestJson(callRoom, "getState")
    expect(finalState.data?.participants).toEqual([
      expect.objectContaining({
        lifecycle: "active",
        activeSessionId: "session-",
        pendingSessionId: null,
      }),
    ])
  })
})
