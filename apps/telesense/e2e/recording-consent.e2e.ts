import { expect, test } from "@playwright/test"

/**
 * Recording Consent E2E Test
 *
 * Tests the dual-party consent flow for call recording:
 * 1. Browser A requests recording
 * 2. Browser B receives consent request
 * 3. Browser B consents
 * 4. Recording starts on both sides
 * 5. Recording can be stopped
 */

test.describe("Recording consent flow", () => {
  test("both participants must consent before recording starts", async ({ browser }) => {
    const roomId = `REC${Date.now().toString().slice(-4)}`.slice(0, 6).toUpperCase()

    const contextA = await browser.newContext()
    const contextB = await browser.newContext()

    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    const logsA: string[] = []
    const logsB: string[] = []
    pageA.on("console", (msg) => logsA.push(msg.text()))
    pageB.on("console", (msg) => logsB.push(msg.text()))

    try {
      // ===== JOIN ROOM =====
      await pageA.goto(`/?room=${roomId}`)
      await pageB.goto(`/?room=${roomId}`)

      await expect(pageA.getByText("Remote participant connected!")).toBeVisible({
        timeout: 30000,
      })
      await expect(pageB.getByText("Remote participant connected!")).toBeVisible({
        timeout: 10000,
      })

      // ===== BROWSER A: REQUEST RECORDING =====
      await pageA.locator(".call-view__record-btn").click()

      // Should see recording options modal
      await expect(pageA.getByText("Start Recording")).toBeVisible()
      await expect(pageA.getByText("My audio")).toBeVisible()

      // Click "Request Consent"
      await pageA.getByRole("button", { name: "Request Consent" }).click()

      // Should see "waiting for consent" toast
      await expect(pageA.getByText(/waiting for consent/i)).toBeVisible()

      // ===== BROWSER B: RECEIVE CONSENT REQUEST =====
      // Should see consent modal
      await expect(pageB.getByText("Recording Request")).toBeVisible({ timeout: 5000 })
      await expect(pageB.getByText("The other participant wants to record this call")).toBeVisible()

      // ===== BROWSER B: CONSENT =====
      await pageB.getByRole("button", { name: "Allow" }).click()

      // ===== VERIFY RECORDING STARTED =====
      // Both should see recording indicator
      await expect(pageA.locator(".call-view__recording-indicator")).toBeVisible({ timeout: 5000 })
      await expect(pageB.locator(".call-view__recording-indicator")).toBeVisible({ timeout: 5000 })

      // Verify timer is running (format: MM:SS)
      const timeText = await pageA.locator(".call-view__recording-text").textContent()
      expect(timeText).toMatch(/^\d{2}:\d{2}$/)

      // Wait a few seconds
      await pageA.waitForTimeout(3000)

      // ===== BROWSER A: STOP RECORDING =====
      // Click the recording button again to stop
      await pageA.locator(".call-view__record-btn").click()

      // Should confirm stop (alert)
      await pageA.waitForEvent("dialog")
      pageA.on("dialog", (dialog) => dialog.accept())

      // Recording indicator should disappear
      await expect(pageA.locator(".call-view__recording-indicator")).not.toBeVisible({
        timeout: 5000,
      })
      await expect(pageB.locator(".call-view__recording-indicator")).not.toBeVisible({
        timeout: 5000,
      })

      console.log("\n✅ Recording consent flow test passed!")
    } finally {
      console.log("\n=== Browser A Logs ===")
      logsA.forEach((log) => console.log(log))
      console.log("\n=== Browser B Logs ===")
      logsB.forEach((log) => console.log(log))

      await contextA.close()
      await contextB.close()
    }
  })

  test("recording does not start if consent is declined", async ({ browser }) => {
    const roomId = `REJ${Date.now().toString().slice(-4)}`.slice(0, 6).toUpperCase()

    const contextA = await browser.newContext()
    const contextB = await browser.newContext()

    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    try {
      // Join room
      await pageA.goto(`/?room=${roomId}`)
      await pageB.goto(`/?room=${roomId}`)

      await expect(pageA.getByText("Remote participant connected!")).toBeVisible({
        timeout: 30000,
      })

      // A requests recording
      await pageA.locator(".call-view__record-btn").click()
      await pageA.getByRole("button", { name: "Request Consent" }).click()

      // B declines
      await expect(pageB.getByText("Recording Request")).toBeVisible({ timeout: 5000 })
      await pageB.getByRole("button", { name: "Decline" }).click()

      // A should see declined message
      await expect(pageA.getByText(/declined/i)).toBeVisible()

      // Neither should see recording indicator
      await expect(pageA.locator(".call-view__recording-indicator")).not.toBeVisible()
      await expect(pageB.locator(".call-view__recording-indicator")).not.toBeVisible()

      console.log("\n✅ Decline flow test passed!")
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })
})
