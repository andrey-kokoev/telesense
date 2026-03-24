import { nextTick, type ComponentPublicInstance, type Ref } from "vue"
import { useHostAdminPolicyActions } from "./useHostAdminPolicyActions"
import { useHostAdminRemainingActions } from "./useHostAdminRemainingActions"
import type { BudgetListItem, BudgetResponse, MonthlyAllowanceResponse } from "../types/hostAdmin"

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

export function useHostAdminBudgetActions(options: {
  t: TranslateFn
  show: ToastFn
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>
  selectedBudgetKey: Ref<string>
  selectedAllowanceId: Ref<string>
  budget: Ref<BudgetResponse | null>
  monthlyAllowance: Ref<MonthlyAllowanceResponse | null>
  budgetByKey: Ref<Record<string, BudgetResponse>>
  monthlyAllowanceByBudgetKey: Ref<Record<string, MonthlyAllowanceResponse>>
  openBudgetMenuKey: Ref<string>
  openRemainingOverrideKey: Ref<string>
  editingBudgetKey: Ref<string>
  editingBudgetLabel: Ref<string>
  editingBudgetOriginalLabel: Ref<string>
  editingBudgetInput: Ref<HTMLInputElement | null>
  mintedToken: Ref<string>
  showMintedToken: Ref<boolean>
  lastError: Ref<string>
  loadingState: Ref<LoadingState>
  monthlyAllowanceForm: {
    allowanceId: string
    budgetKey: string
    active: boolean
    resetAmountGiB: string
    cronExpr: string
  }
  currentRemainingGiB: Ref<string>
  creatingBudget: Ref<boolean>
  cancelCreateBudget: () => void
  loadBudget: () => Promise<void>
  loadMonthlyAllowance: () => Promise<void>
  persistMonthlyAllowance: (active: boolean, showSuccessToast: boolean) => Promise<void>
  loadBudgetList: () => Promise<void>
  syncSelectedAllowance: () => void
  budgetPolicyForKey: (budgetKey: string) => MonthlyAllowanceResponse | null
  budgetIsActive: (budgetKey: string) => boolean
  bytesToGiBString: (bytes: number) => string
  giBStringToBytes: (value: string) => number
  saveBudgetLabelValue: (budgetKey: string, label: string) => Promise<boolean>
  onBudgetArchived?: (budgetKey: string) => void
}) {
  const {
    t,
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
    onBudgetArchived,
  } = options

  function setEditingBudgetInput(el: Element | ComponentPublicInstance | null) {
    editingBudgetInput.value = resolveInputRef(el)
  }

  const { saveCurrentRemaining, openRemainingOverride } = useHostAdminRemainingActions({
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
  })

  const { toggleBudgetPolicyActive } = useHostAdminPolicyActions({
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
  })

  async function toggleBudgetActive(budgetKey: string) {
    selectedBudgetKey.value = budgetKey
    loadingState.value = "saving-remaining"
    lastError.value = ""
    try {
      const response = await adminFetch("/admin/entitlement/budget/enabled", {
        method: "POST",
        body: JSON.stringify({
          budgetKey,
          enabled: !budgetIsActive(budgetKey),
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
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
    } finally {
      loadingState.value = "idle"
    }
  }

  async function openBudgetMenu(budgetKey: string) {
    if (openBudgetMenuKey.value === budgetKey) {
      openBudgetMenuKey.value = ""
      return
    }

    openBudgetMenuKey.value = budgetKey
    if (selectedBudgetKey.value !== budgetKey) {
      mintedToken.value = ""
      showMintedToken.value = false
    }
    selectedBudgetKey.value = budgetKey
    syncSelectedAllowance()
    await Promise.all([loadBudget(), loadMonthlyAllowance()])
  }

  function handleDocumentClick(event: MouseEvent) {
    const target = event.target
    if (!(target instanceof Element)) {
      openBudgetMenuKey.value = ""
      cancelBudgetLabelEdit()
      return
    }

    if (!target.closest(".admin-budget__menu-wrap")) {
      openBudgetMenuKey.value = ""
    }

    if (!target.closest(".admin-budget__override-wrap")) {
      openRemainingOverrideKey.value = ""
    }

    if (
      creatingBudget.value &&
      !target.closest(".admin-inline-create") &&
      !target.closest(".admin-inline-action")
    ) {
      cancelCreateBudget()
    }

    if (
      editingBudgetKey.value &&
      !target.closest(".admin-budget__label-edit") &&
      !target.closest(".admin-budget__label")
    ) {
      cancelBudgetLabelEdit()
    }
  }

  function startBudgetLabelEdit(item: BudgetListItem) {
    openBudgetMenuKey.value = ""
    editingBudgetKey.value = item.budgetKey
    editingBudgetLabel.value = item.label ?? ""
    editingBudgetOriginalLabel.value = item.label ?? ""
    void nextTick(() => {
      editingBudgetInput.value?.focus()
      editingBudgetInput.value?.select()
    })
  }

  function cancelBudgetLabelEdit() {
    editingBudgetKey.value = ""
    editingBudgetLabel.value = ""
    editingBudgetOriginalLabel.value = ""
  }

  async function commitBudgetLabel(budgetKey: string) {
    if (editingBudgetKey.value !== budgetKey) return
    const nextLabel = editingBudgetLabel.value.trim()
    const originalLabel = editingBudgetOriginalLabel.value.trim()
    cancelBudgetLabelEdit()
    if (nextLabel === originalLabel) return
    await saveBudgetLabelValue(budgetKey, nextLabel)
  }

  async function mintToken(budgetKey = selectedBudgetKey.value) {
    if (!budgetKey) return
    selectedBudgetKey.value = budgetKey
    loadingState.value = "minting"
    lastError.value = ""
    try {
      openBudgetMenuKey.value = ""
      const response = await adminFetch("/admin/budget-admin/mint", {
        method: "POST",
        body: JSON.stringify({ budgetKey }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const data = (await response.json()) as { budgetAdminToken: string }
      mintedToken.value = data.budgetAdminToken
      showMintedToken.value = false
      await Promise.all([loadBudgetList(), loadBudget()])
      try {
        await navigator.clipboard.writeText(data.budgetAdminToken)
        show(t("admin_token_copied"), "success")
      } catch {
        show(t("admin_token_minted"), "success")
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
    } finally {
      loadingState.value = "idle"
    }
  }

  function toggleMintedToken() {
    showMintedToken.value = !showMintedToken.value
  }

  async function copyMintedToken() {
    if (!mintedToken.value) return
    try {
      await navigator.clipboard.writeText(mintedToken.value)
      show(t("admin_token_copied"), "success")
    } catch {
      show(t("admin_token_copy_failed"), "error")
    }
  }

  async function archiveBudget(budgetKey: string) {
    if (!window.confirm(t("admin_budget_archive_confirm"))) return

    loadingState.value = "archiving-budget"
    lastError.value = ""
    try {
      const response = await adminFetch("/admin/entitlement/budget/archive", {
        method: "POST",
        body: JSON.stringify({ budgetKey }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }

      openBudgetMenuKey.value = ""
      openRemainingOverrideKey.value = ""
      if (selectedBudgetKey.value === budgetKey) {
        selectedBudgetKey.value = ""
        selectedAllowanceId.value = ""
        budget.value = null
        monthlyAllowance.value = null
      }
      delete budgetByKey.value[budgetKey]
      delete monthlyAllowanceByBudgetKey.value[budgetKey]
      mintedToken.value = ""
      showMintedToken.value = false
      await loadBudgetList()
      onBudgetArchived?.(budgetKey)
      show(t("admin_budget_archived"), "success")
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      show(lastError.value, "error")
    } finally {
      loadingState.value = "idle"
    }
  }

  return {
    setEditingBudgetInput,
    saveCurrentRemaining,
    toggleBudgetPolicyActive,
    toggleBudgetActive,
    openRemainingOverride,
    openBudgetMenu,
    handleDocumentClick,
    startBudgetLabelEdit,
    cancelBudgetLabelEdit,
    commitBudgetLabel,
    mintToken,
    toggleMintedToken,
    copyMintedToken,
    archiveBudget,
  }
}
