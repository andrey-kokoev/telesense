export type BudgetListItem = {
  budgetKey: string
  budgetId: string
  label: string | null
  createdAt: number
  updatedAt: number
}

export type MonthlyAllowanceListItem = {
  allowanceId: string
  budgetKey: string
  active: boolean
  cronExpr: string
  createdAt: number
  updatedAt: number
}

export type BudgetResponse = {
  budgetKey: string
  budgetId: string
  enabled: boolean
  allowance: {
    remainingBytes: number
    consumedBytes: number
  }
  grace: {
    lifecycle: "active" | "in_grace" | "exhausted"
    graceEndsAt: number | null
  }
}

export type MonthlyAllowanceResponse = {
  allowanceId: string
  budgetKey: string
  resetAmountBytes: number
  cronExpr: string
  active: boolean
  nextResetAt: number | null
  lastResetAt: number | null
  lifecycle: "inactive" | "scheduled" | "due"
}

export type BudgetUsageSummary = {
  percent: number
  label: string
  title: string
}
