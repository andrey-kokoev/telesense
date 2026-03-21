<template>
  <div class="admin-view">
    <header class="admin-view__header">
      <button class="admin-view__back" @click="goBack">
        {{ t("admin_back") }}
      </button>
      <div>
        <h1 class="admin-view__title">{{ t("admin_title") }}</h1>
        <p class="admin-view__subtitle">{{ t("admin_subtitle") }}</p>
      </div>
      <button
        class="admin-view__refresh"
        :disabled="loadingState === 'loading'"
        @click="refreshAll"
      >
        {{ loadingState === "loading" ? t("admin_loading") : t("admin_refresh") }}
      </button>
    </header>

    <div v-if="lastError" class="admin-view__alert admin-view__alert--error" role="alert">
      {{ lastError }}
    </div>

    <div
      v-if="adminAccessState !== 'authorized'"
      class="admin-view__access admin-card"
      role="status"
    >
      <h2 class="admin-card__title">
        {{
          adminAccessState === "checking" ? t("admin_access_checking") : t("admin_access_denied")
        }}
      </h2>
      <p class="admin-card__hint">
        {{
          adminAccessState === "checking"
            ? t("admin_access_checking_hint")
            : t("admin_access_denied_hint")
        }}
      </p>
    </div>

    <div v-else class="admin-view__grid">
      <section class="admin-card">
        <div class="admin-card__header">
          <h2 class="admin-card__title">{{ t("admin_budgets_title") }}</h2>
          <span class="admin-card__badge">{{ budgets.length }}</span>
        </div>

        <div v-if="budgets.length" class="admin-list">
          <button
            v-for="item in budgets"
            :key="item.budgetKey"
            class="admin-list__item"
            :class="{ 'admin-list__item--active': item.budgetKey === selectedBudgetKey }"
            @click="selectBudget(item.budgetKey)"
          >
            <strong>{{ item.label || item.budgetKey }}</strong>
            <span>{{ item.budgetId }}</span>
          </button>
        </div>
        <p v-else class="admin-card__empty">{{ t("admin_not_loaded") }}</p>
      </section>

      <section class="admin-card admin-card--wide">
        <div class="admin-card__header">
          <h2 class="admin-card__title">{{ t("admin_budget_title") }}</h2>
          <span v-if="budget" class="admin-card__badge">{{ budget.grace.lifecycle }}</span>
        </div>

        <div v-if="budget" class="admin-budget">
          <div class="admin-card__rows">
            <div class="admin-card__row">
              <span>{{ t("admin_budget_label") }}</span>
              <strong>{{ selectedBudgetLabel || "—" }}</strong>
            </div>
            <div class="admin-card__row">
              <span>{{ t("admin_budget_key") }}</span>
              <code>{{ budget.budgetKey }}</code>
            </div>
            <div class="admin-card__row">
              <span>{{ t("admin_budget_id") }}</span>
              <code>{{ budget.budgetId }}</code>
            </div>
            <div class="admin-card__row">
              <span>{{ t("admin_budget_remaining") }}</span>
              <strong>{{ formatBytes(budget.allowance.remainingBytes) }}</strong>
            </div>
            <div class="admin-card__row">
              <span>{{ t("admin_budget_consumed") }}</span>
              <strong>{{ formatBytes(budget.allowance.consumedBytes) }}</strong>
            </div>
            <div class="admin-card__row">
              <span>{{ t("admin_budget_grace_ends") }}</span>
              <strong>{{ formatTime(budget.grace.graceEndsAt) }}</strong>
            </div>
          </div>

          <div class="admin-budget__actions">
            <div class="admin-card__header">
              <h3 class="admin-card__subtitle">{{ t("admin_budget_actions_title") }}</h3>
            </div>
            <form class="admin-card__form" @submit.prevent="saveBudgetLabel">
              <label class="admin-card__field">
                <span>{{ t("admin_budget_label") }}</span>
                <input
                  v-model="budgetLabelForm"
                  class="admin-card__input"
                  type="text"
                  :placeholder="selectedBudgetKey"
                  spellcheck="false"
                />
              </label>
              <button class="admin-card__button" :disabled="loadingState === 'saving-label'">
                {{
                  loadingState === "saving-label" ? t("admin_saving") : t("admin_budget_save_label")
                }}
              </button>
            </form>
            <button
              class="admin-card__button"
              :disabled="loadingState === 'minting' || !selectedBudgetKey"
              @click="mintToken"
            >
              {{ loadingState === "minting" ? t("admin_minting") : t("admin_mint_button") }}
            </button>
            <p class="admin-card__hint">{{ t("admin_mint_hint") }}</p>

            <button
              class="admin-card__button admin-card__button--warn"
              :disabled="loadingState === 'rotating' || !selectedBudgetKey"
              @click="rotateSecret"
            >
              {{ loadingState === "rotating" ? t("admin_rotating") : t("admin_rotate_button") }}
            </button>
            <p class="admin-card__hint">{{ t("admin_secret_hint") }}</p>

            <div v-if="mintedToken" class="admin-card__minted">
              <textarea class="admin-card__textarea" readonly :value="mintedToken"></textarea>
              <div class="admin-card__row">
                <span>{{ t("admin_budget_remaining") }}</span>
                <strong>{{ mintedRemainingBytes }}</strong>
              </div>
              <button class="admin-card__button admin-card__button--ghost" @click="copyMintedToken">
                {{ t("admin_copy_token") }}
              </button>
            </div>
          </div>
        </div>
        <p v-else class="admin-card__empty">{{ t("admin_not_loaded") }}</p>
      </section>

      <section class="admin-card">
        <div class="admin-card__header">
          <h2 class="admin-card__title">{{ t("admin_monthly_list_title") }}</h2>
          <span class="admin-card__badge">{{ linkedMonthlyAllowances.length }}</span>
        </div>

        <div v-if="linkedMonthlyAllowances.length" class="admin-list">
          <button
            v-for="item in linkedMonthlyAllowances"
            :key="item.allowanceId"
            class="admin-list__item"
            :class="{ 'admin-list__item--active': item.allowanceId === selectedAllowanceId }"
            @click="selectMonthlyAllowance(item.allowanceId)"
          >
            <strong>{{ item.allowanceId }}</strong>
            <span>{{ item.active ? item.cronExpr : t("admin_monthly_inactive") }}</span>
          </button>
        </div>
        <p v-else class="admin-card__empty">{{ t("admin_monthly_none_for_budget") }}</p>
      </section>

      <section class="admin-card">
        <div class="admin-card__header">
          <h2 class="admin-card__title">{{ t("admin_monthly_title") }}</h2>
          <span
            v-if="monthlyAllowance"
            class="admin-card__badge"
            :class="{ 'admin-card__badge--inactive': !monthlyAllowance.active }"
          >
            {{ monthlyAllowance.lifecycle }}
          </span>
        </div>

        <button
          class="admin-card__button admin-card__button--ghost"
          @click="startNewMonthlyAllowance"
        >
          {{ t("admin_monthly_new") }}
        </button>

        <form class="admin-card__form" @submit.prevent="saveMonthlyAllowance">
          <label class="admin-card__field">
            <span>{{ t("admin_allowance_id") }}</span>
            <input
              v-model="monthlyAllowanceForm.allowanceId"
              class="admin-card__input"
              type="text"
              spellcheck="false"
            />
          </label>
          <label class="admin-card__field">
            <span>{{ t("admin_budget_key") }}</span>
            <input
              v-model="monthlyAllowanceForm.budgetKey"
              class="admin-card__input"
              type="text"
              spellcheck="false"
              readonly
            />
          </label>
          <label class="admin-card__field admin-card__field--checkbox">
            <input v-model="monthlyAllowanceForm.active" type="checkbox" />
            <span>{{ t("admin_monthly_active") }}</span>
          </label>
          <label class="admin-card__field">
            <span>{{ t("admin_monthly_reset_amount") }}</span>
            <input
              v-model="monthlyAllowanceForm.resetAmountBytes"
              class="admin-card__input"
              type="number"
              min="0"
              step="1"
            />
          </label>
          <label class="admin-card__field">
            <span>{{ t("admin_monthly_cron_expr") }}</span>
            <input
              v-model="monthlyAllowanceForm.cronExpr"
              class="admin-card__input"
              type="text"
              spellcheck="false"
            />
          </label>
          <div v-if="monthlyAllowance" class="admin-card__rows admin-card__rows--compact">
            <div class="admin-card__row">
              <span>{{ t("admin_monthly_next_reset") }}</span>
              <strong>{{ formatTime(monthlyAllowance.nextResetAt) }}</strong>
            </div>
            <div class="admin-card__row">
              <span>{{ t("admin_monthly_last_reset") }}</span>
              <strong>{{ formatTime(monthlyAllowance.lastResetAt) }}</strong>
            </div>
          </div>
          <button class="admin-card__button" :disabled="loadingState === 'saving-monthly'">
            {{ loadingState === "saving-monthly" ? t("admin_saving") : t("admin_monthly_save") }}
          </button>
        </form>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue"
import { useAppStore } from "../composables/useAppStore"
import { useI18n } from "../composables/useI18n"
import { useToast } from "../composables/useToast"

type LoadingState = "idle" | "loading" | "saving-label" | "saving-monthly" | "minting" | "rotating"
type AdminAccessState = "checking" | "authorized" | "unauthorized"

type BudgetListItem = {
  budgetKey: string
  budgetId: string
  label: string | null
  createdAt: number
  updatedAt: number
}

type MonthlyAllowanceListItem = {
  allowanceId: string
  budgetKey: string
  active: boolean
  cronExpr: string
  createdAt: number
  updatedAt: number
}

type BudgetResponse = {
  budgetKey: string
  budgetId: string
  allowance: {
    remainingBytes: number
    consumedBytes: number
  }
  grace: {
    lifecycle: "active" | "in_grace" | "exhausted"
    graceEndsAt: number | null
  }
}

type MonthlyAllowanceResponse = {
  allowanceId: string
  budgetKey: string
  resetAmountBytes: number
  cronExpr: string
  active: boolean
  nextResetAt: number | null
  lastResetAt: number | null
  lifecycle: "inactive" | "scheduled" | "due"
}

type MintResponse = {
  serviceEntitlementToken: string
  remainingBytes: number
}

const store = useAppStore()
const { t } = useI18n()
const { show } = useToast()

const budgets = ref<BudgetListItem[]>([])
const monthlyAllowances = ref<MonthlyAllowanceListItem[]>([])
const selectedBudgetKey = ref("")
const selectedAllowanceId = ref("")
const budget = ref<BudgetResponse | null>(null)
const monthlyAllowance = ref<MonthlyAllowanceResponse | null>(null)
const mintedToken = ref("")
const mintedRemainingBytes = ref("")
const lastError = ref("")
const loadingState = ref<LoadingState>("idle")
const budgetLabelForm = ref("")
const adminAccessState = ref<AdminAccessState>("checking")

const monthlyAllowanceForm = reactive({
  allowanceId: "global",
  budgetKey: "",
  active: false,
  resetAmountBytes: "0",
  cronExpr: "0 0 1 * *",
})

const hasAdminToken = computed(() => !!store.serviceEntitlementToken.value)
const linkedMonthlyAllowances = computed(() =>
  monthlyAllowances.value.filter((item) => item.budgetKey === selectedBudgetKey.value),
)
const selectedBudgetLabel = computed(
  () => budgets.value.find((item) => item.budgetKey === selectedBudgetKey.value)?.label ?? "",
)

function goBack() {
  window.location.search = ""
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

function formatTime(timestamp: number | null | undefined) {
  if (!timestamp) return "—"
  return new Date(timestamp).toLocaleString()
}

async function adminFetch(path: string, init: RequestInit = {}) {
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...store.getServiceEntitlementHeaders(),
      ...(init.headers && !Array.isArray(init.headers)
        ? (init.headers as Record<string, string>)
        : {}),
    },
  })
}

async function loadBudgetList() {
  const response = await adminFetch("/admin/host/budgets")
  if (!response.ok) throw new Error(await response.text())
  const data = (await response.json()) as { budgets: BudgetListItem[] }
  budgets.value = data.budgets
  if (!selectedBudgetKey.value && data.budgets.length > 0) {
    selectedBudgetKey.value = data.budgets[0].budgetKey
  }
}

async function verifyAdminAccess() {
  if (!hasAdminToken.value) {
    adminAccessState.value = "unauthorized"
    return false
  }

  adminAccessState.value = "checking"
  const response = await adminFetch("/admin/host/budgets")
  if (!response.ok) {
    adminAccessState.value = "unauthorized"
    throw new Error(await response.text())
  }

  const data = (await response.json()) as { budgets: BudgetListItem[] }
  budgets.value = data.budgets
  if (!selectedBudgetKey.value && data.budgets.length > 0) {
    selectedBudgetKey.value = data.budgets[0].budgetKey
  }
  adminAccessState.value = "authorized"
  return true
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
  budgetLabelForm.value = selectedBudgetLabel.value
}

async function loadMonthlyAllowance() {
  if (!selectedAllowanceId.value) {
    monthlyAllowance.value = null
    monthlyAllowanceForm.allowanceId = "global"
    monthlyAllowanceForm.budgetKey = selectedBudgetKey.value
    monthlyAllowanceForm.active = false
    monthlyAllowanceForm.resetAmountBytes = "0"
    monthlyAllowanceForm.cronExpr = "0 0 1 * *"
    return
  }

  const response = await adminFetch(
    `/admin/entitlement/monthly-allowance?allowanceId=${encodeURIComponent(selectedAllowanceId.value)}`,
  )
  if (!response.ok) throw new Error(await response.text())

  const data = (await response.json()) as MonthlyAllowanceResponse
  monthlyAllowance.value = data
  monthlyAllowanceForm.allowanceId = data.allowanceId
  monthlyAllowanceForm.budgetKey = data.budgetKey
  monthlyAllowanceForm.active = data.active
  monthlyAllowanceForm.resetAmountBytes = String(data.resetAmountBytes)
  monthlyAllowanceForm.cronExpr = data.cronExpr
}

async function refreshAll() {
  loadingState.value = "loading"
  lastError.value = ""
  try {
    const authorized = await verifyAdminAccess()
    if (!authorized) return
    await loadMonthlyAllowanceList()
    await Promise.all([loadBudget(), loadMonthlyAllowance()])
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loadingState.value = "idle"
  }
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

function startNewMonthlyAllowance() {
  selectedAllowanceId.value = ""
  monthlyAllowance.value = null
  monthlyAllowanceForm.allowanceId = `${selectedBudgetKey.value || "global"}-monthly`
  monthlyAllowanceForm.budgetKey = selectedBudgetKey.value
  monthlyAllowanceForm.active = false
  monthlyAllowanceForm.resetAmountBytes = "0"
  monthlyAllowanceForm.cronExpr = "0 0 1 * *"
}

async function selectBudget(budgetKey: string) {
  selectedBudgetKey.value = budgetKey
  syncSelectedAllowance()
  await Promise.all([loadBudget(), loadMonthlyAllowance()])
}

async function selectMonthlyAllowance(allowanceId: string) {
  selectedAllowanceId.value = allowanceId
  await loadMonthlyAllowance()
}

async function saveMonthlyAllowance() {
  loadingState.value = "saving-monthly"
  lastError.value = ""
  try {
    const response = await adminFetch("/admin/entitlement/monthly-allowance", {
      method: "POST",
      body: JSON.stringify({
        allowanceId: monthlyAllowanceForm.allowanceId.trim(),
        budgetKey: monthlyAllowanceForm.budgetKey.trim(),
        active: monthlyAllowanceForm.active,
        resetAmountBytes: Number.parseInt(monthlyAllowanceForm.resetAmountBytes, 10),
        cronExpr: monthlyAllowanceForm.cronExpr.trim(),
      }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    const data = (await response.json()) as MonthlyAllowanceResponse
    monthlyAllowance.value = data
    selectedAllowanceId.value = data.allowanceId
    selectedBudgetKey.value = data.budgetKey
    syncSelectedAllowance()
    await Promise.all([loadBudgetList(), loadMonthlyAllowanceList(), loadBudget()])
    show(t("admin_monthly_saved"), "success")
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
    show(lastError.value, "error")
  } finally {
    loadingState.value = "idle"
  }
}

async function saveBudgetLabel() {
  if (!selectedBudgetKey.value) return

  loadingState.value = "saving-label"
  lastError.value = ""
  try {
    const response = await adminFetch("/admin/entitlement/budget-label", {
      method: "POST",
      body: JSON.stringify({
        budgetKey: selectedBudgetKey.value,
        label: budgetLabelForm.value,
      }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    budget.value = (await response.json()) as BudgetResponse
    await loadBudgetList()
    show(t("admin_budget_label_saved"), "success")
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
    show(lastError.value, "error")
  } finally {
    loadingState.value = "idle"
  }
}

async function mintToken() {
  if (!selectedBudgetKey.value) return

  loadingState.value = "minting"
  lastError.value = ""
  try {
    const response = await adminFetch("/admin/entitlement/mint", {
      method: "POST",
      body: JSON.stringify({ budgetKey: selectedBudgetKey.value }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    const data = (await response.json()) as MintResponse
    mintedToken.value = data.serviceEntitlementToken
    mintedRemainingBytes.value = formatBytes(data.remainingBytes)
    await Promise.all([loadBudgetList(), loadBudget()])
    show(t("admin_token_minted"), "success")
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
    show(lastError.value, "error")
  } finally {
    loadingState.value = "idle"
  }
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

async function rotateSecret() {
  if (!selectedBudgetKey.value) return

  loadingState.value = "rotating"
  lastError.value = ""
  try {
    const response = await adminFetch("/admin/entitlement/rotate", {
      method: "POST",
      body: JSON.stringify({ budgetKey: selectedBudgetKey.value }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    await Promise.all([loadBudgetList(), loadBudget()])
    show(t("admin_secret_rotated"), "success")
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
    show(lastError.value, "error")
  } finally {
    loadingState.value = "idle"
  }
}

onMounted(() => {
  void refreshAll()
})

watch(
  selectedBudgetKey,
  (budgetKey) => {
    monthlyAllowanceForm.budgetKey = budgetKey
  },
  { immediate: true },
)
</script>

<style scoped>
.admin-view {
  min-height: 100vh;
  padding: var(--space-6) var(--space-4) var(--space-8);
  background: var(--color-bg-primary);
}

.admin-view__header {
  width: min(72rem, 100%);
  margin: 0 auto var(--space-6);
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-4);
  align-items: start;
}

.admin-view__back,
.admin-view__refresh,
.admin-card__button,
.admin-list__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font: inherit;
  cursor: pointer;
}

.admin-view__refresh:disabled,
.admin-card__button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.admin-view__title {
  margin: 0;
  font-size: 1.75rem;
  color: var(--color-text-primary);
}

.admin-view__subtitle {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
}

.admin-view__alert {
  width: min(72rem, 100%);
  margin: 0 auto var(--space-6);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
}

.admin-view__alert--error {
  color: var(--color-danger, #c43d2f);
  background: color-mix(in srgb, var(--color-bg-secondary) 82%, #c43d2f 18%);
}

.admin-view__access {
  width: min(48rem, 100%);
  margin: 0 auto;
}

.admin-view__grid {
  width: min(72rem, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  gap: var(--space-4);
}

.admin-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-bg-secondary);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.12),
    0 8px 24px rgb(0 0 0 / 0.08);
}

.admin-card--wide {
  grid-column: span 2;
}

.admin-card__header {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: center;
}

.admin-card__title {
  margin: 0;
  font-size: 1rem;
  color: var(--color-text-primary);
}

.admin-card__subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-primary);
}

.admin-card__badge {
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  text-transform: uppercase;
}

.admin-card__badge--inactive {
  opacity: 0.7;
}

.admin-list {
  display: grid;
  gap: var(--space-2);
}

.admin-list__item {
  justify-content: space-between;
  flex-direction: column;
  align-items: flex-start;
}

.admin-list__item span {
  color: var(--color-text-secondary);
  font-size: 0.8rem;
  word-break: break-all;
}

.admin-list__item--active {
  border-color: var(--color-accent, #d96b1d);
  background: color-mix(in srgb, var(--color-bg-secondary) 82%, #d96b1d 18%);
}

.admin-budget {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(18rem, 0.9fr);
  gap: var(--space-5);
}

.admin-budget__actions {
  display: grid;
  align-content: start;
  gap: var(--space-3);
  padding-left: var(--space-4);
  border-left: 1px solid var(--color-border);
}

.admin-card__rows {
  display: grid;
  gap: var(--space-2);
}

.admin-card__rows--compact {
  margin-top: var(--space-2);
}

.admin-card__row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  align-items: center;
  color: var(--color-text-secondary);
}

.admin-card__row strong,
.admin-card__row code {
  color: var(--color-text-primary);
}

.admin-card__row code {
  font-size: 0.75rem;
  word-break: break-all;
}

.admin-card__form {
  display: grid;
  gap: var(--space-3);
}

.admin-card__field {
  display: grid;
  gap: var(--space-2);
  color: var(--color-text-secondary);
}

.admin-card__field--checkbox {
  grid-template-columns: auto 1fr;
  align-items: center;
}

.admin-card__input,
.admin-card__textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font: inherit;
  padding: var(--space-3);
}

.admin-card__textarea {
  min-height: 7rem;
  resize: vertical;
}

.admin-card__button--ghost {
  background: transparent;
}

.admin-card__button--warn {
  border-color: color-mix(in srgb, var(--color-border) 65%, #c43d2f 35%);
}

.admin-card__hint,
.admin-card__empty {
  margin: 0;
  color: var(--color-text-secondary);
}

.admin-card__minted {
  display: grid;
  gap: var(--space-3);
}

@media (max-width: 720px) {
  .admin-view__header {
    grid-template-columns: 1fr;
  }

  .admin-card--wide {
    grid-column: auto;
  }

  .admin-budget {
    grid-template-columns: 1fr;
  }

  .admin-budget__actions {
    padding-left: 0;
    border-left: 0;
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-4);
  }
}
</style>
