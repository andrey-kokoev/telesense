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

  test("incomplete: shows disabled button and helper hint after partial code", async ({ page }) => {
    await page.goto("/")

    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    await page.keyboard.type("ABC")

    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toHaveText("Enter room code")
    await expect(primaryAction).toBeDisabled()
    await expect(page.locator(".landing__hint")).toHaveText("Enter all 6 letters to continue.")
    await expect(page.locator(".landing__inline-link")).toBeHidden()
  })

  test("checking: shows in-progress state while status request is pending", async ({ page }) => {
    // Never fulfill the route — keeps the request pending for the entire test
    await page.route("**/api/rooms/*/status", () => {})

    await page.goto("/")

    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    await page.keyboard.type("ZXQWVB")

    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toHaveText("Checking…")
    await expect(primaryAction).toBeDisabled()
    await expect(page.locator(".landing__hint")).toHaveText(
      "Checking whether this room is already active.",
    )
    await expect(page.locator(".landing__inline-link")).toBeHidden()
  })

  test("joinable: shows join button and hint when room exists", async ({ page }) => {
    await page.route("**/api/rooms/*/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: true }),
      })
    })

    await page.goto("/")

    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    await page.keyboard.type("ZXQWVB")

    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toHaveText("Join room")
    await expect(primaryAction).toBeEnabled()
    await expect(page.locator(".landing__hint")).toHaveText("Room found. You can join it now.")
    await expect(page.locator(".landing__inline-link")).toBeHidden()
  })

  test("creatable: shows create button and hint when room is unused in dev mode", async ({
    page,
  }) => {
    await page.route("**/api/rooms/*/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: false }),
      })
    })
    await page.route("**/api/auth/verify", async (route) => {
      await route.fulfill({ status: 200 })
    })

    const verifySettled = page.waitForResponse("**/api/auth/verify")
    await page.goto("/")
    await verifySettled

    const inputs = page.locator(".landing__code-input")
    await expect(inputs).toHaveCount(6)

    await inputs.first().click()
    await page.keyboard.press("Z")
    await page.keyboard.press("X")
    await page.keyboard.press("Q")
    await page.keyboard.press("W")
    await page.keyboard.press("V")
    await page.keyboard.press("B")

    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toBeVisible()
    await expect(primaryAction).toHaveText("Create room")
    await expect(primaryAction).toBeEnabled()
    await expect(page.locator(".landing__hint")).toHaveText(
      "Room not found. You can create it with this code.",
    )
    await expect(page.locator(".landing__inline-link")).toBeHidden()
  })

  test("token_required: shows disabled button, hint, and inline token link when room is missing and creation is restricted", async ({
    page,
  }) => {
    await page.route("**/api/rooms/*/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: false }),
      })
    })
    await page.route("**/api/auth/verify", async (route) => {
      await route.fulfill({ status: 401 })
    })

    const verifySettled = page.waitForResponse("**/api/auth/verify")
    await page.goto("/")
    await verifySettled

    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    await page.keyboard.type("ZXQWVB")

    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toHaveText("Create room")
    await expect(primaryAction).toBeDisabled()
    await expect(page.locator(".landing__hint")).toHaveText("This room code is unused.")

    const inlineLink = page.locator(".landing__inline-link")
    await expect(inlineLink).toBeVisible()
    await expect(inlineLink).toHaveText("Enter token to create rooms")

    await inlineLink.click()
    await expect(page.locator(".landing__modal-content")).toBeVisible()
    await expect(page.locator(".landing__modal-title")).toHaveText("Enter token to create rooms")
  })

  test("token_required (exhausted token): shows exhausted hint and token link", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "telesense:state",
        JSON.stringify({
          serviceEntitlementToken: "exhausted-token",
          serviceEntitlementState: "exhausted",
        }),
      )
    })
    await page.route("**/api/rooms/*/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: false }),
      })
    })
    await page.route("**/api/auth/verify", async (route) => {
      await route.fulfill({ status: 401 })
    })

    const verifySettled = page.waitForResponse("**/api/auth/verify")
    await page.goto("/")
    await verifySettled

    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    await page.keyboard.type("ZXQWVB")

    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toHaveText("Create room")
    await expect(primaryAction).toBeDisabled()
    await expect(page.locator(".landing__hint")).toHaveText(
      "This service entitlement is saved, but its budget is exhausted. Update it to create new rooms.",
    )
    await expect(page.locator(".landing__inline-link")).toBeVisible()
    await expect(page.locator(".landing__inline-link")).toHaveText("Enter token to create rooms")
  })

  test("token_required (verifying): hides inline link and shows verifying hint while token check is in-flight", async ({
    page,
  }) => {
    // A stored exhausted token makes hasServiceEntitlementToken = true, which is required
    // for the verifying hint branch in useRoomEntryState to activate
    await page.addInitScript(() => {
      localStorage.setItem(
        "telesense:state",
        JSON.stringify({
          serviceEntitlementToken: "exhausted-token",
          serviceEntitlementState: "exhausted",
        }),
      )
    })
    await page.route("**/api/rooms/*/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: false }),
      })
    })
    await page.route("**/api/auth/verify", async (route) => {
      await route.fulfill({ status: 401 })
    })
    // Never fulfill the token resolve — keeps tokenEntryPhase === "verifying"
    await page.route("**/auth/resolve", () => {})

    const verifySettled = page.waitForResponse("**/api/auth/verify")
    await page.goto("/")
    await verifySettled

    // Reach token_required state (exhausted → hint shows exhausted text, link visible)
    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    await page.keyboard.type("ZXQWVB")

    const inlineLink = page.locator(".landing__inline-link")
    await expect(inlineLink).toBeVisible()
    await inlineLink.click()

    // Submit a token — this triggers tokenEntryPhase = "verifying" while resolve hangs
    await page.locator(".landing__modal-content input[type='password']").fill("sometoken")
    await page.locator(".landing__modal-content [type='submit']").click()

    await expect(inlineLink).toBeHidden()
    await expect(page.locator(".landing__hint")).toHaveText(
      "Checking this service entitlement before enabling room creation",
    )
  })

  test("error: shows retry button and hint when status check fails", async ({ page }) => {
    await page.route("**/api/rooms/*/status", async (route) => {
      await route.fulfill({ status: 500 })
    })

    await page.goto("/")

    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    await page.keyboard.type("ZXQWVB")

    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toHaveText("Try again")
    await expect(primaryAction).toBeEnabled()
    await expect(page.locator(".landing__hint")).toHaveText("Could not check room availability")
    await expect(page.locator(".landing__inline-link")).toBeHidden()
  })

  test("backspace after complete code resets state to incomplete", async ({ page }) => {
    await page.route("**/api/rooms/*/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: true }),
      })
    })

    await page.goto("/")

    const inputs = page.locator(".landing__code-input")
    await inputs.first().click()
    await page.keyboard.type("ZXQWVB")

    const primaryAction = page.locator(".landing__main .landing__btn").first()
    await expect(primaryAction).toHaveText("Join room")

    // Clear the last digit — fires the @input handler which resets lookup state
    await inputs.nth(5).fill("")

    await expect(primaryAction).toHaveText("Enter room code")
    await expect(primaryAction).toBeDisabled()
    await expect(page.locator(".landing__hint")).toHaveText("Enter all 6 letters to continue.")
    await expect(page.locator(".landing__inline-link")).toBeHidden()
  })
})
