import { describe, expect, test } from "vite-plus/test"
import { decodeCallApiError } from "./useCallSession"

describe("decodeCallApiError", () => {
  test("maps SESSION_REPLACED to the takeover message", async () => {
    const decoded = await decodeCallApiError(
      new Response(
        JSON.stringify({
          error: "Session replaced",
          code: "SESSION_REPLACED",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )

    expect(decoded).toEqual(
      expect.objectContaining({
        kind: "session-replaced",
        message: "Call moved to another tab. Multiple tabs are not supported",
      }),
    )
  })

  test("maps PARTICIPANT_TAKEOVER_REQUIRED to the confirmation message", async () => {
    const decoded = await decodeCallApiError(
      new Response(
        JSON.stringify({
          error: "Participant takeover confirmation required",
          code: "PARTICIPANT_TAKEOVER_REQUIRED",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )

    expect(decoded).toEqual(
      expect.objectContaining({
        kind: "participant-takeover-required",
        message: "This room is already open in another tab. Taking over will disconnect it.",
      }),
    )
  })

  test("falls back to unknown errors when the response has no known code", async () => {
    const decoded = await decodeCallApiError(
      new Response(
        JSON.stringify({
          error: "Something odd happened",
        }),
        {
          status: 418,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )

    expect(decoded).toEqual(
      expect.objectContaining({
        kind: "unknown",
        message: "Something odd happened",
      }),
    )
  })
})
