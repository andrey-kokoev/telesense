import { beforeEach, describe, expect, test, vi } from "vite-plus/test"
import worker, { app, CallRoom, EntitlementBudget, MonthlyAllowance } from "./index"
import { mintHostAdminSessionToken } from "./host-admin-auth"

class MemoryStorage {
  private data = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
  }
}

type BudgetRegistryRow = {
  budget_key: string
  budget_id: string
  label: string | null
  created_at: number
  updated_at: number
}

type MonthlyAllowanceRegistryRow = {
  allowance_id: string
  budget_key: string
  active: number
  cron_expr: string
  created_at: number
  updated_at: number
}

class MemoryD1PreparedStatement {
  private bindings: unknown[] = []

  constructor(
    private db: MemoryD1Database,
    private query: string,
  ) {}

  bind(...values: unknown[]) {
    this.bindings = values
    return this
  }

  async run() {
    this.db.execute(this.query, this.bindings)
    return { success: true }
  }

  async all<T>() {
    return { results: this.db.query<T>(this.query, this.bindings) }
  }

  async first<T>() {
    return (this.db.query<T>(this.query, this.bindings)[0] ?? null) as T | null
  }
}

class MemoryD1Database {
  budgets = new Map<string, BudgetRegistryRow>()
  monthlyAllowances = new Map<string, MonthlyAllowanceRegistryRow>()

  prepare(query: string) {
    return new MemoryD1PreparedStatement(this, query)
  }

  execute(query: string, bindings: unknown[]) {
    if (query.includes("INSERT INTO entitlement_budgets")) {
      const [budgetKey, budgetId, label, createdAt, updatedAt] = bindings as [
        string,
        string,
        string | null,
        number,
        number,
      ]
      const existing = this.budgets.get(budgetKey)
      this.budgets.set(budgetKey, {
        budget_key: budgetKey,
        budget_id: budgetId,
        label: label ?? existing?.label ?? null,
        created_at: existing?.created_at ?? createdAt,
        updated_at: updatedAt,
      })
      return
    }

    if (query.includes("INSERT INTO monthly_allowances")) {
      const [allowanceId, budgetKey, active, cronExpr, createdAt, updatedAt] = bindings as [
        string,
        string,
        number,
        string,
        number,
        number,
      ]
      const existing = this.monthlyAllowances.get(allowanceId)
      this.monthlyAllowances.set(allowanceId, {
        allowance_id: allowanceId,
        budget_key: budgetKey,
        active,
        cron_expr: cronExpr,
        created_at: existing?.created_at ?? createdAt,
        updated_at: updatedAt,
      })
    }

    if (query.includes("UPDATE entitlement_budgets")) {
      const [budgetKey, label, updatedAt] = bindings as [string, string | null, number]
      const existing = this.budgets.get(budgetKey)
      if (!existing) return
      this.budgets.set(budgetKey, {
        ...existing,
        label,
        updated_at: updatedAt,
      })
    }
  }

  query<T>(query: string, bindings: unknown[]) {
    if (query.includes("FROM entitlement_budgets") && query.includes("WHERE budget_id")) {
      const [budgetId] = bindings as [string]
      const match = Array.from(this.budgets.values()).find((row) => row.budget_id === budgetId)
      return (match ? [{ budget_key: match.budget_key }] : []) as T[]
    }

    if (query.includes("FROM entitlement_budgets")) {
      return Array.from(this.budgets.values()).sort(
        (a, b) => b.updated_at - a.updated_at || b.created_at - a.created_at,
      ) as T[]
    }

    if (query.includes("FROM monthly_allowances")) {
      return Array.from(this.monthlyAllowances.values()).sort(
        (a, b) => b.updated_at - a.updated_at || b.created_at - a.created_at,
      ) as T[]
    }

    return []
  }
}

function createBudgetStub() {
  const state = { storage: new MemoryStorage() } as unknown as DurableObjectState
  const budget = new EntitlementBudget(state)
  return {
    budget,
    fetch: (request: Request) => budget.fetch(request),
  }
}

function createMonthlyAllowanceStub() {
  const state = { storage: new MemoryStorage() } as unknown as DurableObjectState
  const monthlyAllowance = new MonthlyAllowance(state)
  return {
    monthlyAllowance,
    fetch: (request: Request) => monthlyAllowance.fetch(request),
  }
}

function createCallRoomNamespace() {
  const rooms = new Map<string, CallRoom>()

  const namespace = {
    idFromName(name: string) {
      return { toString: () => name } as unknown as DurableObjectId
    },
    get(id: DurableObjectId) {
      const name = id.toString()
      if (!rooms.has(name)) {
        const state = { storage: new MemoryStorage() } as unknown as DurableObjectState
        rooms.set(name, new CallRoom(state))
      }
      const room = rooms.get(name)!
      return {
        fetch: (request: Request) => room.fetch(request),
      } as DurableObjectStub
    },
  } as unknown as DurableObjectNamespace

  return { namespace, rooms }
}

function createNamespace(stub: { fetch: DurableObjectStub["fetch"] }): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as unknown as DurableObjectId
    },
    get() {
      return stub
    },
  } as unknown as DurableObjectNamespace
}

type TestEnv = {
  REALTIME_APP_ID: string
  CF_CALLS_SECRET: string
  SERVICE_ENTITLEMENT_TOKEN: string
  HOST_ADMIN_BOOTSTRAP_TOKEN: string
  SERVICE_ENTITLEMENT_ALLOWANCE_BYTES: string
  GLOBAL_ENTITLEMENT_BUDGET_ID?: string
  GLOBAL_MONTHLY_ALLOWANCE_ID?: string
  DO_NOT_ENFORCE_SERVICE_ENTITLEMENT?: string
  DEBUG?: string
  HOST_ADMIN_DB?: D1Database
  CALL_ROOMS: DurableObjectNamespace
  ENTITLEMENT_BUDGETS: DurableObjectNamespace
  MONTHLY_ALLOWANCES: DurableObjectNamespace
}

describe("entitlement routes", () => {
  let env: TestEnv
  let budgetStub: ReturnType<typeof createBudgetStub>
  let monthlyAllowanceStub: ReturnType<typeof createMonthlyAllowanceStub>
  let callRooms: ReturnType<typeof createCallRoomNamespace>
  let hostAdminDb: MemoryD1Database
  let nextCloudflareSessionId: number

  beforeEach(() => {
    budgetStub = createBudgetStub()
    monthlyAllowanceStub = createMonthlyAllowanceStub()
    callRooms = createCallRoomNamespace()
    hostAdminDb = new MemoryD1Database()
    nextCloudflareSessionId = 1

    env = {
      REALTIME_APP_ID: "app-id",
      CF_CALLS_SECRET: "cf-secret",
      SERVICE_ENTITLEMENT_TOKEN: "admin-secret",
      HOST_ADMIN_BOOTSTRAP_TOKEN: "host-admin-secret",
      SERVICE_ENTITLEMENT_ALLOWANCE_BYTES: "1000",
      GLOBAL_ENTITLEMENT_BUDGET_ID: "global-budget",
      GLOBAL_MONTHLY_ALLOWANCE_ID: "global-monthly",
      HOST_ADMIN_DB: hostAdminDb as unknown as D1Database,
      CALL_ROOMS: callRooms.namespace,
      ENTITLEMENT_BUDGETS: createNamespace(budgetStub),
      MONTHLY_ALLOWANCES: createNamespace(monthlyAllowanceStub),
    }

    vi.restoreAllMocks()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | Request | URL) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

        if (url.includes("/sessions/new")) {
          return new Response(
            JSON.stringify({
              sessionId: `cf-session-${nextCloudflareSessionId++}`,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          )
        }

        throw new Error(`Unexpected fetch in test: ${url}`)
      }),
    )
  })

  async function adminSessionHeaders() {
    return {
      "X-Host-Admin-Session": await mintHostAdminSessionToken(env.HOST_ADMIN_BOOTSTRAP_TOKEN),
    }
  }

  test("/admin/auth/exchange returns a host admin session token", async () => {
    const response = await app.request(
      "http://example.test/admin/auth/exchange",
      {
        method: "POST",
        headers: { "X-Host-Admin-Token": "host-admin-secret" },
      },
      env,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        hostAdminSessionToken: expect.any(String),
      }),
    )
  })

  test("/admin/entitlement/mint requires a host admin session", async () => {
    const response = await app.request(
      "http://example.test/admin/entitlement/mint",
      {
        method: "POST",
      },
      env,
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "HOST_ADMIN_SESSION_REQUIRED" }),
    )
  })

  test("/admin/entitlement/mint returns a usable token without changing allowance", async () => {
    await budgetStub.budget.fetch(
      new Request("http://do.internal/?action=addAllowance", {
        method: "POST",
        body: JSON.stringify({ bytes: 1_000 }),
      }),
    )

    const budgetBeforeRes = await app.request(
      "http://example.test/admin/entitlement/budget",
      {
        headers: await adminSessionHeaders(),
      },
      env,
    )
    expect(budgetBeforeRes.status).toBe(200)
    const budgetBefore = (await budgetBeforeRes.json()) as {
      allowance: { remainingBytes: number }
    }

    const mintResponse = await app.request(
      "http://example.test/admin/entitlement/mint",
      {
        method: "POST",
        headers: await adminSessionHeaders(),
      },
      env,
    )

    expect(mintResponse.status).toBe(200)
    const minted = (await mintResponse.json()) as {
      serviceEntitlementToken: string
      remainingBytes: number
      budgetId: string
    }

    expect(minted.remainingBytes).toBe(budgetBefore.allowance.remainingBytes)
    expect(typeof minted.serviceEntitlementToken).toBe("string")
    expect(minted.budgetId).toBeTruthy()

    const verifyResponse = await app.request(
      "http://example.test/api/auth/verify",
      {
        headers: { "X-Service-Entitlement-Token": minted.serviceEntitlementToken },
      },
      env,
    )

    expect(verifyResponse.status).toBe(200)
    await expect(verifyResponse.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        budgetId: minted.budgetId,
        remainingBytes: budgetBefore.allowance.remainingBytes,
      }),
    )
  })

  test("/api/auth/verify rejects invalid entitlement tokens", async () => {
    const mintResponse = await app.request(
      "http://example.test/admin/entitlement/mint",
      {
        method: "POST",
        headers: await adminSessionHeaders(),
      },
      env,
    )
    expect(mintResponse.status).toBe(200)

    const response = await app.request(
      "http://example.test/api/auth/verify",
      {
        headers: { "X-Service-Entitlement-Token": "bad-token" },
      },
      env,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "SERVICE_ENTITLEMENT_INVALID" }),
    )
  })

  test("/admin/entitlement/rotate invalidates previously minted tokens", async () => {
    const mintResponse = await app.request(
      "http://example.test/admin/entitlement/mint",
      {
        method: "POST",
        headers: await adminSessionHeaders(),
      },
      env,
    )
    const minted = (await mintResponse.json()) as {
      serviceEntitlementToken: string
    }

    const rotateResponse = await app.request(
      "http://example.test/admin/entitlement/rotate",
      {
        method: "POST",
        headers: await adminSessionHeaders(),
      },
      env,
    )
    expect(rotateResponse.status).toBe(200)

    const staleVerify = await app.request(
      "http://example.test/api/auth/verify",
      {
        headers: { "X-Service-Entitlement-Token": minted.serviceEntitlementToken },
      },
      env,
    )

    expect(staleVerify.status).toBe(403)
    await expect(staleVerify.json()).resolves.toEqual(
      expect.objectContaining({ code: "SERVICE_ENTITLEMENT_INVALID" }),
    )
  })

  test("existing room joins ignore later invalid tokens and keep the original budget binding", async () => {
    await budgetStub.budget.fetch(
      new Request("http://do.internal/?action=addAllowance", {
        method: "POST",
        body: JSON.stringify({ bytes: 1_000 }),
      }),
    )

    const mintResponse = await app.request(
      "http://example.test/admin/entitlement/mint",
      {
        method: "POST",
        headers: await adminSessionHeaders(),
      },
      env,
    )
    const minted = (await mintResponse.json()) as {
      serviceEntitlementToken: string
      budgetId: string
    }

    const firstJoin = await app.request(
      "http://example.test/api/rooms/ROOM1/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Entitlement-Token": minted.serviceEntitlementToken,
        },
        body: JSON.stringify({ browserInstanceId: "browser-a" }),
      },
      env,
    )
    expect(firstJoin.status).toBe(200)

    const secondJoin = await app.request(
      "http://example.test/api/rooms/ROOM1/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Service-Entitlement-Token": "bad-token" },
        body: JSON.stringify({ browserInstanceId: "browser-b" }),
      },
      env,
    )
    expect(secondJoin.status).toBe(200)

    const room = callRooms.rooms.get("ROOM1")
    expect(room).toBeTruthy()

    const budgetLookup = await room!.fetch(new Request("http://do.internal/?action=getBudgetId"))
    await expect(budgetLookup.json()).resolves.toEqual(
      expect.objectContaining({
        budgetId: minted.budgetId,
      }),
    )
  })

  test("shared budget gives grace to the first room and hard-stops the second room", async () => {
    const budget = budgetStub.budget
    await budget.fetch(
      new Request("http://do.internal/?action=addAllowance", {
        method: "POST",
        body: JSON.stringify({ bytes: 100 }),
      }),
    )

    const roomA = callRooms.namespace.get(callRooms.namespace.idFromName("ROOMA"))
    const roomB = callRooms.namespace.get(callRooms.namespace.idFromName("ROOMB"))

    await roomA.fetch(
      new Request("http://do.internal/?action=setBudgetId", {
        method: "POST",
        body: JSON.stringify({
          budgetId: budget.getBudgetId(),
          budgetKey: "global-budget",
          roomId: "ROOMA",
        }),
      }),
    )
    await roomB.fetch(
      new Request("http://do.internal/?action=setBudgetId", {
        method: "POST",
        body: JSON.stringify({
          budgetId: budget.getBudgetId(),
          budgetKey: "global-budget",
          roomId: "ROOMB",
        }),
      }),
    )

    const authA = await roomA.fetch(
      new Request("http://do.internal/?action=authorizeParticipant", {
        method: "POST",
        body: JSON.stringify({ participantId: "participant-a" }),
      }),
    )
    const authAData = (await authA.json()) as { participantSecret: string }
    await roomA.fetch(
      new Request("http://do.internal/?action=createSession", {
        method: "POST",
        body: JSON.stringify({
          internalId: "session-a",
          participantId: "participant-a",
          participantSecret: authAData.participantSecret,
          cfSessionId: "cf-a",
        }),
      }),
    )

    const authB = await roomB.fetch(
      new Request("http://do.internal/?action=authorizeParticipant", {
        method: "POST",
        body: JSON.stringify({ participantId: "participant-b" }),
      }),
    )
    const authBData = (await authB.json()) as { participantSecret: string }
    await roomB.fetch(
      new Request("http://do.internal/?action=createSession", {
        method: "POST",
        body: JSON.stringify({
          internalId: "session-b",
          participantId: "participant-b",
          participantSecret: authBData.participantSecret,
          cfSessionId: "cf-b",
        }),
      }),
    )

    const roomACharge = await app.request(
      "http://example.test/api/rooms/ROOMA/meter",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bytes: 200,
          budgetId: budget.getBudgetId(),
          budgetKey: "global-budget",
        }),
      },
      env,
    )
    expect(roomACharge.status).toBe(200)
    await expect(roomACharge.json()).resolves.toEqual(
      expect.objectContaining({
        lifecycle: "in_grace",
        graceClaimedByRoomId: "ROOMA",
      }),
    )

    const roomBCharge = await app.request(
      "http://example.test/api/rooms/ROOMB/meter",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bytes: 50,
          budgetId: budget.getBudgetId(),
          budgetKey: "global-budget",
        }),
      },
      env,
    )
    expect(roomBCharge.status).toBe(402)
    await expect(roomBCharge.json()).resolves.toEqual(
      expect.objectContaining({
        code: "SERVICE_BUDGET_EXHAUSTED",
        lifecycle: "exhausted",
        graceClaimedByRoomId: "ROOMA",
      }),
    )

    const roomAState = await roomA.fetch(new Request("http://do.internal/?action=getState"))
    await expect(roomAState.json()).resolves.toEqual(
      expect.objectContaining({
        lifecycle: "in_grace",
        participantCount: 1,
      }),
    )

    const roomBState = await roomB.fetch(new Request("http://do.internal/?action=getState"))
    await expect(roomBState.json()).resolves.toEqual(
      expect.objectContaining({
        lifecycle: "terminated",
        participantCount: 0,
      }),
    )
  })

  test("scheduled handler does nothing when monthly allowance is inactive", async () => {
    await budgetStub.budget.fetch(
      new Request("http://do.internal/?action=setAllowance", {
        method: "POST",
        body: JSON.stringify({ bytes: 123 }),
      }),
    )

    await worker.scheduled?.({} as ScheduledEvent, env as never, {} as ExecutionContext)

    const budgetState = await budgetStub.budget.fetch(
      new Request("http://do.internal/?action=getBudget"),
    )
    await expect(budgetState.json()).resolves.toEqual(
      expect.objectContaining({
        remainingBytes: 123,
      }),
    )
  })

  test("scheduled handler resets the shared budget when monthly allowance is due", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-31T23:59:00.000Z"))

    const configureResponse = await app.request(
      "http://example.test/admin/entitlement/monthly-allowance",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await adminSessionHeaders()),
        },
        body: JSON.stringify({
          active: true,
          resetAmountBytes: 5000,
          cronExpr: "0 0 1 * *",
        }),
      },
      env,
    )
    expect(configureResponse.status).toBe(200)

    await worker.scheduled?.({} as ScheduledEvent, env as never, {} as ExecutionContext)

    await budgetStub.budget.fetch(
      new Request("http://do.internal/?action=setAllowance", {
        method: "POST",
        body: JSON.stringify({ bytes: 25 }),
      }),
    )

    vi.advanceTimersByTime(60 * 1000)

    await worker.scheduled?.({} as ScheduledEvent, env as never, {} as ExecutionContext)

    const budgetState = await budgetStub.budget.fetch(
      new Request("http://do.internal/?action=getBudget"),
    )
    await expect(budgetState.json()).resolves.toEqual(
      expect.objectContaining({
        remainingBytes: 5000,
      }),
    )

    const monthlyStatus = await monthlyAllowanceStub.monthlyAllowance.fetch(
      new Request("http://do.internal/?action=getStatus"),
    )
    await expect(monthlyStatus.json()).resolves.toEqual(
      expect.objectContaining({
        active: true,
        lifecycle: "scheduled",
        resetAmountBytes: 5000,
        budgetKey: "global-budget",
      }),
    )

    vi.useRealTimers()
  })

  test("scheduled handler ignores invalid reset configuration", async () => {
    await budgetStub.budget.fetch(
      new Request("http://do.internal/?action=setAllowance", {
        method: "POST",
        body: JSON.stringify({ bytes: 321 }),
      }),
    )

    await worker.scheduled?.({} as ScheduledEvent, env as never, {} as ExecutionContext)

    const budgetState = await budgetStub.budget.fetch(
      new Request("http://do.internal/?action=getBudget"),
    )
    await expect(budgetState.json()).resolves.toEqual(
      expect.objectContaining({
        remainingBytes: 321,
      }),
    )
  })

  test("/admin/entitlement/monthly-allowance requires admin auth", async () => {
    const response = await app.request(
      "http://example.test/admin/entitlement/monthly-allowance",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: true,
          resetAmountBytes: 5000,
          cronExpr: "0 0 1 * *",
        }),
      },
      env,
    )

    expect(response.status).toBe(401)
  })

  test("/admin/entitlement/monthly-allowance configures DO-backed policy", async () => {
    const response = await app.request(
      "http://example.test/admin/entitlement/monthly-allowance",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await adminSessionHeaders()),
        },
        body: JSON.stringify({
          active: true,
          resetAmountBytes: 5000,
          cronExpr: "0 0 1 * *",
        }),
      },
      env,
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        active: true,
        resetAmountBytes: 5000,
        cronExpr: "0 0 1 * *",
        lifecycle: "scheduled",
      }),
    )
  })

  test("/admin/entitlement/monthly-allowance/reset restores the seeded default policy", async () => {
    await app.request(
      "http://example.test/admin/entitlement/monthly-allowance",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await adminSessionHeaders()),
        },
        body: JSON.stringify({
          active: false,
          resetAmountBytes: 0,
          cronExpr: "0 0 1 * *",
        }),
      },
      env,
    )

    const response = await app.request(
      "http://example.test/admin/entitlement/monthly-allowance/reset",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await adminSessionHeaders()),
        },
        body: JSON.stringify({}),
      },
      env,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        allowanceId: "global-monthly",
        budgetKey: "global-budget",
        active: true,
        cronExpr: "0 0 1 * *",
        resetAmountBytes: 100 * 1024 * 1024 * 1024,
      }),
    )
  })

  test("/admin/host/budgets lists known budgets without D1", async () => {
    const mintResponse = await app.request(
      "http://example.test/admin/entitlement/mint",
      {
        method: "POST",
        headers: await adminSessionHeaders(),
      },
      env,
    )
    const minted = (await mintResponse.json()) as { budgetId: string }

    const response = await app.request(
      "http://example.test/admin/host/budgets",
      {
        headers: await adminSessionHeaders(),
      },
      env,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        budgets: [
          expect.objectContaining({
            budgetKey: "global-budget",
            budgetId: minted.budgetId,
          }),
        ],
      }),
    )
    expect(hostAdminDb.budgets.has("global-budget")).toBe(true)
  })

  test("/admin/host/monthly-allowances lists known allowances without D1", async () => {
    await app.request(
      "http://example.test/admin/entitlement/monthly-allowance",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await adminSessionHeaders()),
        },
        body: JSON.stringify({
          active: true,
          resetAmountBytes: 5000,
          cronExpr: "0 0 1 * *",
        }),
      },
      env,
    )

    const response = await app.request(
      "http://example.test/admin/host/monthly-allowances",
      {
        headers: await adminSessionHeaders(),
      },
      env,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        monthlyAllowances: [
          expect.objectContaining({
            allowanceId: "global-monthly",
            budgetKey: "global-budget",
            active: true,
          }),
        ],
      }),
    )
    expect(hostAdminDb.monthlyAllowances.has("global-monthly")).toBe(true)
  })

  test("/admin/host/monthly-allowances seeds the default allowance onto the default budget", async () => {
    const response = await app.request(
      "http://example.test/admin/host/monthly-allowances",
      {
        headers: await adminSessionHeaders(),
      },
      env,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        monthlyAllowances: [
          expect.objectContaining({
            allowanceId: "global-monthly",
            budgetKey: "global-budget",
            active: true,
            cronExpr: "0 0 1 * *",
          }),
        ],
      }),
    )
    expect(hostAdminDb.monthlyAllowances.get("global-monthly")?.budget_key).toBe("global-budget")
    expect(hostAdminDb.monthlyAllowances.get("global-monthly")?.active).toBe(1)
  })

  test("/admin/entitlement/budget-label updates registry label for selected budget", async () => {
    await app.request(
      "http://example.test/admin/entitlement/mint",
      {
        method: "POST",
        headers: await adminSessionHeaders(),
      },
      env,
    )

    const response = await app.request(
      "http://example.test/admin/entitlement/budget-label",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await adminSessionHeaders()),
        },
        body: JSON.stringify({
          budgetKey: "global-budget",
          label: "Production Shared Budget",
        }),
      },
      env,
    )

    expect(response.status).toBe(200)
    expect(hostAdminDb.budgets.get("global-budget")?.label).toBe("Production Shared Budget")
  })

  test("/admin/entitlement/budget/create creates a budget record with optional label", async () => {
    const response = await app.request(
      "http://example.test/admin/entitlement/budget/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await adminSessionHeaders()),
        },
        body: JSON.stringify({
          budgetKey: "team-a",
          label: "Team A",
        }),
      },
      env,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        budgetKey: "team-a",
        allowance: expect.objectContaining({
          remainingBytes: 0,
          consumedBytes: 0,
        }),
      }),
    )
    expect(hostAdminDb.budgets.get("team-a")?.label).toBe("Team A")
  })
})
