type CronField = number[] | null

export type MonthlyAllowanceLifecycle = "inactive" | "scheduled" | "due"

export type MonthlyAllowanceState = {
  budgetId: string
  resetAmountBytes: number
  cronExpr: string
  active: boolean
  nextResetAt: number | null
  lastResetAt: number | null
}

function parseCronField(field: string, min: number, max: number): CronField {
  if (field === "*") return null

  const values = field
    .split(",")
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isInteger(value) && value >= min && value <= max)

  if (values.length === 0 || values.length !== field.split(",").length) {
    throw new Error(`Invalid cron field: ${field}`)
  }

  return [...new Set(values)].sort((a, b) => a - b)
}

function matchesCronField(field: CronField, value: number) {
  return field === null || field.includes(value)
}

export function computeNextCronOccurrence(cronExpr: string, fromMs: number): number {
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error("cronExpr must have 5 fields")
  }

  const [minuteField, hourField, dayField, monthField, weekdayField] = parts
  const minute = parseCronField(minuteField, 0, 59)
  const hour = parseCronField(hourField, 0, 23)
  const day = parseCronField(dayField, 1, 31)
  const month = parseCronField(monthField, 1, 12)
  const weekday = parseCronField(weekdayField, 0, 6)

  const current = new Date(fromMs)
  current.setUTCSeconds(0, 0)
  current.setUTCMinutes(current.getUTCMinutes() + 1)

  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (
      matchesCronField(month, current.getUTCMonth() + 1) &&
      matchesCronField(day, current.getUTCDate()) &&
      matchesCronField(weekday, current.getUTCDay()) &&
      matchesCronField(hour, current.getUTCHours()) &&
      matchesCronField(minute, current.getUTCMinutes())
    ) {
      return current.getTime()
    }
    current.setUTCMinutes(current.getUTCMinutes() + 1)
  }

  throw new Error("Could not compute next cron occurrence within one year")
}

export class MonthlyAllowance {
  private state: DurableObjectState
  private budgetId = ""
  private resetAmountBytes = 0
  private cronExpr = "0 0 1 * *"
  private active = false
  private nextResetAt: number | null = null
  private lastResetAt: number | null = null
  private initialized = false

  constructor(state: DurableObjectState) {
    this.state = state
  }

  private async initialize() {
    if (this.initialized) return

    const stored = await this.state.storage.get<MonthlyAllowanceState>("monthly-allowance")
    if (stored) {
      this.budgetId = stored.budgetId
      this.resetAmountBytes = stored.resetAmountBytes
      this.cronExpr = stored.cronExpr
      this.active = stored.active
      this.nextResetAt = stored.nextResetAt
      this.lastResetAt = stored.lastResetAt
    }

    this.initialized = true
  }

  private async persist() {
    await this.state.storage.put("monthly-allowance", {
      budgetId: this.budgetId,
      resetAmountBytes: this.resetAmountBytes,
      cronExpr: this.cronExpr,
      active: this.active,
      nextResetAt: this.nextResetAt,
      lastResetAt: this.lastResetAt,
    } satisfies MonthlyAllowanceState)
  }

  private getLifecycle(now = Date.now()): MonthlyAllowanceLifecycle {
    if (!this.active) return "inactive"
    if (this.nextResetAt !== null && now >= this.nextResetAt) return "due"
    return "scheduled"
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize()

    const url = new URL(request.url)
    const action = url.searchParams.get("action")

    try {
      switch (action) {
        case "configure":
          return this.handleConfigure(request)
        case "getStatus":
          return this.handleGetStatus()
        case "acknowledgeReset":
          return this.handleAcknowledgeReset(request)
        default:
          return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 })
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
    }
  }

  private async handleConfigure(request: Request) {
    const body = (await request.json()) as {
      budgetId: string
      resetAmountBytes: number
      cronExpr: string
      active: boolean
    }

    if (!body.budgetId) {
      return new Response(JSON.stringify({ error: "budgetId required" }), { status: 400 })
    }
    if (!Number.isFinite(body.resetAmountBytes) || body.resetAmountBytes < 0) {
      return new Response(JSON.stringify({ error: "resetAmountBytes must be >= 0" }), {
        status: 400,
      })
    }

    this.budgetId = body.budgetId
    this.resetAmountBytes = body.resetAmountBytes
    this.cronExpr = body.cronExpr
    this.active = body.active
    this.nextResetAt = body.active ? computeNextCronOccurrence(body.cronExpr, Date.now()) : null

    await this.persist()

    return this.handleGetStatus()
  }

  private handleGetStatus() {
    const lifecycle = this.getLifecycle()
    return new Response(
      JSON.stringify({
        budgetId: this.budgetId,
        resetAmountBytes: this.resetAmountBytes,
        cronExpr: this.cronExpr,
        active: this.active,
        nextResetAt: this.nextResetAt,
        lastResetAt: this.lastResetAt,
        lifecycle,
      }),
      { status: 200 },
    )
  }

  private async handleAcknowledgeReset(request: Request) {
    const body = (await request.json()) as { appliedAt?: number }
    const appliedAt = body.appliedAt ?? Date.now()

    if (!this.active) {
      return new Response(JSON.stringify({ error: "Monthly allowance inactive" }), { status: 409 })
    }

    this.lastResetAt = appliedAt
    this.nextResetAt = computeNextCronOccurrence(this.cronExpr, appliedAt)
    await this.persist()

    return this.handleGetStatus()
  }
}
