<template>
  <div class="admin-view">
    <header class="admin-hero">
      <div class="admin-hero__copy">
        <button class="admin-home" :aria-label="t('admin_home')" @click="goBack">
          <img class="admin-home__icon" src="/favicon.svg" alt="" aria-hidden="true" />
        </button>
        <div>
          <p class="admin-kicker">{{ t("admin_host_operations") }}</p>
          <h1 class="admin-hero__title">{{ t("admin_title") }}</h1>
          <p class="admin-hero__subtitle">{{ t("admin_subtitle") }}</p>
        </div>
      </div>
    </header>

    <div v-if="lastError" class="admin-alert admin-alert--error" role="alert">
      {{ lastError }}
    </div>

    <section
      v-if="adminAccessState !== 'authorized'"
      class="admin-panel admin-access"
      role="status"
    >
      <div class="admin-panel__header">
        <div>
          <p class="admin-kicker">{{ t("admin_bootstrap_section") }}</p>
          <h2 class="admin-panel__title">
            {{
              adminAccessState === "checking"
                ? t("admin_access_checking")
                : t("admin_access_denied")
            }}
          </h2>
          <p class="admin-panel__hint">
            {{
              adminAccessState === "checking"
                ? t("admin_access_checking_hint")
                : t("admin_access_denied_hint")
            }}
          </p>
        </div>
      </div>

      <form class="admin-form" @submit.prevent="saveHostAdminToken">
        <label class="admin-field">
          <span class="admin-field__label">{{ t("admin_bootstrap_token") }}</span>
          <input
            v-model="hostAdminTokenInput"
            class="admin-input"
            type="password"
            spellcheck="false"
            autocomplete="off"
            :placeholder="t('admin_bootstrap_token_placeholder')"
            :disabled="adminAccessState === 'checking'"
          />
        </label>

        <div class="admin-access__actions">
          <button
            class="admin-btn admin-btn--primary"
            :disabled="!hostAdminTokenInput.trim() || adminAccessState === 'checking'"
          >
            {{ t("admin_bootstrap_save") }}
          </button>
          <button
            v-if="hasHostAdminSessionToken"
            type="button"
            class="admin-btn admin-btn--ghost"
            :disabled="adminAccessState === 'checking'"
            @click="clearStoredHostAdminToken"
          >
            {{ t("admin_bootstrap_clear") }}
          </button>
        </div>
      </form>
    </section>

    <section v-else class="admin-shell">
      <label class="admin-search">
        <input
          v-model="budgetSearch"
          class="admin-input"
          type="search"
          spellcheck="false"
          :placeholder="t('admin_budget_search_placeholder')"
        />
      </label>

      <div v-if="filteredBudgets.length" class="admin-budget-list">
        <article
          v-for="item in filteredBudgets"
          :key="item.budgetKey"
          class="admin-budget"
          :class="{ 'admin-budget--open': item.budgetKey === selectedBudgetKey }"
        >
          <div class="admin-budget__summary">
            <div class="admin-budget__summary-main">
              <button
                class="admin-budget__toggle"
                :aria-expanded="item.budgetKey === selectedBudgetKey"
                :aria-label="
                  item.budgetKey === selectedBudgetKey
                    ? t('admin_budget_collapse')
                    : t('admin_budget_expand')
                "
                @click="selectBudget(item.budgetKey)"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="admin-budget__chevron"
                  :class="{ 'admin-budget__chevron--open': item.budgetKey === selectedBudgetKey }"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <div class="admin-budget__identity">
                <template v-if="editingBudgetKey === item.budgetKey">
                  <form
                    class="admin-budget__label-edit"
                    @submit.prevent="commitBudgetLabel(item.budgetKey)"
                  >
                    <input
                      :ref="
                        (el) => {
                          if (item.budgetKey === editingBudgetKey) setEditingBudgetInput(el)
                        }
                      "
                      v-model="editingBudgetLabel"
                      class="admin-budget__label-input"
                      type="text"
                      spellcheck="false"
                      maxlength="40"
                      @click.stop
                      @keydown.esc.prevent="cancelBudgetLabelEdit"
                      @blur="commitBudgetLabel(item.budgetKey)"
                    />
                  </form>
                </template>
                <strong
                  v-else
                  class="admin-budget__label"
                  :title="t('admin_budget_rename')"
                  @click.stop="startBudgetLabelEdit(item)"
                >
                  {{ item.label || t("admin_budget_unlabeled") }}
                </strong>
                <span>{{ item.budgetKey }}</span>
              </div>
            </div>
            <div class="admin-budget__summary-meta">
              <span class="admin-badge">{{
                formatBudgetLifecycle(budgetLifecycleByKey[item.budgetKey])
              }}</span>
              <div class="admin-budget__menu-wrap">
                <button
                  class="admin-btn admin-btn--ghost admin-btn--compact admin-budget__menu-trigger"
                  :aria-expanded="openBudgetMenuKey === item.budgetKey"
                  @click.stop="toggleBudgetMenu(item.budgetKey)"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
                <div v-if="openBudgetMenuKey === item.budgetKey" class="admin-budget__menu">
                  <button class="admin-budget__menu-item" @click="mintToken(item.budgetKey)">
                    {{ t("admin_mint_button") }}
                  </button>
                  <button
                    class="admin-budget__menu-item admin-budget__menu-item--danger"
                    @click="rotateSecret(item.budgetKey)"
                  >
                    {{ t("admin_rotate_button") }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="item.budgetKey === selectedBudgetKey" class="admin-budget__detail">
            <p class="admin-budget__summaryline">
              <strong>{{ t("admin_budget_remaining") }}</strong>
              {{ budget ? formatBytes(budget.allowance.remainingBytes) : "—" }}
              <span aria-hidden="true">·</span>
              <strong>{{ t("admin_budget_consumed") }}</strong>
              {{ budget ? formatBytes(budget.allowance.consumedBytes) : "—" }}
              <span aria-hidden="true">·</span>
              <strong>{{ t("admin_budget_grace_ends") }}</strong>
              {{ budget ? formatTime(budget.grace.graceEndsAt) : "—" }}
            </p>

            <div class="admin-detail-grid">
              <section class="admin-policy">
                <h3 class="admin-section-label">{{ t("admin_allowance_section") }}</h3>

                <div class="admin-policy-list">
                  <div v-if="hasMultiplePolicies" class="admin-policy-items">
                    <button
                      v-for="allowance in linkedMonthlyAllowances"
                      :key="allowance.allowanceId"
                      class="admin-policy-item"
                      :class="{
                        'admin-policy-item--active': allowance.allowanceId === selectedAllowanceId,
                      }"
                      @click="selectMonthlyAllowance(allowance.allowanceId)"
                    >
                      <strong>{{ allowance.allowanceId }}</strong>
                      <span>{{
                        allowance.active ? allowance.cronExpr : t("admin_monthly_inactive")
                      }}</span>
                    </button>
                  </div>
                </div>

                <form class="admin-form admin-form--policy" @submit.prevent="saveMonthlyAllowance">
                  <button
                    type="button"
                    class="admin-badge admin-badge--toggle"
                    :class="{ 'admin-badge--inactive': !monthlyAllowanceForm.active }"
                    :disabled="loadingState === 'saving-monthly' || !monthlyAllowance"
                    :title="
                      monthlyAllowanceForm.active
                        ? t('admin_monthly_deactivate')
                        : t('admin_monthly_activate')
                    "
                    :aria-label="
                      monthlyAllowanceForm.active
                        ? t('admin_monthly_deactivate')
                        : t('admin_monthly_activate')
                    "
                    @click="toggleMonthlyAllowanceActive"
                  >
                    {{
                      monthlyAllowanceForm.active
                        ? t("admin_status_active")
                        : t("admin_status_inactive")
                    }}
                  </button>

                  <label class="admin-field">
                    <span class="admin-field__label">{{ t("admin_monthly_reset_amount") }}</span>
                    <input
                      v-model="monthlyAllowanceForm.resetAmountGiB"
                      class="admin-input"
                      type="number"
                      min="0"
                      step="0.01"
                    />
                  </label>
                  <label class="admin-field">
                    <span class="admin-field__label admin-field__label--with-action">
                      <span>{{ t("admin_monthly_cron_expr") }}</span>
                      <button
                        type="button"
                        class="admin-info"
                        :aria-label="monthlyNextResetTooltip"
                        :title="monthlyNextResetTooltip"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
                          <path
                            d="M12 10v6"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                          />
                          <circle cx="12" cy="7" r="1.2" fill="currentColor" />
                        </svg>
                      </button>
                    </span>
                    <input
                      v-model="monthlyAllowanceForm.cronExpr"
                      class="admin-input"
                      type="text"
                      spellcheck="false"
                    />
                  </label>

                  <div v-if="monthlyAllowance?.lastResetAt" class="admin-meta-grid">
                    <div class="admin-meta">
                      <span>{{ t("admin_monthly_last_reset") }}</span>
                      <strong>{{ formatTime(monthlyAllowance.lastResetAt) }}</strong>
                    </div>
                  </div>

                  <button
                    v-if="hasMonthlyAllowanceChanges"
                    class="admin-btn admin-btn--primary admin-btn--icon"
                    :disabled="loadingState === 'saving-monthly'"
                    :aria-label="t('admin_monthly_save')"
                    :title="t('admin_monthly_save')"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M5 12.5 9.5 17 19 7.5"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </form>
              </section>
            </div>

            <div v-if="mintedToken" class="admin-card admin-card--inner admin-minted">
              <div class="admin-meta">
                <span>{{ t("admin_token_minted") }}</span>
              </div>
              <div class="admin-actions admin-actions--compact">
                <button
                  class="admin-btn admin-btn--ghost admin-btn--compact"
                  @click="toggleMintedToken"
                >
                  {{ showMintedToken ? t("admin_hide_token") : t("admin_reveal_token") }}
                </button>
                <button
                  class="admin-btn admin-btn--ghost admin-btn--compact"
                  @click="copyMintedToken"
                >
                  {{ t("admin_copy_token") }}
                </button>
              </div>
              <textarea
                v-if="showMintedToken"
                class="admin-textarea"
                readonly
                :value="mintedToken"
              ></textarea>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="admin-card admin-card--empty">
        <p class="admin-card__hint">
          {{ budgets.length ? t("admin_budget_search_empty") : t("admin_not_loaded") }}
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import { useAppStore } from "../composables/useAppStore"
import { useI18n } from "../composables/useI18n"
import { useToast } from "../composables/useToast"

type LoadingState =
  | "idle"
  | "loading"
  | "saving-label"
  | "saving-monthly"
  | "resetting-monthly"
  | "minting"
  | "rotating"
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
const budgetLifecycleByKey = ref<Record<string, BudgetResponse["grace"]["lifecycle"]>>({})
const openBudgetMenuKey = ref("")
const editingBudgetKey = ref("")
const editingBudgetLabel = ref("")
const editingBudgetInput = ref<HTMLInputElement | null>(null)
const mintedToken = ref("")
const showMintedToken = ref(false)
const lastError = ref("")
const loadingState = ref<LoadingState>("idle")
const adminAccessState = ref<AdminAccessState>("checking")
const hostAdminTokenInput = ref("")
const budgetSearch = ref("")

const monthlyAllowanceForm = reactive({
  allowanceId: "global",
  budgetKey: "",
  active: false,
  resetAmountGiB: "0",
  cronExpr: "0 0 1 * *",
})

const GIB = 1024 * 1024 * 1024

const hasHostAdminSessionToken = computed(() => !!store.hostAdminSessionToken.value)
const linkedMonthlyAllowances = computed(() =>
  monthlyAllowances.value.filter((item) => item.budgetKey === selectedBudgetKey.value),
)
const filteredBudgets = computed(() => {
  const query = budgetSearch.value.trim().toLowerCase()
  if (!query) return budgets.value

  return budgets.value.filter((item) =>
    [item.label ?? "", item.budgetKey, item.budgetId].some((value) =>
      value.toLowerCase().includes(query),
    ),
  )
})
const hasMultiplePolicies = computed(() => linkedMonthlyAllowances.value.length > 1)
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

function formatBudgetLifecycle(lifecycle: BudgetResponse["grace"]["lifecycle"] | undefined) {
  if (!lifecycle) return t("admin_status_loading")

  switch (lifecycle) {
    case "active":
      return t("admin_status_active")
    case "in_grace":
      return t("admin_status_in_grace")
    case "exhausted":
      return t("admin_status_exhausted")
  }
}

function formatMonthlyLifecycle(lifecycle: MonthlyAllowanceResponse["lifecycle"]) {
  switch (lifecycle) {
    case "inactive":
      return t("admin_status_inactive")
    case "scheduled":
      return t("admin_status_scheduled")
    case "due":
      return t("admin_status_due")
  }
}

function goBack() {
  window.location.href = "/"
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
    store.setHostAdminSessionToken(exchangeData.hostAdminSessionToken)

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
  budgetLifecycleByKey.value = {}
  monthlyAllowance.value = null
  mintedToken.value = ""
  showMintedToken.value = false
  lastError.value = ""
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
  budgetLifecycleByKey.value = {
    ...budgetLifecycleByKey.value,
    [budget.value.budgetKey]: budget.value.grace.lifecycle,
  }
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

async function selectBudget(budgetKey: string) {
  if (selectedBudgetKey.value === budgetKey) {
    selectedBudgetKey.value = ""
    selectedAllowanceId.value = ""
    openBudgetMenuKey.value = ""
    budget.value = null
    monthlyAllowance.value = null
    return
  }

  if (selectedBudgetKey.value !== budgetKey) {
    mintedToken.value = ""
    showMintedToken.value = false
  }

  openBudgetMenuKey.value = ""
  selectedBudgetKey.value = budgetKey
  syncSelectedAllowance()
  await Promise.all([loadBudget(), loadMonthlyAllowance()])
}

async function selectMonthlyAllowance(allowanceId: string) {
  selectedAllowanceId.value = allowanceId
  await loadMonthlyAllowance()
}

async function saveMonthlyAllowance() {
  await persistMonthlyAllowance(monthlyAllowanceForm.active, true)
}

async function toggleMonthlyAllowanceActive() {
  if (!monthlyAllowance.value) return
  await persistMonthlyAllowance(!monthlyAllowanceForm.active, false)
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
    budgetLifecycleByKey.value = {
      ...budgetLifecycleByKey.value,
      [budget.value.budgetKey]: budget.value.grace.lifecycle,
    }
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

function toggleBudgetMenu(budgetKey: string) {
  openBudgetMenuKey.value = openBudgetMenuKey.value === budgetKey ? "" : budgetKey
}

function setEditingBudgetInput(el: Element | null) {
  editingBudgetInput.value = el instanceof HTMLInputElement ? el : null
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
  void nextTick(() => {
    editingBudgetInput.value?.focus()
    editingBudgetInput.value?.select()
  })
}

function cancelBudgetLabelEdit() {
  editingBudgetKey.value = ""
  editingBudgetLabel.value = ""
}

async function commitBudgetLabel(budgetKey: string) {
  if (editingBudgetKey.value !== budgetKey) return
  const nextLabel = editingBudgetLabel.value.trim()
  cancelBudgetLabelEdit()
  await saveBudgetLabelValue(budgetKey, nextLabel)
}

async function mintToken(budgetKey = selectedBudgetKey.value) {
  if (!budgetKey) return
  loadingState.value = "minting"
  lastError.value = ""
  try {
    openBudgetMenuKey.value = ""
    const response = await adminFetch("/admin/entitlement/mint", {
      method: "POST",
      body: JSON.stringify({ budgetKey }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    const data = (await response.json()) as MintResponse
    mintedToken.value = data.serviceEntitlementToken
    showMintedToken.value = false
    await Promise.all([loadBudgetList(), loadBudget()])
    show(t("admin_token_minted"), "success")
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

async function rotateSecret(budgetKey = selectedBudgetKey.value) {
  if (!budgetKey) return
  loadingState.value = "rotating"
  lastError.value = ""
  try {
    openBudgetMenuKey.value = ""
    const response = await adminFetch("/admin/entitlement/rotate", {
      method: "POST",
      body: JSON.stringify({ budgetKey }),
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
  document.addEventListener("click", handleDocumentClick)
  void refreshAll()
})

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick)
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
  padding: 2rem 1rem 3rem;
  background: color-mix(in srgb, var(--ui-bg) 94%, white 6%);
}

.admin-hero,
.admin-alert,
.admin-access,
.admin-shell {
  width: min(72rem, 100%);
  margin: 0 auto;
}

.admin-hero {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.admin-hero__copy {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.admin-home {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  flex: none;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: 0.9rem;
  background: white;
  color: var(--ui-text);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease;
}

.admin-home:hover {
  border-color: color-mix(in srgb, var(--ui-primary) 40%, var(--ui-border) 60%);
  background: color-mix(in srgb, white 90%, var(--ui-bg) 10%);
}

.admin-home__icon {
  width: 1.5rem;
  height: 1.5rem;
  display: block;
}

.admin-kicker {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.admin-hero__title {
  margin: 0;
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  line-height: 1.05;
  color: var(--ui-text);
}

.admin-hero__subtitle {
  margin: 0.5rem 0 0;
  max-width: 44rem;
  color: var(--ui-text-muted);
}

.admin-shell {
  display: grid;
  gap: 1rem;
}

.admin-card,
.admin-access {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border-radius: 1rem;
  border: 1px solid var(--ui-border);
  background: white;
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.04);
}

.admin-card--inner {
  background: color-mix(in srgb, white 96%, var(--ui-bg) 4%);
}

.admin-card--empty {
  text-align: center;
}

.admin-card__header,
.admin-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.admin-card__header--stack {
  justify-content: flex-start;
}

.admin-card__title,
.admin-panel__title {
  margin: 0;
  font-size: 1.05rem;
  color: var(--ui-text);
}

.admin-card__hint,
.admin-panel__hint,
.admin-panel__empty {
  margin: 0.35rem 0 0;
  color: var(--ui-text-muted);
}

.admin-card__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.admin-search {
  display: block;
}

.admin-btn,
.admin-budget__summary,
.admin-policy-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.7rem 0.95rem;
  border-radius: 0.8rem;
  border: 1px solid var(--ui-border);
  background: white;
  color: var(--ui-text);
  font: inherit;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease;
}

.admin-btn:hover:not(:disabled),
.admin-policy-item:hover,
.admin-budget__summary:hover {
  border-color: color-mix(in srgb, var(--ui-primary) 40%, var(--ui-border) 60%);
  background: color-mix(in srgb, white 90%, var(--ui-bg) 10%);
}

.admin-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.admin-btn--primary {
  background: #cb641c;
  border-color: #cb641c;
  color: white;
}

.admin-btn--ghost {
  background: white;
}

.admin-btn--compact {
  padding: 0.5rem 0.7rem;
  font-size: 0.9rem;
}

.admin-btn--icon {
  width: 2.4rem;
  height: 2.4rem;
  padding: 0;
}

.admin-btn--danger {
  border-color: #d8b3ad;
  color: #9d3023;
}

.admin-alert {
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  border-radius: 0.9rem;
  border: 1px solid rgb(196 61 47 / 0.22);
}

.admin-alert--error {
  color: #a63227;
  background: rgb(255 242 240 / 0.9);
}

.admin-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: white;
  color: var(--ui-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.admin-badge--inactive {
  opacity: 0.7;
}

.admin-access__actions,
.admin-form,
.admin-actions,
.admin-minted,
.admin-policy-list,
.admin-meta-grid {
  display: grid;
  gap: 0.75rem;
}

.admin-actions--compact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.admin-budget-list {
  display: grid;
  gap: 0.75rem;
}

.admin-budget {
  border: 1px solid var(--ui-border);
  border-radius: 1rem;
  background: white;
}

.admin-budget--open {
  border-color: color-mix(in srgb, var(--ui-primary) 35%, var(--ui-border) 65%);
}

.admin-budget__summary {
  width: 100%;
  justify-content: space-between;
  padding: 1rem;
  border: 0;
  border-radius: 1rem;
  text-align: left;
}

.admin-budget__summary-main,
.admin-budget__summary-meta {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.admin-budget__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: white;
  color: var(--ui-text);
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease;
}

.admin-budget__toggle:hover {
  border-color: color-mix(in srgb, var(--ui-primary) 40%, var(--ui-border) 60%);
  background: color-mix(in srgb, white 90%, var(--ui-bg) 10%);
}

.admin-budget__summary-meta {
  justify-content: flex-end;
  min-width: 0;
  position: relative;
}

.admin-budget__identity {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.admin-budget__identity strong {
  color: var(--ui-text);
}

.admin-budget__label {
  cursor: text;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: color-mix(in srgb, var(--ui-text-muted) 75%, transparent 25%);
  text-underline-offset: 0.18em;
}

.admin-budget__label-edit {
  display: block;
}

.admin-budget__label-input {
  width: min(18rem, 100%);
  padding: 0;
  border: 0;
  border-bottom: 1px dotted color-mix(in srgb, var(--ui-text-muted) 75%, transparent 25%);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-weight: 700;
}

.admin-budget__label-input:focus {
  outline: none;
  border-bottom-color: var(--ui-primary);
}

.admin-budget__identity span,
.admin-budget__summary-meta code {
  color: var(--ui-text-muted);
  font-size: 0.85rem;
}

.admin-budget__summary-meta code {
  word-break: break-all;
}

.admin-budget__chevron {
  flex: none;
  transition: transform 140ms ease;
}

.admin-budget__chevron--open {
  transform: rotate(180deg);
}

.admin-budget__detail {
  display: grid;
  gap: 1rem;
  padding: 0 1rem 1rem;
}

.admin-budget__summaryline {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.95rem;
}

.admin-budget__summaryline strong {
  color: var(--ui-text);
  font-weight: 600;
}

.admin-detail-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.admin-policy {
  display: grid;
  gap: 0.85rem;
}

.admin-section-label {
  margin: 0;
  color: var(--ui-text);
  font-size: 0.95rem;
  font-weight: 600;
}

.admin-budget__menu-wrap {
  position: relative;
}

.admin-budget__menu-trigger {
  min-width: 0;
}

.admin-budget__menu {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  z-index: 10;
  min-width: 13rem;
  display: grid;
  gap: 0.15rem;
  padding: 0.35rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.85rem;
  background: white;
  box-shadow: 0 8px 24px rgb(15 23 42 / 0.08);
}

.admin-budget__menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: flex-start;
  padding: 0.55rem 0.7rem;
  border: 0;
  border-radius: 0.65rem;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.admin-budget__menu-item:hover {
  background: color-mix(in srgb, white 90%, var(--ui-bg) 10%);
}

.admin-budget__menu-item--danger {
  color: #9d3023;
}

.admin-policy-items {
  display: grid;
  gap: 0.5rem;
}

.admin-policy-item {
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.admin-policy-item strong {
  color: var(--ui-text);
}

.admin-policy-item span {
  color: var(--ui-text-muted);
  font-size: 0.8rem;
  word-break: break-all;
}

.admin-policy-item--active {
  border-color: color-mix(in srgb, var(--ui-primary) 35%, var(--ui-border) 65%);
  background: color-mix(in srgb, white 90%, var(--ui-bg) 10%);
}

.admin-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.admin-stat {
  display: grid;
  gap: 0.35rem;
  padding: 0.9rem 1rem;
  border-radius: 0.9rem;
  border: 1px solid var(--ui-border);
  background: color-mix(in srgb, white 96%, var(--ui-bg) 4%);
}

.admin-stat strong {
  color: var(--ui-text);
  font-size: 1rem;
}

.admin-stat__label,
.admin-field__label {
  color: var(--ui-text-muted);
  font-size: 0.8rem;
  font-weight: 600;
}

.admin-field__label--with-action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.admin-meta {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  color: var(--ui-text-muted);
}

.admin-meta strong {
  color: var(--ui-text);
}

.admin-field {
  display: grid;
  gap: 0.45rem;
}

.admin-field__hint {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.8rem;
}

.admin-field--checkbox {
  grid-template-columns: auto 1fr;
  align-items: center;
}

.admin-form--policy {
  grid-template-columns: auto auto minmax(10rem, 11rem) minmax(15rem, 1fr) auto;
  align-items: end;
  gap: 0.85rem;
}

.admin-badge--toggle {
  cursor: pointer;
  text-transform: lowercase;
}

.admin-form--policy .admin-meta-grid {
  grid-column: 1 / -2;
}

.admin-input,
.admin-textarea {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: 0.8rem;
  background: white;
  color: var(--ui-text);
  font: inherit;
  padding: 0.75rem 0.9rem;
}

.admin-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: help;
}

.admin-input:focus,
.admin-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border) 50%);
}

.admin-textarea {
  min-height: 8rem;
  resize: vertical;
}

@media (max-width: 720px) {
  .admin-hero {
    flex-direction: column;
  }

  .admin-card__header,
  .admin-card__actions {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 540px) {
  .admin-view {
    padding-inline: 0.75rem;
  }
}
</style>
