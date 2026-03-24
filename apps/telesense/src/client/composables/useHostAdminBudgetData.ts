import { nextTick, watch, type ComponentPublicInstance, type Ref } from "vue"
import type {
  BudgetListItem,
  BudgetResponse,
  MonthlyAllowanceListItem,
  MonthlyAllowanceResponse,
} from "../types/hostAdmin"

type LoadingState =
  | "idle"
  | "loading"
  | "saving-label"
  | "saving-monthly"
  | "saving-remaining"
  | "archiving-budget"
  | "minting"

const GIB = 1024 * 1024 * 1024

export function useHostAdminBudgetData(options: {
  adminFetch: (
    path: string,
    init?: RequestInit,
    options?: { preferHostAdmin?: boolean },
  ) => Promise<Response>
  adminFetchJson: <T>(
    path: string,
    init?: RequestInit,
    options?: { preferHostAdmin?: boolean },
  ) => Promise<T>
  openBudgetPage: (budgetKey: string) => void
  show: (message: string, tone?: "success" | "error" | "info") => void
  budgets: Ref<BudgetListItem[]>
  monthlyAllowances: Ref<MonthlyAllowanceListItem[]>
  selectedBudgetKey: Ref<string>
  selectedAllowanceId: Ref<string>
  budget: Ref<BudgetResponse | null>
  monthlyAllowance: Ref<MonthlyAllowanceResponse | null>
  budgetByKey: Ref<Record<string, BudgetResponse>>
  monthlyAllowanceByBudgetKey: Ref<Record<string, MonthlyAllowanceResponse>>
  lastError: Ref<string>
  loadingState: Ref<LoadingState>
  creatingBudget: Ref<boolean>
  newBudgetKey: Ref<string>
  creatingBudgetInput: Ref<HTMLInputElement | null>
  monthlyAllowanceForm: {
    allowanceId: string
    budgetKey: string
    active: boolean
    resetAmountGiB: string
    cronExpr: string
  }
  currentRemainingGiB: Ref<string>
}) {
  const {
    adminFetch,
    adminFetchJson,
    openBudgetPage,
    show,
    budgets,
    monthlyAllowances,
    selectedBudgetKey,
    selectedAllowanceId,
    budget,
    monthlyAllowance,
    budgetByKey,
    monthlyAllowanceByBudgetKey,
    lastError,
    loadingState,
    creatingBudget,
    newBudgetKey,
    creatingBudgetInput,
    monthlyAllowanceForm,
    currentRemainingGiB,
  } = options

  function bytesToGiBString(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0"
    const gib = bytes / GIB
    return Number.isInteger(gib) ? String(gib) : gib.toFixed(2).replace(/\.?0+$/, "")
  }

  async function loadBudgetList() {
    const data = await adminFetchJson<{ budgets: BudgetListItem[] }>("/admin/host/budgets")
    budgets.value = data.budgets
    if (
      selectedBudgetKey.value &&
      !data.budgets.some((item) => item.budgetKey === selectedBudgetKey.value)
    ) {
      selectedBudgetKey.value = ""
    }
  }

  async function createBudget() {
    const budgetKey = newBudgetKey.value.trim()
    if (!budgetKey) return

    loadingState.value = "loading"
    lastError.value = ""
    try {
      const response = await adminFetch("/admin/entitlement/budget/create", {
        method: "POST",
        body: JSON.stringify({ budgetKey }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const data = (await response.json()) as BudgetResponse
      creatingBudget.value = false
      newBudgetKey.value = ""
      await refreshCatalog()
      await refreshRowData()
      openBudgetPage(data.budgetKey)
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
    } finally {
      loadingState.value = "idle"
    }
  }

  function toggleCreateBudget() {
    creatingBudget.value = !creatingBudget.value
    if (!creatingBudget.value) {
      newBudgetKey.value = ""
      creatingBudgetInput.value = null
      return
    }
    void nextTick(() => {
      creatingBudgetInput.value?.focus()
      creatingBudgetInput.value?.select()
    })
  }

  function cancelCreateBudget() {
    creatingBudget.value = false
    newBudgetKey.value = ""
    creatingBudgetInput.value = null
  }

  function setCreatingBudgetInput(el: Element | ComponentPublicInstance | null) {
    creatingBudgetInput.value = resolveInputRef(el)
  }

  async function loadMonthlyAllowanceList() {
    const data = await adminFetchJson<{ monthlyAllowances: MonthlyAllowanceListItem[] }>(
      "/admin/host/monthly-allowances",
    )
    monthlyAllowances.value = data.monthlyAllowances
    syncSelectedAllowance()
  }

  async function loadBudget() {
    if (!selectedBudgetKey.value) {
      budget.value = null
      return
    }

    budget.value = await adminFetchJson<BudgetResponse>(
      `/admin/entitlement/budget?budgetKey=${encodeURIComponent(selectedBudgetKey.value)}`,
    )
    budgetByKey.value = { ...budgetByKey.value, [budget.value.budgetKey]: budget.value }
    currentRemainingGiB.value = bytesToGiBString(budget.value.allowance.remainingBytes)
  }

  async function loadMonthlyAllowance() {
    if (!selectedBudgetKey.value) {
      monthlyAllowance.value = null
      monthlyAllowanceForm.allowanceId = "global"
      monthlyAllowanceForm.budgetKey = ""
      monthlyAllowanceForm.active = false
      monthlyAllowanceForm.resetAmountGiB = "0"
      monthlyAllowanceForm.cronExpr = "0 0 1 * *"
      return
    }

    const params = new URLSearchParams({ budgetKey: selectedBudgetKey.value })
    if (selectedAllowanceId.value) {
      params.set("allowanceId", selectedAllowanceId.value)
    }
    const data = await adminFetchJson<MonthlyAllowanceResponse>(
      `/admin/entitlement/monthly-allowance?${params.toString()}`,
    )
    monthlyAllowance.value = data
    monthlyAllowanceByBudgetKey.value = {
      ...monthlyAllowanceByBudgetKey.value,
      [data.budgetKey]: data,
    }
    monthlyAllowanceForm.allowanceId = data.allowanceId
    monthlyAllowanceForm.budgetKey = data.budgetKey
    monthlyAllowanceForm.active = data.active
    monthlyAllowanceForm.resetAmountGiB = bytesToGiBString(data.resetAmountBytes)
    monthlyAllowanceForm.cronExpr = data.cronExpr
  }

  async function refreshCatalog() {
    await Promise.all([loadBudgetList(), loadMonthlyAllowanceList()])
  }

  async function refreshRowData() {
    const entries = await Promise.all(
      budgets.value.map(async (item) => {
        const [budgetData, allowanceData] = await Promise.all([
          adminFetchJson<BudgetResponse>(
            `/admin/entitlement/budget?budgetKey=${encodeURIComponent(item.budgetKey)}`,
          ),
          adminFetchJson<MonthlyAllowanceResponse>(
            `/admin/entitlement/monthly-allowance?budgetKey=${encodeURIComponent(item.budgetKey)}`,
          ),
        ])
        return { budgetKey: item.budgetKey, budgetData, allowanceData }
      }),
    )

    budgetByKey.value = Object.fromEntries(
      entries.map((entry) => [entry.budgetKey, entry.budgetData]),
    )
    monthlyAllowanceByBudgetKey.value = Object.fromEntries(
      entries.map((entry) => [entry.budgetKey, entry.allowanceData]),
    )
  }

  function syncSelectedAllowance() {
    monthlyAllowanceForm.budgetKey = selectedBudgetKey.value
    const linked = monthlyAllowances.value.filter(
      (item) => item.budgetKey === selectedBudgetKey.value,
    )
    if (linked.length === 0) {
      selectedAllowanceId.value = ""
      return
    }

    if (!linked.some((item) => item.allowanceId === selectedAllowanceId.value)) {
      selectedAllowanceId.value = linked[0].allowanceId
    }
  }

  watch(selectedBudgetKey, () => {
    syncSelectedAllowance()
  })

  return {
    loadBudgetList,
    createBudget,
    toggleCreateBudget,
    cancelCreateBudget,
    setCreatingBudgetInput,
    loadMonthlyAllowanceList,
    loadBudget,
    loadMonthlyAllowance,
    refreshCatalog,
    refreshRowData,
    syncSelectedAllowance,
    bytesToGiBString,
  }
}

function resolveInputRef(el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLInputElement) return el
  if (el instanceof Element) {
    return el instanceof HTMLInputElement ? el : el.querySelector("input")
  }
  if (el && "$el" in el && el.$el instanceof Element) {
    return el.$el instanceof HTMLInputElement ? el.$el : el.$el.querySelector("input")
  }
  return null
}
