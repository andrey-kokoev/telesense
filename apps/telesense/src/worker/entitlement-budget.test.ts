import { beforeEach, describe, expect, test, vi } from "vite-plus/test"
import { EntitlementBudget } from "./entitlement-budget"

class MemoryStorage {
  private data = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
  }
}

function createBudget() {
  const state = {
    storage: new MemoryStorage(),
  } as unknown as DurableObjectState

  return new EntitlementBudget(state)
}

async function requestJson(
  budget: EntitlementBudget,
  action: string,
  init?: RequestInit,
  query = "",
) {
  const response = await budget.fetch(
    new Request(`http://do.internal/?action=${action}${query}`, init),
  )
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
  return { response, data }
}

describe("EntitlementBudget", () => {
  let budget: EntitlementBudget

  beforeEach(() => {
    budget = createBudget()
  })

  test("adds allowance and reports active lifecycle", async () => {
    const add = await requestJson(budget, "addAllowance", {
      method: "POST",
      body: JSON.stringify({ bytes: 1_000 }),
    })
    expect(add.response.status).toBe(200)
    expect(add.data?.remainingBytes).toBe(1_000)

    const status = await requestJson(budget, "getChargeStatus")
    expect(status.data).toEqual(
      expect.objectContaining({
        remainingBytes: 1_000,
        lifecycle: "active",
        inGrace: false,
        graceEndsAt: null,
        graceClaimedByRoomId: null,
      }),
    )
  })

  test("enters grace when the first room overdraws the budget", async () => {
    await requestJson(budget, "addAllowance", {
      method: "POST",
      body: JSON.stringify({ bytes: 500 }),
    })

    const charge = await requestJson(budget, "charge", {
      method: "POST",
      body: JSON.stringify({ bytes: 900, roomId: "ROOM1" }),
    })

    expect(charge.response.status).toBe(200)
    expect(charge.data).toEqual(
      expect.objectContaining({
        remainingBytes: 0,
        lifecycle: "in_grace",
        inGrace: true,
        graceClaimedByRoomId: "ROOM1",
      }),
    )
  })

  test("hard-fails other rooms while grace is already claimed", async () => {
    await requestJson(budget, "addAllowance", {
      method: "POST",
      body: JSON.stringify({ bytes: 500 }),
    })

    await requestJson(budget, "charge", {
      method: "POST",
      body: JSON.stringify({ bytes: 900, roomId: "ROOM1" }),
    })

    const secondRoom = await requestJson(budget, "charge", {
      method: "POST",
      body: JSON.stringify({ bytes: 100, roomId: "ROOM2" }),
    })

    expect(secondRoom.response.status).toBe(402)
    expect(secondRoom.data).toEqual(
      expect.objectContaining({
        lifecycle: "exhausted",
        graceClaimedByRoomId: "ROOM1",
      }),
    )
  })

  test("becomes exhausted after grace expiry", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-21T12:00:00.000Z"))

    await requestJson(budget, "addAllowance", {
      method: "POST",
      body: JSON.stringify({ bytes: 100 }),
    })
    await requestJson(budget, "charge", {
      method: "POST",
      body: JSON.stringify({ bytes: 200, roomId: "ROOM1" }),
    })

    vi.advanceTimersByTime(15 * 60 * 1000 + 1)

    const status = await requestJson(budget, "getChargeStatus")
    expect(status.data).toEqual(
      expect.objectContaining({
        lifecycle: "exhausted",
        inGrace: false,
      }),
    )

    vi.useRealTimers()
  })

  test("retires old secret material but keeps version metadata on rotation", async () => {
    const firstRotate = await requestJson(budget, "rotateSecret", { method: "POST" })
    expect(firstRotate.response.status).toBe(200)
    expect(firstRotate.data?.version).toBe(1)

    const secondRotate = await requestJson(budget, "rotateSecret", { method: "POST" })
    expect(secondRotate.response.status).toBe(200)
    expect(secondRotate.data?.version).toBe(2)

    const budgetState = await requestJson(budget, "getBudget")
    expect(budgetState.data?.secretVersions).toEqual([
      expect.objectContaining({
        version: 1,
        hasSecret: false,
      }),
      expect.objectContaining({
        version: 2,
        hasSecret: true,
      }),
    ])

    const retiredSecret = await budget.fetch(
      new Request("http://do.internal/?action=getSecretByVersion&version=1"),
    )
    expect(retiredSecret.status).toBe(410)
  })
})
