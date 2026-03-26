export class TokenUsageLedger {
  private state: DurableObjectState
  private consumedBytes = 0
  private initialized = false

  constructor(state: DurableObjectState) {
    this.state = state
  }

  private async initialize() {
    if (this.initialized) return
    const stored = await this.state.storage.get<number>("consumedBytes")
    this.consumedBytes = stored ?? 0
    this.initialized = true
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize()
    const url = new URL(request.url)
    const action = url.searchParams.get("action")

    if (action === "charge" && request.method === "POST") {
      return this.handleCharge(request)
    }
    if (action === "getUsage") {
      return new Response(JSON.stringify({ consumedBytes: this.consumedBytes }), { status: 200 })
    }
    if (action === "resetUsage" && request.method === "POST") {
      this.consumedBytes = 0
      await this.state.storage.put("consumedBytes", 0)
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 })
  }

  private async handleCharge(request: Request): Promise<Response> {
    const body = (await request.json()) as { bytes: number }
    if (typeof body.bytes !== "number" || body.bytes <= 0) {
      return new Response(JSON.stringify({ error: "Invalid bytes" }), { status: 400 })
    }
    this.consumedBytes += body.bytes
    await this.state.storage.put("consumedBytes", this.consumedBytes)
    return new Response(JSON.stringify({ ok: true, consumedBytes: this.consumedBytes }), {
      status: 200,
    })
  }
}
