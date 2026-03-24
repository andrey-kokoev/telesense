import { expect, test } from "@playwright/test"

test.describe("Room status integration", () => {
  test("returns a real room-status payload from the running app", async ({ request }) => {
    const roomId = `Z${Date.now().toString().slice(-5)}`.slice(0, 6).toUpperCase()

    const response = await request.get(`/api/rooms/${roomId}/status`)
    expect(response.ok()).toBe(true)

    const body = (await response.json()) as { exists?: unknown }
    expect(typeof body.exists).toBe("boolean")
  })
})
