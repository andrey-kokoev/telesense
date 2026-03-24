import type { Context, Hono } from "hono"

export type WorkerRouteApp = Hono<any, any, any>
export type WorkerAdminEnv = {
  HOST_ADMIN_BOOTSTRAP_TOKEN: string
  [key: string]: unknown
}
export type WorkerAppContext<TEnv extends WorkerAdminEnv = WorkerAdminEnv> = Context<{
  Bindings: TEnv
}>
export type WorkerHostSessionVerification = { valid: boolean }
export type WorkerBudgetSessionVerification =
  | { valid: true; claims: { budgetKey: string } }
  | { valid: false; reason: string }

export type WorkerJsonBodyReader<TEnv extends WorkerAdminEnv = WorkerAdminEnv> = <T>(
  c: WorkerAppContext<TEnv>,
) => Promise<T | Response>
export type WorkerRequiredField = (
  c: WorkerAppContext<any>,
  value: string | null | undefined,
  field: string,
) => string | Response
export type WorkerBudgetAccessResult = { kind: "host-admin" | "budget-admin" } | Response

export type WorkerAdminRouteCommonDeps<TEnv extends WorkerAdminEnv = WorkerAdminEnv> = {
  defaultBudgetKey: (env: TEnv) => string
  badRequest: (c: WorkerAppContext<TEnv>, error: string, code?: string) => Response
  readJsonBody: WorkerJsonBodyReader<TEnv>
  requireAdminSession: (c: WorkerAppContext<TEnv>) => Promise<Response | null>
  requireBudgetAccess: (
    c: WorkerAppContext<TEnv>,
    budgetKey: string,
  ) => Promise<WorkerBudgetAccessResult>
}

export type WorkerBudgetFieldDeps<TEnv extends WorkerAdminEnv = WorkerAdminEnv> =
  WorkerAdminRouteCommonDeps<TEnv> & {
    requiredTrimmedField: WorkerRequiredField
    upsertBudgetRegistry?: (
      env: TEnv,
      record: { budgetKey: string; budgetId: string; label?: string | null },
    ) => Promise<void>
  }
