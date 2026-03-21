import { describe, expect, test } from "vite-plus/test"
import {
  TOKEN_FORMAT_VERSION,
  extractBudgetId,
  extractClaims,
  extractSecretVersion,
  mintToken,
  parseToken,
  verifyTokenWithSecret,
} from "./tokens"

describe("service entitlement tokens", () => {
  test("mint and verify successfully", async () => {
    const token = await mintToken("budget-123", 2, "test-secret", {
      issuedAt: 1_700_000_000,
    })

    expect(extractBudgetId(token)).toBe("budget-123")
    expect(extractSecretVersion(token)).toBe(2)
    expect(extractClaims(token)).toEqual({
      tokenFormatVersion: TOKEN_FORMAT_VERSION,
      issuedAt: 1_700_000_000,
    })

    await expect(verifyTokenWithSecret(token, "test-secret")).resolves.toEqual({
      valid: true,
      budgetId: "budget-123",
      secretVersion: 2,
      claims: {
        tokenFormatVersion: TOKEN_FORMAT_VERSION,
        issuedAt: 1_700_000_000,
      },
    })
  })

  test("issuedAt defaults to epoch seconds", async () => {
    const before = Math.floor(Date.now() / 1000)
    const token = await mintToken("budget-123", 1, "test-secret")
    const claims = extractClaims(token)
    const after = Math.floor(Date.now() / 1000)

    expect(claims?.issuedAt).toBeGreaterThanOrEqual(before)
    expect(claims?.issuedAt).toBeLessThanOrEqual(after)
  })

  test("rejects tampered claims", async () => {
    const token = await mintToken("budget-123", 1, "test-secret", {
      issuedAt: 1_700_000_000,
    })
    const parsed = parseToken(token)
    expect(parsed).not.toBeNull()

    const tamperedClaims = btoa(
      JSON.stringify({
        tokenFormatVersion: TOKEN_FORMAT_VERSION,
        issuedAt: 1_700_000_999,
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
    const tamperedToken = `budget-123.1.${tamperedClaims}.${parsed?.proof}`

    await expect(verifyTokenWithSecret(tamperedToken, "test-secret")).resolves.toEqual({
      valid: false,
      reason: "Invalid proof",
    })
  })

  test("rejects malformed tokens", async () => {
    expect(parseToken("not-a-real-token")).toBeNull()
    await expect(verifyTokenWithSecret("not-a-real-token", "test-secret")).resolves.toEqual({
      valid: false,
      reason: "Malformed token",
    })
  })

  test("invalidates old tokens after secret rotation", async () => {
    const token = await mintToken("budget-123", 1, "old-secret")

    await expect(verifyTokenWithSecret(token, "new-secret")).resolves.toEqual({
      valid: false,
      reason: "Invalid proof",
    })
  })
})
