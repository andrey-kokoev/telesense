import type { Ref } from "vue"
import type { MonthlyAllowanceResponse } from "../types/hostAdmin"

export function useHostAdminPolicyActions(options: {
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>
  selectedBudgetKey: Ref<string>
  selectedAllowanceId: Ref<string>
  monthlyAllowance: Ref<MonthlyAllowanceResponse | null>
  monthlyAllowanceByBudgetKey: Ref<Record<string, MonthlyAllowanceResponse>>
  monthlyAllowanceForm: {
    allowanceId: string
    budgetKey: string
    active: boolean
    resetAmountGiB: string
    cronExpr: string
  }
  lastError: Ref<string>
  persistMonthlyAllowance: (active: boolean, showSuccessToast: boolean) => Promise<void>
  budgetPolicyForKey: (budgetKey: string) => MonthlyAllowanceResponse | null
  bytesToGiBString: (bytes: number) => string
}) {
  const {
    adminFetch,
    selectedBudgetKey,
    selectedAllowanceId,
    monthlyAllowance,
    monthlyAllowanceByBudgetKey,
    monthlyAllowanceForm,
    lastError,
    persistMonthlyAllowance,
    budgetPolicyForKey,
    bytesToGiBString,
  } = options

  async function toggleBudgetPolicyActive(budgetKey: string) {
    const existing = budgetPolicyForKey(budgetKey)
    selectedBudgetKey.value = budgetKey
    const response = await adminFetch(
      `/admin/entitlement/monthly-allowance?budgetKey=${encodeURIComponent(budgetKey)}${
        existing ? `&allowanceId=${encodeURIComponent(existing.allowanceId)}` : ""
      }`,
    )
    if (!response.ok) {
      lastError.value = await response.text()
      return
    }

    const data = (await response.json()) as MonthlyAllowanceResponse
    monthlyAllowance.value = data
    selectedAllowanceId.value = data.allowanceId
    monthlyAllowanceForm.allowanceId = data.allowanceId
    monthlyAllowanceForm.budgetKey = data.budgetKey
    monthlyAllowanceForm.active = data.active
    monthlyAllowanceForm.resetAmountGiB = bytesToGiBString(data.resetAmountBytes)
    monthlyAllowanceForm.cronExpr = data.cronExpr

    const nextActive = !data.active
    const previousPolicy = { ...data }

    monthlyAllowance.value = {
      ...data,
      active: nextActive,
      lifecycle: nextActive ? "scheduled" : "inactive",
    }
    monthlyAllowanceByBudgetKey.value = {
      ...monthlyAllowanceByBudgetKey.value,
      [data.budgetKey]: monthlyAllowance.value,
    }
    monthlyAllowanceForm.active = nextActive

    try {
      await persistMonthlyAllowance(nextActive, false)
    } catch {
      monthlyAllowance.value = previousPolicy
      monthlyAllowanceByBudgetKey.value = {
        ...monthlyAllowanceByBudgetKey.value,
        [previousPolicy.budgetKey]: previousPolicy,
      }
      monthlyAllowanceForm.active = previousPolicy.active
    }
  }

  return {
    toggleBudgetPolicyActive,
  }
}
