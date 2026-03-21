// Durable Object for managing entitlement budget state
// Tracks allowance, secrets, and grace periods for service entitlement

export const GRACE_PERIOD_MS = 5 * 60 * 1000 // 5 minutes grace period

export type SecretVersionRecord = {
  version: number
  createdAt: number
  retiredAt?: number
  secret?: string // undefined after retirement
}

export type EntitlementBudgetState = {
  budgetId: string
  remainingBytes: number
  consumedBytes: number
  currentSecretVersion: number
  secretVersions: SecretVersionRecord[]
  lastChargedAt: number | null
  graceEndsAt: number | null
}

export type ChargeResult =
  | {
      ok: true
      remainingBytes: number
      consumedBytes: number
      inGrace: boolean
      graceEndsAt: number | null
    }
  | { ok: false; reason: "exhausted"; remainingBytes: 0; graceEndsAt: number | null }

export class EntitlementBudget {
  private state: DurableObjectState
  private budgetId: string = ""
  private remainingBytes: number = 0
  private consumedBytes: number = 0
  private currentSecretVersion: number = 0
  private secretVersions: SecretVersionRecord[] = []
  private lastChargedAt: number | null = null
  private graceEndsAt: number | null = null
  private initialized: boolean = false

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async initialize() {
    if (this.initialized) return

    const stored = await this.state.storage.get<EntitlementBudgetState>("budget")

    if (stored) {
      this.budgetId = stored.budgetId
      this.remainingBytes = stored.remainingBytes
      this.consumedBytes = stored.consumedBytes
      this.currentSecretVersion = stored.currentSecretVersion
      this.secretVersions = stored.secretVersions
      this.lastChargedAt = stored.lastChargedAt ?? null
      this.graceEndsAt = stored.graceEndsAt ?? null
      console.log(
        `[EntitlementBudget] Loaded budget ${this.budgetId.slice(0, 8)}, remaining: ${this.remainingBytes}`,
      )
    } else {
      // New budget - generate ID and initialize
      this.budgetId = crypto.randomUUID()
      this.remainingBytes = 0
      this.consumedBytes = 0
      this.currentSecretVersion = 0
      this.secretVersions = []
      this.lastChargedAt = null
      this.graceEndsAt = null
      console.log(`[EntitlementBudget] Created new budget ${this.budgetId.slice(0, 8)}`)
      await this.persist()
    }

    this.initialized = true
  }

  private async persist() {
    await this.state.storage.put("budget", {
      budgetId: this.budgetId,
      remainingBytes: this.remainingBytes,
      consumedBytes: this.consumedBytes,
      currentSecretVersion: this.currentSecretVersion,
      secretVersions: this.secretVersions,
      lastChargedAt: this.lastChargedAt,
      graceEndsAt: this.graceEndsAt,
    } satisfies EntitlementBudgetState)
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize()

    const url = new URL(request.url)
    const action = url.searchParams.get("action")

    console.log(`[EntitlementBudget] action=${action}, budget=${this.budgetId.slice(0, 8)}`)

    try {
      switch (action) {
        case "getBudget":
          return this.handleGetBudget()

        case "setAllowance":
          return this.handleSetAllowance(request)

        case "consume":
          return this.handleConsume(request)

        case "charge":
          return this.handleCharge(request)

        case "getChargeStatus":
          return this.handleGetChargeStatus()

        case "rotateSecret":
          return this.handleRotateSecret()

        case "getCurrentSecret":
          return this.handleGetCurrentSecret()

        case "getSecretByVersion": {
          const version = parseInt(url.searchParams.get("version") || "0", 10)
          return this.handleGetSecretByVersion(version)
        }

        default:
          return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 })
      }
    } catch (error) {
      console.error("[EntitlementBudget] Error:", error)
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
    }
  }

  private handleGetBudget(): Response {
    return new Response(
      JSON.stringify({
        budgetId: this.budgetId,
        remainingBytes: this.remainingBytes,
        consumedBytes: this.consumedBytes,
        currentSecretVersion: this.currentSecretVersion,
        secretVersions: this.secretVersions.map((sv) => ({
          version: sv.version,
          createdAt: sv.createdAt,
          retiredAt: sv.retiredAt,
          // Don't expose secret material in list
          hasSecret: !!sv.secret,
        })),
        lastChargedAt: this.lastChargedAt,
        graceEndsAt: this.graceEndsAt,
        inGrace: this.isInGrace(),
      }),
      { status: 200 },
    )
  }

  private async handleSetAllowance(request: Request): Promise<Response> {
    const body = (await request.json()) as { bytes: number }
    const bytes = body.bytes

    if (typeof bytes !== "number" || bytes < 0) {
      return new Response(JSON.stringify({ error: "Invalid bytes value" }), { status: 400 })
    }

    this.remainingBytes = bytes
    await this.persist()

    return new Response(JSON.stringify({ ok: true, remainingBytes: this.remainingBytes }), {
      status: 200,
    })
  }

  private async handleConsume(request: Request): Promise<Response> {
    const body = (await request.json()) as { bytes: number }
    const bytes = body.bytes

    if (typeof bytes !== "number" || bytes <= 0) {
      return new Response(JSON.stringify({ error: "Invalid bytes value" }), { status: 400 })
    }

    if (this.remainingBytes < bytes) {
      return new Response(
        JSON.stringify({
          error: "Budget exhausted",
          remainingBytes: this.remainingBytes,
          requestedBytes: bytes,
        }),
        { status: 403 },
      )
    }

    this.remainingBytes -= bytes
    this.consumedBytes += bytes
    await this.persist()

    return new Response(
      JSON.stringify({
        ok: true,
        remainingBytes: this.remainingBytes,
        consumedBytes: this.consumedBytes,
      }),
      { status: 200 },
    )
  }

  /**
   * Charge the budget for usage. Enters grace period if budget exhausted.
   */
  private async handleCharge(request: Request): Promise<Response> {
    const body = (await request.json()) as { bytes: number }
    const bytes = body.bytes

    if (typeof bytes !== "number" || bytes <= 0) {
      return new Response(JSON.stringify({ error: "Invalid bytes value" }), { status: 400 })
    }

    const result = await this.charge(bytes)

    if (!result.ok) {
      return new Response(
        JSON.stringify({
          error: "Budget exhausted",
          graceEndsAt: result.graceEndsAt,
          inGrace: true,
        }),
        { status: 402 }, // PAYMENT_REQUIRED
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        remainingBytes: result.remainingBytes,
        consumedBytes: result.consumedBytes,
        inGrace: result.inGrace,
        graceEndsAt: result.graceEndsAt,
      }),
      { status: 200 },
    )
  }

  /**
   * Charge the budget. Returns success/failure and grace status.
   */
  async charge(bytes: number): Promise<ChargeResult> {
    const now = Date.now()
    this.lastChargedAt = now

    // Check if already in grace and grace has expired
    if (this.graceEndsAt && now > this.graceEndsAt) {
      return {
        ok: false,
        reason: "exhausted",
        remainingBytes: 0,
        graceEndsAt: this.graceEndsAt,
      }
    }

    // Calculate how much we can actually consume
    const consumeAmount = Math.min(bytes, this.remainingBytes)
    this.remainingBytes -= consumeAmount
    this.consumedBytes += consumeAmount

    // Check if we entered grace (partial or full depletion)
    const remainingAfterCharge = bytes - consumeAmount
    if (remainingAfterCharge > 0 && !this.graceEndsAt) {
      // Enter grace period
      this.graceEndsAt = now + GRACE_PERIOD_MS
      console.log(
        `[EntitlementBudget] Entering grace until ${new Date(this.graceEndsAt).toISOString()}`,
      )
    }

    await this.persist()

    return {
      ok: true,
      remainingBytes: this.remainingBytes,
      consumedBytes: this.consumedBytes,
      inGrace: this.isInGrace(),
      graceEndsAt: this.graceEndsAt,
    }
  }

  private handleGetChargeStatus(): Response {
    const now = Date.now()
    const inGrace = this.isInGrace()
    const graceExpired = this.graceEndsAt ? now > this.graceEndsAt : false

    return new Response(
      JSON.stringify({
        budgetId: this.budgetId,
        remainingBytes: this.remainingBytes,
        consumedBytes: this.consumedBytes,
        lastChargedAt: this.lastChargedAt,
        graceEndsAt: this.graceEndsAt,
        inGrace,
        graceExpired,
        graceRemainingMs: inGrace && this.graceEndsAt ? Math.max(0, this.graceEndsAt - now) : 0,
      }),
      { status: 200 },
    )
  }

  private isInGrace(): boolean {
    if (!this.graceEndsAt) return false
    return Date.now() < this.graceEndsAt
  }

  private async handleRotateSecret(): Promise<Response> {
    // Retire current secret if exists
    const current = this.secretVersions.find((sv) => sv.version === this.currentSecretVersion)
    if (current) {
      current.retiredAt = Date.now()
      delete current.secret // Drop secret material
    }

    // Generate new secret
    const newVersion = this.currentSecretVersion + 1
    const newSecretBytes = new Uint8Array(32)
    crypto.getRandomValues(newSecretBytes)
    const newSecret = Array.from(newSecretBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")

    this.secretVersions.push({
      version: newVersion,
      createdAt: Date.now(),
      secret: newSecret,
    })

    this.currentSecretVersion = newVersion
    await this.persist()

    return new Response(
      JSON.stringify({
        ok: true,
        version: newVersion,
        secret: newSecret, // Only returned at creation time
      }),
      { status: 200 },
    )
  }

  private handleGetCurrentSecret(): Response {
    const current = this.secretVersions.find((sv) => sv.version === this.currentSecretVersion)

    if (!current || !current.secret) {
      return new Response(JSON.stringify({ error: "No active secret" }), { status: 404 })
    }

    return new Response(
      JSON.stringify({
        version: current.version,
        secret: current.secret,
      }),
      { status: 200 },
    )
  }

  private handleGetSecretByVersion(version: number): Response {
    const sv = this.secretVersions.find((sv) => sv.version === version)

    if (!sv) {
      return new Response(JSON.stringify({ error: "Secret version not found" }), { status: 404 })
    }

    if (!sv.secret) {
      return new Response(JSON.stringify({ error: "Secret material retired" }), { status: 410 })
    }

    return new Response(
      JSON.stringify({
        version: sv.version,
        secret: sv.secret,
      }),
      { status: 200 },
    )
  }

  // Public accessors for use within the same DO instance
  getBudgetId(): string {
    return this.budgetId
  }

  getRemainingBytes(): number {
    return this.remainingBytes
  }

  getCurrentSecretVersion(): number {
    return this.currentSecretVersion
  }

  getGraceEndsAt(): number | null {
    return this.graceEndsAt
  }

  async ensureSecret(): Promise<{ version: number; secret: string } | null> {
    const current = this.secretVersions.find((sv) => sv.version === this.currentSecretVersion)
    if (current && current.secret) {
      return { version: current.version, secret: current.secret }
    }

    // No active secret - rotate to create one
    const response = await this.handleRotateSecret()
    const data = (await response.json()) as { version: number; secret: string }
    return { version: data.version, secret: data.secret }
  }
}
