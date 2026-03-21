import { beforeEach, describe, expect, test, vi } from "vite-plus/test"
import { useMetering } from "./useMetering"

describe("useMetering", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test("maps fetched status into lifecycle-derived grace state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            remainingBytes: 0,
            lifecycle: "in_grace",
            inGrace: true,
            graceEndsAt: Date.now() + 5 * 60 * 1000,
            graceRemainingMinutes: 5,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    )

    const metering = useMetering("ROOM1")
    await metering.fetchStatus()

    expect(metering.lifecycle.value).toBe("in_grace")
    expect(metering.isInGrace.value).toBe(true)
    expect(metering.graceRemainingMinutes.value).toBe(5)
    expect(metering.graceEndsAt.value).toBeInstanceOf(Date)
  })

  test("surfaces fetch failures as errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })))

    const metering = useMetering("ROOM1")
    await metering.fetchStatus()

    expect(metering.error.value).toBe("Failed to fetch metering status: 500")
    expect(metering.lifecycle.value).toBe("active")
  })
})
