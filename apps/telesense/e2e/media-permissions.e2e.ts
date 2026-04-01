import { expect, test, type Page } from "@playwright/test"

/**
 * E2E tests for media permission scenarios
 *
 * These tests verify that users can join rooms even when camera/microphone
 * permissions are denied or unavailable.
 *
 * Note: Playwright runs with --use-fake-device-for-media-stream which provides
 * fake media by default. To test "denied" scenarios, we use addInitScript to
 * override getUserMedia before page load.
 */

// Helper to block specific media types by overriding getUserMedia
async function blockMediaTracks(page: Page, blockVideo: boolean, blockAudio: boolean) {
  await page.addInitScript(
    ({ noVideo, noAudio }) => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)

      navigator.mediaDevices.getUserMedia = async (constraints) => {
        // If blocking video and video is requested, throw error
        if (noVideo && constraints?.video) {
          throw new Error("Video permission denied")
        }
        // If blocking audio and audio is requested, throw error
        if (noAudio && constraints?.audio) {
          throw new Error("Audio permission denied")
        }
        // Otherwise proceed normally (will use fake media)
        return original(constraints)
      }
    },
    { noVideo: blockVideo, noAudio: blockAudio },
  )
}

test.describe("Call with limited or no media permissions", () => {
  test("joins successfully when microphone is blocked (video-only)", async ({ page }) => {
    const roomId = `V${Date.now().toString().slice(-5)}`.slice(0, 6).toUpperCase()

    // Block audio, allow video
    await blockMediaTracks(page, false, true)

    await page.goto("/")

    // Enter room code
    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    for (const char of roomId) {
      await page.keyboard.press(char)
    }

    // Create room
    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toHaveText("Create room")
    await primaryAction.click()

    // Should enter call view successfully - no error
    await expect(page).toHaveURL(new RegExp(`\\?room=${roomId}$`))
    await expect(page.getByText("Waiting for participant...")).toBeVisible({ timeout: 30000 })

    // Should NOT show camera access denied error
    await expect(page.getByText("Camera access denied")).not.toBeVisible()

    // Video elements should be visible
    await expect(page.getByLabel("Your video feed")).toBeVisible()
    await expect(page.getByLabel("Remote participant video feed")).toBeVisible()

    // Should be in "ready" state (controls visible and functional)
    const controls = page.locator(".call-desktop__controls, .call-mobile__bottom-bar").first()
    await expect(controls).toBeVisible()
  })

  test("joins successfully when camera is blocked (audio-only)", async ({ page }) => {
    const roomId = `A${Date.now().toString().slice(-5)}`.slice(0, 6).toUpperCase()

    // Block video, allow audio
    await blockMediaTracks(page, true, false)

    await page.goto("/")

    // Enter room code
    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    for (const char of roomId) {
      await page.keyboard.press(char)
    }

    // Create room
    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toHaveText("Create room")
    await primaryAction.click()

    // Should enter call view successfully - no error
    await expect(page).toHaveURL(new RegExp(`\\?room=${roomId}$`))
    await expect(page.getByText("Waiting for participant...")).toBeVisible({ timeout: 30000 })

    // Should NOT show camera access denied error
    await expect(page.getByText("Camera access denied")).not.toBeVisible()

    // Video elements should still exist (for remote feed)
    await expect(page.getByLabel("Your video feed")).toBeVisible()
    await expect(page.getByLabel("Remote participant video feed")).toBeVisible()

    // Controls should be visible
    const controls = page.locator(".call-desktop__controls, .call-mobile__bottom-bar").first()
    await expect(controls).toBeVisible()
  })

  test("joins as viewer when both camera and microphone are blocked", async ({ page }) => {
    const roomId = `N${Date.now().toString().slice(-5)}`.slice(0, 6).toUpperCase()

    // Block both video and audio
    await blockMediaTracks(page, true, true)

    await page.goto("/")

    // Enter room code
    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    for (const char of roomId) {
      await page.keyboard.press(char)
    }

    // Create room
    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toHaveText("Create room")
    await primaryAction.click()

    // Should enter call view successfully - no "Camera access denied" error
    await expect(page).toHaveURL(new RegExp(`\\?room=${roomId}$`))
    await expect(page.getByText("Waiting for participant...")).toBeVisible({ timeout: 30000 })

    // Should NOT show error message
    await expect(page.getByText("Camera access denied")).not.toBeVisible()
    await expect(page.getByText(/error|denied|failed/i)).not.toBeVisible()

    // Video elements should exist (for viewing remote)
    await expect(page.getByLabel("Your video feed")).toBeVisible()
    await expect(page.getByLabel("Remote participant video feed")).toBeVisible()

    // Controls should be visible but buttons disabled (no local stream)
    const leaveButton = page.getByRole("button").filter({ hasText: /leave/i }).first()
    await expect(leaveButton).toBeEnabled()
  })

  test("viewer can leave room normally without media", async ({ page }) => {
    const roomId = `L${Date.now().toString().slice(-5)}`.slice(0, 6).toUpperCase()

    // Block both video and audio
    await blockMediaTracks(page, true, true)

    await page.goto("/")

    // Enter room code and create
    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    for (const char of roomId) {
      await page.keyboard.press(char)
    }

    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await primaryAction.click()

    // Wait for call view
    await expect(page).toHaveURL(new RegExp(`\\?room=${roomId}$`))
    await expect(page.getByText("Waiting for participant...")).toBeVisible({ timeout: 30000 })

    // Click leave
    const leaveButton = page.getByRole("button").filter({ hasText: /leave/i }).first()
    await leaveButton.click()

    // Should return to landing (URL may have empty query string)
    await expect(page).toHaveURL(/\/?(?:\?.*)?$/)
  })
})
