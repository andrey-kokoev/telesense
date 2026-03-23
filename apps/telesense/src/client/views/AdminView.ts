import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue"
import { useHostAdminBudgetActions } from "../composables/useHostAdminBudgetActions"
import { useAppStore } from "../composables/useAppStore"
import { useI18n } from "../composables/useI18n"
import { useToast } from "../composables/useToast"
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
  | "minting"
type AdminAccessState = "checking" | "authorized" | "unauthorized"

type CreateBudgetResponse = BudgetResponse

const GIB = 1024 * 1024 * 1024

export default function useAdminView() {
  const store = useAppStore()
  const { t } = useI18n()
  const { show } = useToast()

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

  const hasHostAdminSessionToken = computed(() => !!store.hostAdminSessionToken.value)
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
    const currentBudget = budgetByKey.value[budgetKey]
    const currentAllowance = monthlyAllowanceByBudgetKey.value[budgetKey]
    if (!currentBudget || !currentAllowance) return null

    const total = currentAllowance.resetAmountBytes
    const consumed = currentBudget.allowance.consumedBytes
    if (!Number.isFinite(total) || total <= 0) {
      return null
    }

    const percent = Math.max(0, Math.min(100, Math.round((consumed / total) * 100)))
    return {
      percent,
      label: t("admin_budget_used_percent", { percent: String(percent) }),
      title: t("admin_budget_used_detail", {
        used: formatBytes(consumed),
        total: formatBytes(total),
      }),
    }
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

  function goBack() {
    window.location.href = "/"
  }

  function openBudgetPage(budgetKey: string) {
    if (editingBudgetKey.value === budgetKey) return
    window.location.href = `/budget-admin/${encodeURIComponent(budgetKey)}`
  }

  function formatBytes(bytes: number | null | undefined) {
    if (typeof bytes !== "number") return "—"

    const units = ["B", "KiB", "MiB", "GiB", "TiB"]
    let value = bytes
    let unitIndex = 0

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex++
    }

    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
  }

  function bytesToGiBString(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0"
    const gib = bytes / GIB
    return Number.isInteger(gib) ? String(gib) : gib.toFixed(2).replace(/\.?0+$/, "")
  }

  function giBStringToBytes(value: string) {
    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN
    return Math.round(parsed * GIB)
  }

  function formatTime(timestamp: number | null | undefined) {
    if (!timestamp) return "—"
    return new Date(timestamp).toLocaleString()
  }

  async function adminFetch(path: string, init: RequestInit = {}) {
    return fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...store.getHostAdminHeaders(),
        ...(init.headers && !Array.isArray(init.headers)
          ? (init.headers as Record<string, string>)
          : {}),
      },
    })
  }

  async function exchangeHostAdminBootstrapToken(bootstrapToken: string) {
    return fetch("/admin/auth/exchange", {
      method: "POST",
      headers: {
        "X-Host-Admin-Token": bootstrapToken,
      },
    })
  }

  async function loadBudgetList() {
    const response = await adminFetch("/admin/host/budgets")
    if (!response.ok) throw new Error(await response.text())
    const data = (await response.json()) as { budgets: BudgetListItem[] }
    budgets.value = data.budgets
    if (
      selectedBudgetKey.value &&
      !data.budgets.some((item) => item.budgetKey === selectedBudgetKey.value)
    ) {
      selectedBudgetKey.value = ""
    }
  }

  async function verifyAdminAccess() {
    if (!hasHostAdminSessionToken.value) {
      adminAccessState.value = "unauthorized"
      return false
    }

    adminAccessState.value = "checking"
    const response = await adminFetch("/admin/auth/verify")
    if (!response.ok) {
      adminAccessState.value = "unauthorized"
      store.clearHostAdminSessionToken()
      throw new Error(await response.text())
    }

    adminAccessState.value = "authorized"
    return true
  }

  async function saveHostAdminToken() {
    const bootstrapToken = store.sanitizeCredentialToken(hostAdminTokenInput.value)
    if (!bootstrapToken) return

    lastError.value = ""

    try {
      const exchange = await exchangeHostAdminBootstrapToken(bootstrapToken)
      if (!exchange.ok) {
        throw new Error(await exchange.text())
      }
      const exchangeData = (await exchange.json()) as { hostAdminSessionToken: string }
      store.setHostAdminSessionToken(exchangeData.hostAdminSessionToken, bootstrapToken)

      const authorized = await verifyAdminAccess()
      if (!authorized) {
        lastError.value = t("admin_access_denied_hint")
        show(lastError.value, "error")
        return
      }
      hostAdminTokenInput.value = ""
      show(t("admin_bootstrap_saved"), "success")
      await refreshAll()
    } catch (error) {
      store.clearHostAdminSessionToken()
      adminAccessState.value = "unauthorized"
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
    }
  }

  function clearStoredHostAdminToken() {
    store.clearHostAdminSessionToken()
    hostAdminTokenInput.value = ""
    adminAccessState.value = "unauthorized"
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

  async function copyHostAdminToken() {
    try {
      const response = await adminFetch("/admin/auth/bootstrap")
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const data = (await response.json()) as { hostAdminBootstrapToken: string }
      const token = store.sanitizeCredentialToken(data.hostAdminBootstrapToken)
      if (!token) {
        throw new Error("Missing host admin bootstrap token")
      }
      store.setHostAdminSessionToken(store.hostAdminSessionToken.value, token)
      await navigator.clipboard.writeText(token)
      show(t("admin_bootstrap_token_copied"), "success")
    } catch {
      show(t("admin_token_copy_failed"), "error")
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
      const data = (await response.json()) as CreateBudgetResponse
      creatingBudget.value = false
      newBudgetKey.value = ""
      await refreshAll()
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
    const response = await adminFetch("/admin/host/monthly-allowances")
    if (!response.ok) throw new Error(await response.text())
    const data = (await response.json()) as { monthlyAllowances: MonthlyAllowanceListItem[] }
    monthlyAllowances.value = data.monthlyAllowances
    syncSelectedAllowance()
  }

  async function loadBudget() {
    if (!selectedBudgetKey.value) {
      budget.value = null
      return
    }

    const response = await adminFetch(
      `/admin/entitlement/budget?budgetKey=${encodeURIComponent(selectedBudgetKey.value)}`,
    )
    if (!response.ok) throw new Error(await response.text())
    budget.value = (await response.json()) as BudgetResponse
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
    const response = await adminFetch(`/admin/entitlement/monthly-allowance?${params.toString()}`)
    if (!response.ok) throw new Error(await response.text())

    const data = (await response.json()) as MonthlyAllowanceResponse
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

  async function refreshAll() {
    loadingState.value = "loading"
    lastError.value = ""
    try {
      const authorized = await verifyAdminAccess()
      if (!authorized) return
      await Promise.all([loadBudgetList(), loadMonthlyAllowanceList()])
      await hydrateBudgetRows()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loadingState.value = "idle"
    }
  }

  async function hydrateBudgetRows() {
    const budgetMap: Record<string, BudgetResponse> = {}
    const allowanceMap: Record<string, MonthlyAllowanceResponse> = {}

    for (const item of budgets.value) {
      const budgetResponse = await adminFetch(
        `/admin/entitlement/budget?budgetKey=${encodeURIComponent(item.budgetKey)}`,
      )
      if (budgetResponse.ok) {
        const budgetData = (await budgetResponse.json()) as BudgetResponse
        budgetMap[item.budgetKey] = budgetData
      }

      const allowanceResponse = await adminFetch(
        `/admin/entitlement/monthly-allowance?budgetKey=${encodeURIComponent(item.budgetKey)}`,
      )
      if (allowanceResponse.ok) {
        const allowanceData = (await allowanceResponse.json()) as MonthlyAllowanceResponse
        allowanceMap[item.budgetKey] = allowanceData
      }
    }

    budgetByKey.value = budgetMap
    monthlyAllowanceByBudgetKey.value = allowanceMap
  }

  function syncSelectedAllowance() {
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
  })

  onMounted(() => {
    document.addEventListener("click", hostAdminBudgetActions.handleDocumentClick)
    void refreshAll()
  })

  onBeforeUnmount(() => {
    document.removeEventListener("click", hostAdminBudgetActions.handleDocumentClick)
  })

  watch(
    selectedBudgetKey,
    (budgetKey) => {
      monthlyAllowanceForm.budgetKey = budgetKey
    },
    { immediate: true },
  )

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
    createBudget,
    creatingBudget,
    editingBudgetKey,
    editingBudgetLabel,
    filteredBudgets,
    goBack,
    copyHostAdminToken,
    openBudgetPage,
    hasHostAdminSessionToken,
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
