import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue"
import { useAdminClient } from "./useAdminClient"
import { useAdminNavigation } from "./useAdminNavigation"
import { useHostAdminBudgetData } from "./useHostAdminBudgetData"
import { useHostAdminBootstrap } from "./useHostAdminBootstrap"
import { presentBudget } from "./useBudgetPresentation"
import { useHostAdminBudgetActions } from "./useHostAdminBudgetActions"
import { useI18n } from "./useI18n"
import { useToast } from "./useToast"
import type {
  BudgetListItem,
  BudgetResponse,
  BudgetUsageSummary,
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
type AdminAccessState = "checking" | "authorized" | "unauthorized"

export default function useHostAdminPage() {
  const { t } = useI18n()
  const { show } = useToast()
  const { goHome, goBudgetAdmin } = useAdminNavigation()
  const { adminFetch, adminFetchJson } = useAdminClient()

  const budgets = ref<BudgetListItem[]>([])
  const monthlyAllowances = ref<MonthlyAllowanceListItem[]>([])
  const selectedBudgetKey = ref("")
  const selectedAllowanceId = ref("")
  const budget = ref<BudgetResponse | null>(null)
  const monthlyAllowance = ref<MonthlyAllowanceResponse | null>(null)
  const budgetByKey = ref<Record<string, BudgetResponse>>({})
  const monthlyAllowanceByBudgetKey = ref<Record<string, MonthlyAllowanceResponse>>({})
  const openBudgetMenuKey = ref("")
  const openRemainingOverrideKey = ref("")
  const editingBudgetKey = ref("")
  const editingBudgetLabel = ref("")
  const editingBudgetOriginalLabel = ref("")
  const editingBudgetInput = ref<HTMLInputElement | null>(null)
  const mintedToken = ref("")
  const showMintedToken = ref(false)
  const lastError = ref("")
  const loadingState = ref<LoadingState>("idle")
  const adminAccessState = ref<AdminAccessState>("checking")
  const hostAdminTokenInput = ref("")
  const budgetSearch = ref("")
  const creatingBudget = ref(false)
  const newBudgetKey = ref("")
  const creatingBudgetInput = ref<HTMLInputElement | null>(null)

  const monthlyAllowanceForm = reactive({
    allowanceId: "global",
    budgetKey: "",
    active: false,
    resetAmountGiB: "0",
    cronExpr: "0 0 1 * *",
  })
  const currentRemainingGiB = ref("0")

  const filteredBudgets = computed(() => {
    const query = budgetSearch.value.trim().toLowerCase()
    if (!query) return budgets.value

    return budgets.value.filter((item) =>
      [item.label ?? "", item.budgetKey, item.budgetId].some((value) =>
        value.toLowerCase().includes(query),
      ),
    )
  })
  const hasMonthlyAllowanceChanges = computed(() => {
    if (!monthlyAllowance.value) return false

    return (
      monthlyAllowanceForm.resetAmountGiB !==
        bytesToGiBString(monthlyAllowance.value.resetAmountBytes) ||
      monthlyAllowanceForm.cronExpr.trim() !== monthlyAllowance.value.cronExpr
    )
  })
  const monthlyNextResetTooltip = computed(() => {
    const nextResetAt = monthlyAllowance.value?.nextResetAt
    return nextResetAt
      ? t("admin_monthly_next_reset_tooltip", { time: formatTime(nextResetAt) })
      : t("admin_monthly_next_reset_unscheduled")
  })

  function budgetUsageSummary(budgetKey: string): BudgetUsageSummary | null {
    return presentBudget(
      budgetByKey.value[budgetKey] ?? null,
      monthlyAllowanceByBudgetKey.value[budgetKey] ?? null,
      t as (key: string, params?: Record<string, string>) => string,
    ).usageSummary
  }

  function budgetPolicyForKey(budgetKey: string) {
    return monthlyAllowanceByBudgetKey.value[budgetKey] ?? null
  }

  function budgetPolicyIsActive(budgetKey: string) {
    return budgetPolicyForKey(budgetKey)?.active ?? false
  }

  function budgetIsActive(budgetKey: string) {
    return budgetByKey.value[budgetKey]?.enabled ?? true
  }

  function budgetPolicyBadgeLabel(budgetKey: string) {
    const policy = budgetPolicyForKey(budgetKey)
    if (!policy || !policy.active) return t("admin_status_inactive")
    return t("admin_budget_replenish_amount_short", {
      amount: bytesToGiBString(policy.resetAmountBytes),
    })
  }

  function openBudgetPage(budgetKey: string) {
    if (editingBudgetKey.value === budgetKey) return
    goBudgetAdmin(budgetKey)
  }

  function giBStringToBytes(value: string) {
    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN
    return Math.round(parsed * 1024 * 1024 * 1024)
  }

  function formatTime(timestamp: number | null | undefined) {
    if (!timestamp) return "—"
    return new Date(timestamp).toLocaleString()
  }

  function clearPageState() {
    hostAdminTokenInput.value = ""
    budgets.value = []
    monthlyAllowances.value = []
    selectedBudgetKey.value = ""
    selectedAllowanceId.value = ""
    openBudgetMenuKey.value = ""
    budget.value = null
    budgetByKey.value = {}
    monthlyAllowance.value = null
    monthlyAllowanceByBudgetKey.value = {}
    mintedToken.value = ""
    showMintedToken.value = false
    lastError.value = ""
  }

  const {
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
  } = useHostAdminBudgetData({
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
  })

  async function refreshAll() {
    loadingState.value = "loading"
    lastError.value = ""
    try {
      const authorized = await verifyAdminAccess()
      if (!authorized) return
      await refreshCatalog()
      await refreshRowData()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loadingState.value = "idle"
    }
  }

  async function saveMonthlyAllowance() {
    await persistMonthlyAllowance(monthlyAllowanceForm.active, true)
  }

  async function saveCurrentRemaining() {
    return hostAdminBudgetActions.saveCurrentRemaining()
  }

  async function persistMonthlyAllowance(active: boolean, showSuccessToast: boolean) {
    loadingState.value = "saving-monthly"
    lastError.value = ""
    try {
      const resetAmountBytes = giBStringToBytes(monthlyAllowanceForm.resetAmountGiB)
      if (!Number.isFinite(resetAmountBytes)) {
        throw new Error(t("admin_monthly_invalid_reset_amount"))
      }

      const response = await adminFetch("/admin/entitlement/monthly-allowance", {
        method: "POST",
        body: JSON.stringify({
          allowanceId: monthlyAllowanceForm.allowanceId.trim(),
          budgetKey: monthlyAllowanceForm.budgetKey.trim(),
          active,
          resetAmountBytes,
          cronExpr: monthlyAllowanceForm.cronExpr.trim(),
        }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const data = (await response.json()) as MonthlyAllowanceResponse
      monthlyAllowance.value = data
      monthlyAllowanceByBudgetKey.value = {
        ...monthlyAllowanceByBudgetKey.value,
        [data.budgetKey]: data,
      }
      selectedAllowanceId.value = data.allowanceId
      selectedBudgetKey.value = data.budgetKey
      monthlyAllowanceForm.allowanceId = data.allowanceId
      monthlyAllowanceForm.budgetKey = data.budgetKey
      monthlyAllowanceForm.active = data.active
      monthlyAllowanceForm.resetAmountGiB = bytesToGiBString(data.resetAmountBytes)
      monthlyAllowanceForm.cronExpr = data.cronExpr
      syncSelectedAllowance()
      await Promise.all([loadBudgetList(), loadMonthlyAllowanceList(), loadBudget()])
      if (showSuccessToast) {
        show(t("admin_monthly_saved"), "success")
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
      throw error
    } finally {
      loadingState.value = "idle"
    }
  }

  async function saveBudgetLabelValue(budgetKey: string, label: string) {
    loadingState.value = "saving-label"
    lastError.value = ""
    try {
      const response = await adminFetch("/admin/entitlement/budget-label", {
        method: "POST",
        body: JSON.stringify({
          budgetKey,
          label,
        }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      budget.value = (await response.json()) as BudgetResponse
      await loadBudgetList()
      show(t("admin_budget_label_saved"), "success")
      return true
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
      return false
    } finally {
      loadingState.value = "idle"
    }
  }

  const hostAdminBudgetActions = useHostAdminBudgetActions({
    t: t as (key: string, params?: Record<string, string>) => string,
    show,
    adminFetch,
    selectedBudgetKey,
    selectedAllowanceId,
    budget,
    monthlyAllowance,
    budgetByKey,
    monthlyAllowanceByBudgetKey,
    openBudgetMenuKey,
    openRemainingOverrideKey,
    editingBudgetKey,
    editingBudgetLabel,
    editingBudgetOriginalLabel,
    editingBudgetInput,
    mintedToken,
    showMintedToken,
    lastError,
    loadingState,
    monthlyAllowanceForm,
    currentRemainingGiB,
    creatingBudget,
    cancelCreateBudget,
    loadBudget,
    loadMonthlyAllowance,
    persistMonthlyAllowance,
    loadBudgetList,
    syncSelectedAllowance,
    budgetPolicyForKey,
    budgetIsActive,
    bytesToGiBString,
    giBStringToBytes,
    saveBudgetLabelValue,
    onBudgetArchived: (budgetKey) => {
      if (selectedBudgetKey.value === budgetKey) {
        selectedBudgetKey.value = ""
      }
    },
  })

  const {
    hasHostAdminSession,
    verifyAdminAccess,
    saveHostAdminToken,
    clearStoredHostAdminToken,
    copyHostAdminToken,
  } = useHostAdminBootstrap({
    adminAccessState,
    hostAdminTokenInput,
    lastError,
    clearPageState,
    refreshAll,
  })

  onMounted(() => {
    document.addEventListener("click", hostAdminBudgetActions.handleDocumentClick)
    void refreshAll()
  })

  onBeforeUnmount(() => {
    document.removeEventListener("click", hostAdminBudgetActions.handleDocumentClick)
  })
  return {
    adminAccessState,
    budgetByKey,
    budgetIsActive,
    budgetPolicyBadgeLabel,
    budgetPolicyIsActive,
    budgetSearch,
    budgetUsageSummary,
    budgets,
    cancelBudgetLabelEdit: hostAdminBudgetActions.cancelBudgetLabelEdit,
    cancelCreateBudget,
    clearStoredHostAdminToken,
    commitBudgetLabel: hostAdminBudgetActions.commitBudgetLabel,
    copyMintedToken: hostAdminBudgetActions.copyMintedToken,
    archiveBudget: hostAdminBudgetActions.archiveBudget,
    createBudget,
    creatingBudget,
    editingBudgetKey,
    editingBudgetLabel,
    filteredBudgets,
    goBack: goHome,
    copyHostAdminToken,
    openBudgetPage,
    hasHostAdminSessionToken: hasHostAdminSession,
    hasMonthlyAllowanceChanges,
    hostAdminTokenInput,
    lastError,
    loadingState,
    mintToken: hostAdminBudgetActions.mintToken,
    monthlyAllowanceForm,
    monthlyNextResetTooltip,
    newBudgetKey,
    openRemainingOverride: hostAdminBudgetActions.openRemainingOverride,
    openRemainingOverrideKey,
    openBudgetMenu: hostAdminBudgetActions.openBudgetMenu,
    openBudgetMenuKey,
    currentRemainingGiB,
    saveHostAdminToken,
    saveCurrentRemaining,
    saveMonthlyAllowance,
    setCreatingBudgetInput,
    setEditingBudgetInput: hostAdminBudgetActions.setEditingBudgetInput,
    showMintedToken,
    startBudgetLabelEdit: hostAdminBudgetActions.startBudgetLabelEdit,
    t,
    toggleCreateBudget,
    toggleBudgetActive: hostAdminBudgetActions.toggleBudgetActive,
    toggleBudgetPolicyActive: hostAdminBudgetActions.toggleBudgetPolicyActive,
    toggleMintedToken: hostAdminBudgetActions.toggleMintedToken,
    mintedToken,
    selectedBudgetKey,
  }
}
