import { expect, test } from "@playwright/test"

test.describe("Call flow smoke", () => {
  test("creates a room through the landing flow and enters the call view", async ({ page }) => {
    const roomId = `R${Date.now().toString().slice(-5)}`.slice(0, 6).toUpperCase()

    await page.goto("/")

    const inputs = page.locator(".landing__code-input")
    await expect(inputs).toHaveCount(6)
    await inputs.first().click()

    for (const char of roomId) {
      await page.keyboard.press(char)
    }

    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toHaveText("Create room")
    await primaryAction.click()

    await expect(page).toHaveURL(new RegExp(`\\?room=${roomId}$`))
    await expect(page.getByText("Waiting for participant...")).toBeVisible()
    await expect(page.getByLabel("Your video feed")).toBeVisible()
    await expect(page.getByLabel("Remote participant video feed")).toBeVisible()
  })
})
