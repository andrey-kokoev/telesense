<template>
  <div class="admin-view">
    <header class="admin-hero">
      <div class="admin-hero__copy">
        <button class="admin-btn admin-btn--ghost admin-hero__back" @click="goBack">
          {{ t("admin_back") }}
        </button>
        <div>
          <p class="admin-kicker">{{ t("admin_host_operations") }}</p>
          <h1 class="admin-hero__title">{{ t("admin_title") }}</h1>
          <p class="admin-hero__subtitle">{{ t("admin_subtitle") }}</p>
        </div>
      </div>

      <button
        class="admin-btn admin-btn--primary"
        :disabled="loadingState === 'loading'"
        @click="refreshAll"
      >
        {{ loadingState === "loading" ? t("admin_loading") : t("admin_refresh") }}
      </button>
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
      <div class="admin-card">
        <div class="admin-card__header">
          <div>
            <h2 class="admin-card__title">{{ t("admin_budgets_title") }}</h2>
            <p class="admin-card__hint">{{ t("admin_registry_hint") }}</p>
          </div>
          <div class="admin-card__actions">
            <span class="admin-badge">{{ budgets.length }}</span>
            <button
              class="admin-btn admin-btn--primary"
              :disabled="loadingState === 'loading'"
              @click="refreshAll"
            >
              {{ loadingState === "loading" ? t("admin_loading") : t("admin_refresh") }}
            </button>
          </div>
        </div>

        <form class="admin-create" @submit.prevent="createBudget">
          <label class="admin-field">
            <span class="admin-field__label">{{ t("admin_budget_key") }}</span>
            <input
              v-model="newBudgetForm.budgetKey"
              class="admin-input"
              type="text"
              spellcheck="false"
              :placeholder="t('admin_new_budget_key_placeholder')"
            />
          </label>
          <label class="admin-field">
            <span class="admin-field__label">{{ t("admin_budget_label") }}</span>
            <input
              v-model="newBudgetForm.label"
              class="admin-input"
              type="text"
              spellcheck="false"
              :placeholder="t('admin_new_budget_label_placeholder')"
            />
          </label>
          <button
            class="admin-btn admin-btn--primary"
            :disabled="loadingState === 'creating-budget' || !newBudgetForm.budgetKey.trim()"
          >
            {{ loadingState === "creating-budget" ? t("admin_saving") : t("admin_budget_new") }}
          </button>
        </form>
      </div>

      <div v-if="budgets.length" class="admin-budget-list">
        <article
          v-for="item in budgets"
          :key="item.budgetKey"
          class="admin-budget"
          :class="{ 'admin-budget--open': item.budgetKey === selectedBudgetKey }"
        >
          <button class="admin-budget__summary" @click="selectBudget(item.budgetKey)">
            <div class="admin-budget__summary-main">
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
              <div class="admin-budget__identity">
                <strong>{{ item.label || t("admin_budget_unlabeled") }}</strong>
                <span>{{ item.budgetKey }}</span>
              </div>
            </div>

            <div class="admin-budget__summary-meta">
              <code>{{ item.budgetId }}</code>
              <span class="admin-badge">
                {{
                  item.budgetKey === selectedBudgetKey
                    ? formatBudgetLifecycle(budget?.grace.lifecycle)
                    : t("admin_status_closed")
                }}
              </span>
            </div>
          </button>

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
              <section class="admin-card admin-card--inner">
                <div class="admin-card__header admin-card__header--stack">
                  <div>
                    <p class="admin-kicker">{{ t("admin_budget_actions_section") }}</p>
                    <h3 class="admin-card__title">{{ t("admin_budget_actions_title") }}</h3>
                  </div>
                </div>

                <form class="admin-form" @submit.prevent="saveBudgetLabel">
                  <label class="admin-field">
                    <span class="admin-field__label">{{ t("admin_budget_label") }}</span>
                    <input
                      v-model="budgetLabelForm"
                      class="admin-input"
                      type="text"
                      :placeholder="selectedBudgetKey"
                      spellcheck="false"
                    />
                  </label>
                  <button
                    class="admin-btn admin-btn--primary"
                    :disabled="loadingState === 'saving-label'"
                  >
                    {{
                      loadingState === "saving-label"
                        ? t("admin_saving")
                        : t("admin_budget_save_label")
                    }}
                  </button>
                </form>

                <div class="admin-actions admin-actions--compact">
                  <button
                    class="admin-btn admin-btn--ghost admin-btn--compact"
                    :disabled="loadingState === 'minting' || !selectedBudgetKey"
                    @click="mintToken"
                  >
                    {{ loadingState === "minting" ? t("admin_minting") : t("admin_mint_button") }}
                  </button>

                  <button
                    class="admin-btn admin-btn--ghost admin-btn--compact"
                    :disabled="loadingState === 'rotating' || !selectedBudgetKey"
                    @click="rotateSecret"
                  >
                    {{
                      loadingState === "rotating" ? t("admin_rotating") : t("admin_rotate_button")
                    }}
                  </button>
                </div>

                <div v-if="mintedToken" class="admin-minted">
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
              </section>

              <section class="admin-card admin-card--inner">
                <div class="admin-card__header">
                  <div>
                    <p class="admin-kicker">{{ t("admin_allowance_section") }}</p>
                    <h3 class="admin-card__title">{{ t("admin_monthly_title") }}</h3>
                  </div>
                  <span
                    v-if="monthlyAllowance"
                    class="admin-badge"
                    :class="{ 'admin-badge--inactive': !monthlyAllowance.active }"
                  >
                    {{ formatMonthlyLifecycle(monthlyAllowance.lifecycle) }}
                  </span>
                </div>

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
                  <div class="admin-policy-list__actions">
                    <p v-if="!linkedMonthlyAllowances.length" class="admin-card__hint">
                      {{ t("admin_monthly_none_for_budget") }}
                    </p>
                    <button
                      v-if="linkedMonthlyAllowances.length"
                      class="admin-btn admin-btn--ghost admin-btn--compact"
                      @click="startNewMonthlyAllowance"
                    >
                      {{ t("admin_monthly_new_secondary") }}
                    </button>
                  </div>
                </div>

                <form class="admin-form" @submit.prevent="saveMonthlyAllowance">
                  <label class="admin-field admin-field--checkbox">
                    <input v-model="monthlyAllowanceForm.active" type="checkbox" />
                    <div>
                      <span class="admin-field__label">{{ t("admin_monthly_active") }}</span>
                      <p class="admin-field__hint">{{ t("admin_monthly_active_hint") }}</p>
                    </div>
                  </label>
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
                    <span class="admin-field__label">{{ t("admin_monthly_cron_expr") }}</span>
                    <input
                      v-model="monthlyAllowanceForm.cronExpr"
                      class="admin-input"
                      type="text"
                      spellcheck="false"
                    />
                    <p class="admin-field__hint">{{ t("admin_monthly_cron_hint") }}</p>
                  </label>

                  <label v-if="isCreatingAdditionalPolicy" class="admin-field">
                    <span class="admin-field__label">{{ t("admin_allowance_id") }}</span>
                    <input
                      v-model="monthlyAllowanceForm.allowanceId"
                      class="admin-input"
                      type="text"
                      spellcheck="false"
                    />
                  </label>
                  <label v-if="isCreatingAdditionalPolicy" class="admin-field">
                    <span class="admin-field__label">{{ t("admin_budget_key") }}</span>
                    <input
                      v-model="monthlyAllowanceForm.budgetKey"
                      class="admin-input"
                      type="text"
                      spellcheck="false"
                      readonly
                    />
                  </label>

                  <div v-if="monthlyAllowance" class="admin-meta-grid">
                    <div class="admin-meta">
                      <span>{{ t("admin_monthly_next_reset") }}</span>
                      <strong>{{ formatTime(monthlyAllowance.nextResetAt) }}</strong>
                    </div>
                    <div class="admin-meta">
                      <span>{{ t("admin_monthly_last_reset") }}</span>
                      <strong>{{ formatTime(monthlyAllowance.lastResetAt) }}</strong>
                    </div>
                  </div>

                  <button
                    class="admin-btn admin-btn--primary"
                    :disabled="loadingState === 'saving-monthly'"
                  >
                    {{
                      loadingState === "saving-monthly"
                        ? t("admin_saving")
                        : t("admin_monthly_save")
                    }}
                  </button>
                </form>
              </section>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="admin-card admin-card--empty">
        <p class="admin-card__hint">{{ t("admin_not_loaded") }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue"
import { useAppStore } from "../composables/useAppStore"
import { useI18n } from "../composables/useI18n"
import { useToast } from "../composables/useToast"

type LoadingState =
  | "idle"
  | "loading"
  | "creating-budget"
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
const mintedToken = ref("")
const showMintedToken = ref(false)
const lastError = ref("")
const loadingState = ref<LoadingState>("idle")
const budgetLabelForm = ref("")
const adminAccessState = ref<AdminAccessState>("checking")
const hostAdminTokenInput = ref("")
const newBudgetForm = reactive({
  budgetKey: "",
  label: "",
})

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
const hasMultiplePolicies = computed(() => linkedMonthlyAllowances.value.length > 1)
const isCreatingAdditionalPolicy = computed(
  () => !selectedAllowanceId.value || !linkedMonthlyAllowances.value.length,
)
const selectedBudgetLabel = computed(
  () => budgets.value.find((item) => item.budgetKey === selectedBudgetKey.value)?.label ?? "",
)

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
  budget.value = null
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
  budgetLabelForm.value = selectedBudgetLabel.value
}

async function loadMonthlyAllowance() {
  if (!selectedAllowanceId.value) {
    monthlyAllowance.value = null
    monthlyAllowanceForm.allowanceId = "global"
    monthlyAllowanceForm.budgetKey = selectedBudgetKey.value
    monthlyAllowanceForm.active = false
    monthlyAllowanceForm.resetAmountGiB = "0"
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

function startNewMonthlyAllowance() {
  selectedAllowanceId.value = ""
  monthlyAllowance.value = null
  monthlyAllowanceForm.allowanceId = `${selectedBudgetKey.value || "global"}-monthly`
  monthlyAllowanceForm.budgetKey = selectedBudgetKey.value
  monthlyAllowanceForm.active = false
  monthlyAllowanceForm.resetAmountGiB = "0"
  monthlyAllowanceForm.cronExpr = "0 0 1 * *"
}

async function selectBudget(budgetKey: string) {
  if (selectedBudgetKey.value === budgetKey) {
    selectedBudgetKey.value = ""
    selectedAllowanceId.value = ""
    budget.value = null
    monthlyAllowance.value = null
    return
  }

  if (selectedBudgetKey.value !== budgetKey) {
    mintedToken.value = ""
    showMintedToken.value = false
  }

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
    const resetAmountBytes = giBStringToBytes(monthlyAllowanceForm.resetAmountGiB)
    if (!Number.isFinite(resetAmountBytes)) {
      throw new Error(t("admin_monthly_invalid_reset_amount"))
    }

    const response = await adminFetch("/admin/entitlement/monthly-allowance", {
      method: "POST",
      body: JSON.stringify({
        allowanceId: monthlyAllowanceForm.allowanceId.trim(),
        budgetKey: monthlyAllowanceForm.budgetKey.trim(),
        active: monthlyAllowanceForm.active,
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
    show(t("admin_monthly_saved"), "success")
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
    show(lastError.value, "error")
  } finally {
    loadingState.value = "idle"
  }
}

async function createBudget() {
  loadingState.value = "creating-budget"
  lastError.value = ""
  try {
    const response = await adminFetch("/admin/entitlement/budget/create", {
      method: "POST",
      body: JSON.stringify({
        budgetKey: newBudgetForm.budgetKey.trim(),
        label: newBudgetForm.label.trim() || null,
      }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }

    const data = (await response.json()) as BudgetResponse
    newBudgetForm.budgetKey = ""
    newBudgetForm.label = ""
    selectedBudgetKey.value = data.budgetKey
    budget.value = data
    budgetLabelForm.value =
      budgets.value.find((item) => item.budgetKey === data.budgetKey)?.label ?? ""
    mintedToken.value = ""
    showMintedToken.value = false
    await Promise.all([loadBudgetList(), loadMonthlyAllowanceList()])
    syncSelectedAllowance()
    await loadMonthlyAllowance()
    show(t("admin_budget_created"), "success")
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
  display: grid;
  gap: 0.75rem;
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
.admin-create,
.admin-actions,
.admin-minted,
.admin-policy-list,
.admin-meta-grid {
  display: grid;
  gap: 0.75rem;
}

.admin-policy-list__actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.admin-actions--compact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.admin-create {
  grid-template-columns: minmax(12rem, 1fr) minmax(12rem, 1fr) auto;
  align-items: end;
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

.admin-budget__summary-meta {
  justify-content: flex-end;
  min-width: 0;
}

.admin-budget__identity {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.admin-budget__identity strong {
  color: var(--ui-text);
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
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

.admin-input:focus,
.admin-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border) 50%);
}

.admin-textarea {
  min-height: 8rem;
  resize: vertical;
}

@media (max-width: 900px) {
  .admin-detail-grid,
  .admin-stats {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .admin-hero {
    flex-direction: column;
  }

  .admin-create,
  .admin-budget__summary,
  .admin-budget__summary-main,
  .admin-budget__summary-meta,
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
