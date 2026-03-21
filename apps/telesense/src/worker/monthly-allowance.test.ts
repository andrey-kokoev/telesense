import { beforeEach, describe, expect, test, vi } from "vite-plus/test"
import { computeNextCronOccurrence, MonthlyAllowance } from "./monthly-allowance"

class MemoryStorage {
  private data = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
  }
}

function createMonthlyAllowance() {
  const state = {
    storage: new MemoryStorage(),
  } as unknown as DurableObjectState

  return new MonthlyAllowance(state)
}

async function requestJson(allowance: MonthlyAllowance, action: string, init?: RequestInit) {
  const response = await allowance.fetch(new Request(`http://do.internal/?action=${action}`, init))
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
  return { response, data }
}

describe("MonthlyAllowance", () => {
  let allowance: MonthlyAllowance

  beforeEach(() => {
    allowance = createMonthlyAllowance()
  })

  test("computes the next cron occurrence", () => {
    const next = computeNextCronOccurrence("0 0 1 * *", Date.UTC(2026, 2, 21, 12, 34, 56))
    expect(new Date(next).toISOString()).toBe("2026-04-01T00:00:00.000Z")
  })

  test("configures monthly allowance and marks it scheduled", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-21T12:00:00.000Z"))

    const configured = await requestJson(allowance, "configure", {
      method: "POST",
      body: JSON.stringify({
        budgetId: "budget-a",
        resetAmountBytes: 123,
        cronExpr: "0 0 1 * *",
        active: true,
      }),
    })

    expect(configured.response.status).toBe(200)
    expect(configured.data).toEqual(
      expect.objectContaining({
        budgetId: "budget-a",
        resetAmountBytes: 123,
        lifecycle: "scheduled",
      }),
    )

    vi.useRealTimers()
  })

  test("becomes due once nextResetAt has passed and advances after acknowledgement", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-31T23:59:00.000Z"))

    await requestJson(allowance, "configure", {
      method: "POST",
      body: JSON.stringify({
        budgetId: "budget-a",
        resetAmountBytes: 123,
        cronExpr: "0 0 1 * *",
        active: true,
      }),
    })

    vi.advanceTimersByTime(60 * 1000)

    const dueStatus = await requestJson(allowance, "getStatus")
    expect(dueStatus.data).toEqual(
      expect.objectContaining({
        lifecycle: "due",
      }),
    )

    const acknowledged = await requestJson(allowance, "acknowledgeReset", {
      method: "POST",
      body: JSON.stringify({ appliedAt: Date.now() }),
    })
    expect(acknowledged.data).toEqual(
      expect.objectContaining({
        lifecycle: "scheduled",
      }),
    )

    vi.useRealTimers()
  })

  test("stays inactive until explicitly configured active", async () => {
    const status = await requestJson(allowance, "getStatus")
    expect(status.data).toEqual(
      expect.objectContaining({
        active: false,
        lifecycle: "inactive",
      }),
    )
  })
})
