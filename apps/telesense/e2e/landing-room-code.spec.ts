import { expect, test } from "@playwright/test"

test.describe("Landing room code entry", () => {
  test("accepts alphabetic room codes from keyboard input", async ({ page }) => {
    await page.goto("/")

    const inputs = page.locator(".landing__code-input")
    await expect(inputs).toHaveCount(6)

    await inputs.first().click()
    await page.keyboard.type("ABCDEF")

    await expect(inputs.nth(0)).toHaveValue("A")
    await expect(inputs.nth(1)).toHaveValue("B")
    await expect(inputs.nth(2)).toHaveValue("C")
    await expect(inputs.nth(3)).toHaveValue("D")
    await expect(inputs.nth(4)).toHaveValue("E")
    await expect(inputs.nth(5)).toHaveValue("F")
  })

  test("accepts alphabetic room codes from key presses", async ({ page }) => {
    await page.goto("/")

    const inputs = page.locator(".landing__code-input")
    await expect(inputs).toHaveCount(6)

    await inputs.first().click()
    await page.keyboard.press("A")
    await page.keyboard.press("B")
    await page.keyboard.press("C")
    await page.keyboard.press("D")
    await page.keyboard.press("E")
    await page.keyboard.press("F")

    await expect(inputs.nth(0)).toHaveValue("A")
    await expect(inputs.nth(1)).toHaveValue("B")
    await expect(inputs.nth(2)).toHaveValue("C")
    await expect(inputs.nth(3)).toHaveValue("D")
    await expect(inputs.nth(4)).toHaveValue("E")
    await expect(inputs.nth(5)).toHaveValue("F")
  })
})
