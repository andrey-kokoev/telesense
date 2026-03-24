import type { Ref } from "vue"
import type { BudgetResponse, MonthlyAllowanceResponse } from "../types/hostAdmin"

type LoadingState =
  | "idle"
  | "loading"
  | "saving-label"
  | "saving-monthly"
  | "saving-remaining"
  | "archiving-budget"
  | "minting"

type ToastFn = (message: string, variant?: "success" | "error" | "info") => void
type TranslateFn = (key: string, params?: Record<string, string>) => string

export function useHostAdminRemainingActions(options: {
  t: TranslateFn
  show: ToastFn
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>
  selectedBudgetKey: Ref<string>
  budget: Ref<BudgetResponse | null>
  monthlyAllowance: Ref<MonthlyAllowanceResponse | null>
  budgetByKey: Ref<Record<string, BudgetResponse>>
  monthlyAllowanceByBudgetKey: Ref<Record<string, MonthlyAllowanceResponse>>
  openBudgetMenuKey: Ref<string>
  openRemainingOverrideKey: Ref<string>
  currentRemainingGiB: Ref<string>
  lastError: Ref<string>
  loadingState: Ref<LoadingState>
  loadBudget: () => Promise<void>
  loadMonthlyAllowance: () => Promise<void>
  bytesToGiBString: (bytes: number) => string
  giBStringToBytes: (value: string) => number
}) {
  const {
    t,
    show,
    adminFetch,
    selectedBudgetKey,
    budget,
    monthlyAllowance,
    budgetByKey,
    monthlyAllowanceByBudgetKey,
    openBudgetMenuKey,
    openRemainingOverrideKey,
    currentRemainingGiB,
    lastError,
    loadingState,
    loadBudget,
    loadMonthlyAllowance,
    bytesToGiBString,
    giBStringToBytes,
  } = options

  async function saveCurrentRemaining() {
    if (!selectedBudgetKey.value || !budget.value) return
    loadingState.value = "saving-remaining"
    lastError.value = ""
    try {
      const remainingBytes = giBStringToBytes(currentRemainingGiB.value)
      if (!Number.isFinite(remainingBytes)) {
        throw new Error(t("admin_budget_invalid_remaining"))
      }
      const response = await adminFetch("/admin/entitlement/budget/remaining", {
        method: "POST",
        body: JSON.stringify({
          budgetKey: selectedBudgetKey.value,
          remainingBytes,
        }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const data = (await response.json()) as BudgetResponse
      budget.value = data
      budgetByKey.value = {
        ...budgetByKey.value,
        [data.budgetKey]: data,
      }
      currentRemainingGiB.value = bytesToGiBString(data.allowance.remainingBytes)
      openRemainingOverrideKey.value = ""
      show(t("admin_budget_remaining_saved"), "success")
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
    } finally {
      loadingState.value = "idle"
    }
  }

  async function openRemainingOverride(budgetKey: string) {
    if (openRemainingOverrideKey.value === budgetKey) {
      openRemainingOverrideKey.value = ""
      return
    }

    selectedBudgetKey.value = budgetKey
    openBudgetMenuKey.value = ""
    if (selectedBudgetKey.value !== budgetKey || !budgetByKey.value[budgetKey]) {
      await Promise.all([loadBudget(), loadMonthlyAllowance()])
    } else {
      budget.value = budgetByKey.value[budgetKey]
      monthlyAllowance.value = monthlyAllowanceByBudgetKey.value[budgetKey] ?? null
    }
    currentRemainingGiB.value = bytesToGiBString(
      monthlyAllowance.value?.resetAmountBytes ?? budget.value?.allowance.remainingBytes ?? 0,
    )
    openRemainingOverrideKey.value = budgetKey
  }

  return {
    saveCurrentRemaining,
    openRemainingOverride,
  }
}
