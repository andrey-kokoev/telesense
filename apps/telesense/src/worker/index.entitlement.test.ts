import { beforeEach, describe, expect, test, vi } from "vite-plus/test"
import app, { CallRoom, EntitlementBudget } from "./index"

class MemoryStorage {
  private data = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
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
  SERVICE_ENTITLEMENT_ALLOWANCE_BYTES: string
  GLOBAL_ENTITLEMENT_BUDGET_ID?: string
  DO_NOT_ENFORCE_SERVICE_ENTITLEMENT?: string
  DEBUG?: string
  CALL_ROOMS: DurableObjectNamespace
  ENTITLEMENT_BUDGETS: DurableObjectNamespace
}

describe("entitlement routes", () => {
  let env: TestEnv
  let budgetStub: ReturnType<typeof createBudgetStub>
  let callRooms: ReturnType<typeof createCallRoomNamespace>
  let nextCloudflareSessionId: number

  beforeEach(() => {
    budgetStub = createBudgetStub()
    callRooms = createCallRoomNamespace()
    nextCloudflareSessionId = 1

    env = {
      REALTIME_APP_ID: "app-id",
      CF_CALLS_SECRET: "cf-secret",
      SERVICE_ENTITLEMENT_TOKEN: "admin-secret",
      SERVICE_ENTITLEMENT_ALLOWANCE_BYTES: "1000",
      GLOBAL_ENTITLEMENT_BUDGET_ID: "global-budget",
      CALL_ROOMS: callRooms.namespace,
      ENTITLEMENT_BUDGETS: createNamespace(budgetStub),
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

  test("/admin/entitlement/mint requires the admin entitlement token", async () => {
    const response = await app.request(
      "http://example.test/admin/entitlement/mint",
      {
        method: "POST",
      },
      env,
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "SERVICE_ENTITLEMENT_MISSING" }),
    )
  })

  test("/admin/entitlement/mint adds allowance and returns a usable token", async () => {
    const mintResponse = await app.request(
      "http://example.test/admin/entitlement/mint",
      {
        method: "POST",
        headers: { "X-Service-Entitlement-Token": "admin-secret" },
      },
      env,
    )

    expect(mintResponse.status).toBe(200)
    const minted = (await mintResponse.json()) as {
      serviceEntitlementToken: string
      remainingBytes: number
      budgetId: string
    }

    expect(minted.remainingBytes).toBe(1_000)
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
        remainingBytes: 1_000,
      }),
    )
  })

  test("/api/auth/verify rejects invalid entitlement tokens", async () => {
    const mintResponse = await app.request(
      "http://example.test/admin/entitlement/mint",
      {
        method: "POST",
        headers: { "X-Service-Entitlement-Token": "admin-secret" },
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
        headers: { "X-Service-Entitlement-Token": "admin-secret" },
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
        headers: { "X-Service-Entitlement-Token": "admin-secret" },
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
    const mintResponse = await app.request(
      "http://example.test/admin/entitlement/mint",
      {
        method: "POST",
        headers: { "X-Service-Entitlement-Token": "admin-secret" },
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
        body: JSON.stringify({ budgetId: budget.getBudgetId(), roomId: "ROOMA" }),
      }),
    )
    await roomB.fetch(
      new Request("http://do.internal/?action=setBudgetId", {
        method: "POST",
        body: JSON.stringify({ budgetId: budget.getBudgetId(), roomId: "ROOMB" }),
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
        body: JSON.stringify({ bytes: 200, budgetId: budget.getBudgetId() }),
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
        body: JSON.stringify({ bytes: 50, budgetId: budget.getBudgetId() }),
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
})
