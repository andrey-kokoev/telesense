import { expect, test } from "@playwright/test"

test.describe("Chat messaging between two participants", () => {
  test("sends and receives messages between two browsers in same room", async ({ browser }) => {
    const roomId = `C${Date.now().toString().slice(-5)}`.slice(0, 6).toUpperCase()

    // Create two separate browser contexts
    const contextA = await browser.newContext()
    const contextB = await browser.newContext()

    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    try {
      // ===== BROWSER A: Create room =====
      await pageA.goto("/")

      // Enter room code
      const inputsA = pageA.locator(".landing__code-input")
      await inputsA.first().click()
      for (const char of roomId) {
        await pageA.keyboard.press(char)
      }

      // Create room
      const createButtonA = pageA.locator(".landing__main .landing__btn").first()
      await expect(createButtonA).toHaveText("Create room")
      await createButtonA.click()

      // Wait for call view
      await expect(pageA).toHaveURL(new RegExp(`\\?room=${roomId}$`))
      await expect(pageA.getByText("Waiting for participant...")).toBeVisible({
        timeout: 30000,
      })

      // Wait for connection to stabilize
      await pageA.waitForTimeout(2000)

      // Open chat and send message
      await pageA.getByRole("button", { name: /chat/i }).click()
      await expect(pageA.locator(".call-view__chat-panel")).toBeVisible()

      const testMessage = "Hello from Browser A"
      await pageA.locator(".call-view__chat-input").fill(testMessage)
      await pageA.locator(".call-view__chat-send").click()

      // Verify message appears locally
      await expect(pageA.locator(".call-view__chat-message").first()).toContainText(testMessage)

      // ===== BROWSER B: Join room =====
      await pageB.goto(`/?room=${roomId}`)

      // Wait for room check to complete
      const joinButtonB = pageB.locator(".landing__main .landing__btn").first()
      await expect(joinButtonB).toHaveText("Join room", { timeout: 10000 })
      await joinButtonB.click()

      // Wait for call view
      await expect(pageB).toHaveURL(new RegExp(`\\?room=${roomId}$`))

      // Wait for connection - look for "Remote participant connected"
      await expect(pageB.getByText("Remote participant connected!")).toBeVisible({
        timeout: 30000,
      })

      // Also check A sees the connection
      await expect(pageA.getByText("Remote participant connected!")).toBeVisible({
        timeout: 10000,
      })

      // ===== VERIFY MESSAGE RECEIVED =====
      // Open chat on B
      await pageB.getByRole("button", { name: /chat/i }).click()
      await expect(pageB.locator(".call-view__chat-panel")).toBeVisible()

      // THE KEY TEST: Does B see the message from A?
      await expect(pageB.locator(".call-view__chat-message").first()).toContainText(testMessage, {
        timeout: 5000,
      })

      // ===== B sends reply =====
      const replyMessage = "Reply from Browser B"
      await pageB.locator(".call-view__chat-input").fill(replyMessage)
      await pageB.locator(".call-view__chat-send").click()

      // Verify B sees reply locally
      await expect(
        pageB.locator(".call-view__chat-message").filter({ hasText: replyMessage }),
      ).toBeVisible()

      // Verify A receives reply
      await expect(
        pageA.locator(".call-view__chat-message").filter({ hasText: replyMessage }),
      ).toBeVisible({ timeout: 5000 })
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test("deletes message on both sides when deleted by sender", async ({ browser }) => {
    const roomId = `D${Date.now().toString().slice(-5)}`.slice(0, 6).toUpperCase()

    const contextA = await browser.newContext()
    const contextB = await browser.newContext()

    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()

    try {
      // A creates room
      await pageA.goto("/")
      const inputsA = pageA.locator(".landing__code-input")
      await inputsA.first().click()
      for (const char of roomId) {
        await pageA.keyboard.press(char)
      }
      await pageA.locator(".landing__main .landing__btn").first().click()
      await expect(pageA).toHaveURL(new RegExp(`\\?room=${roomId}$`))
      await expect(pageA.getByText("Waiting for participant...")).toBeVisible({
        timeout: 30000,
      })

      // Wait and send message
      await pageA.waitForTimeout(2000)
      await pageA.getByRole("button", { name: /chat/i }).click()

      const testMessage = "Message to be deleted"
      await pageA.locator(".call-view__chat-input").fill(testMessage)
      await pageA.locator(".call-view__chat-send").click()

      // B joins
      await pageB.goto(`/?room=${roomId}`)
      await expect(pageB.locator(".landing__main .landing__btn").first()).toHaveText("Join room", {
        timeout: 10000,
      })
      await pageB.locator(".landing__main .landing__btn").first().click()

      await expect(pageB.getByText("Remote participant connected!")).toBeVisible({
        timeout: 30000,
      })

      // B opens chat and sees message
      await pageB.getByRole("button", { name: /chat/i }).click()
      await expect(pageB.locator(".call-view__chat-message").first()).toContainText(testMessage, {
        timeout: 5000,
      })

      // A deletes the message
      await pageA.locator(".call-view__chat-delete").first().click()

      // Verify message disappears from A
      await expect(pageA.locator(".call-view__chat-message")).toHaveCount(0, {
        timeout: 2000,
      })

      // Verify message disappears from B
      await expect(pageB.locator(".call-view__chat-message")).toHaveCount(0, {
        timeout: 5000,
      })
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })
})
