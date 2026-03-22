import { describe, expect, test, vi } from "vite-plus/test"
import { normalizeStoredAppState } from "./useAppStore"

describe("normalizeStoredAppState", () => {
  test("migrates legacy keys and drops invalid nested state", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-0000-0000-000000000001",
    )

    const normalized = normalizeStoredAppState({
      userId: "legacy-user-id",
      serviceEntitlementToken: " tok\u200ben \n",
      serviceEntitlementTokenVerified: true,
      hostAdminToken: " host\u00a0session ",
      recentCalls: [{ id: "room1", name: " First " }, { bad: true }],
      roomParticipantCredentials: {
        mewmew: { participantSecret: "secret-a" },
        broken: { nope: true },
      },
      preferences: {
        audioEnabled: false,
        locale: "ru",
        desktopCallLayout: "focus-remote",
        mobileCallLayout: "broken",
      },
    })

    expect(normalized.browserInstanceId).toBe("legacy-user-id")
    expect(normalized.serviceEntitlementToken).toBe("token")
    expect(normalized.serviceEntitlementState).toBe("valid")
    expect(normalized.hostAdminSessionToken).toBe("hostsession")
    expect(normalized.recentCalls).toEqual([{ id: "ROOM1", name: "First" }])
    expect(normalized.roomParticipantCredentials).toEqual({
      MEWMEW: { participantSecret: "secret-a" },
    })
    expect(normalized.preferences.audioEnabled).toBe(false)
    expect(normalized.preferences.locale).toBe("ru")
    expect(normalized.preferences.desktopCallLayout).toBe("focus-remote")
    expect(normalized.preferences.mobileCallLayout).toBe("picture-in-picture")
  })

  test("falls back to defaults for malformed state", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-0000-0000-000000000001",
    )

    const normalized = normalizeStoredAppState("bad-state")

    expect(normalized.browserInstanceId).toBe("00000000-0000-0000-0000-000000000001")
    expect(normalized.serviceEntitlementState).toBe("missing")
    expect(normalized.recentCalls).toEqual([])
    expect(normalized.roomParticipantCredentials).toEqual({})
  })
})
