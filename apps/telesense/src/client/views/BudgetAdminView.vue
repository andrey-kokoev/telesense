<template>
  <div class="budget-admin">
    <header class="budget-admin__hero">
      <div class="budget-admin__copy">
        <button class="budget-admin__home" :aria-label="t('admin_home')" @click="goHome">
          <img class="budget-admin__home-icon" src="/favicon.svg" alt="" aria-hidden="true" />
        </button>
        <div>
          <p class="budget-admin__kicker">{{ t("budget_admin_kicker") }}</p>
          <h1 class="budget-admin__title">{{ budgetLabel }}</h1>
          <p v-if="showBudgetKey" class="budget-admin__subtitle">{{ budgetKey }}</p>
        </div>
        <button
          v-if="hasHostAdminSession"
          class="budget-admin__host-link"
          type="button"
          @click="goHostAdmin"
        >
          {{ t("budget_admin_back_to_host_admin") }}
        </button>
      </div>
    </header>

    <div v-if="lastError" class="budget-admin__alert" role="alert">{{ lastError }}</div>

    <section v-if="accessState !== 'authorized'" class="budget-admin__panel">
      <p class="budget-admin__hint">{{ t("budget_admin_access_hint") }}</p>
      <form class="budget-admin__form" @submit.prevent="unlockBudgetAdmin">
        <input
          v-model="budgetAdminTokenInput"
          class="budget-admin__input"
          type="password"
          spellcheck="false"
          autocomplete="off"
          :placeholder="t('budget_admin_token_placeholder')"
        />
        <button class="budget-admin__button" :disabled="!budgetAdminTokenInput.trim()">
          {{ t("budget_admin_unlock") }}
        </button>
      </form>
    </section>

    <section v-else class="budget-admin__panel">
      <div class="budget-admin__meta-row">
        <span class="budget-admin__status">{{ budgetStatus }}</span>
        <span class="budget-admin__usage">{{ usageSummary }}</span>
        <span class="budget-admin__usage">{{ usageLimitLabel }}</span>
        <button
          v-if="entitlementTokens.length"
          class="budget-admin__icon-button budget-admin__icon-button--inline budget-admin__create-token-header"
          type="button"
          :title="t('budget_admin_mint_entitlement')"
          :aria-label="t('budget_admin_mint_entitlement')"
          @click="mintEntitlementToken"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <span>{{ t("budget_admin_create_token") }}</span>
        </button>
      </div>

      <div class="budget-admin__usage-strip" :title="usageDetail">
        <div class="budget-admin__usage-bar" aria-hidden="true">
          <span class="budget-admin__usage-fill" :style="{ width: `${usagePercent}%` }"></span>
        </div>
      </div>

      <div class="budget-admin__token-list">
        <div class="budget-admin__token-list-header">
          <div class="budget-admin__token-list-heading">
            <span class="budget-admin__token-list-title">{{
              t("budget_admin_token_list_title")
            }}</span>
            <p class="budget-admin__token-list-subtitle">
              {{ t("budget_admin_token_list_subtitle") }}
            </p>
          </div>
        </div>

        <div v-if="!entitlementTokens.length" class="budget-admin__token-empty">
          <p class="budget-admin__token-empty-copy">{{ t("budget_admin_no_tokens") }}</p>
          <button
            type="button"
            class="budget-admin__icon-button budget-admin__icon-button--inline"
            :title="t('budget_admin_mint_entitlement')"
            :aria-label="t('budget_admin_mint_entitlement')"
            @click="mintEntitlementToken"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
            <span>{{ t("budget_admin_create_token") }}</span>
          </button>
        </div>

        <div
          v-for="token in entitlementTokens"
          :key="token.tokenId"
          class="budget-admin__token-row"
        >
          <VerticalToggle
            :active="token.active"
            :title="
              token.active
                ? t('budget_admin_token_disable_tooltip')
                : t('budget_admin_token_enable_tooltip')
            "
            :aria-label="
              token.active
                ? t('budget_admin_token_disable_tooltip')
                : t('budget_admin_token_enable_tooltip')
            "
            dim-inactive
            @click="toggleEntitlementToken(token)"
          />

          <div class="budget-admin__token-main">
            <div class="budget-admin__token-line">
              <template v-if="editingTokenId === token.tokenId">
                <form
                  class="budget-admin__token-label-edit"
                  @submit.prevent="commitEntitlementTokenLabel(token)"
                >
                  <input
                    :ref="
                      (el) => {
                        if (editingTokenId === token.tokenId) setEditingTokenInput(el)
                      }
                    "
                    :value="tokenDraftLabels[token.tokenId] ?? token.label ?? ''"
                    class="budget-admin__token-label-input"
                    type="text"
                    spellcheck="false"
                    :placeholder="t('budget_admin_token_label_placeholder')"
                    @input="setTokenDraftLabel(token.tokenId, $event)"
                    @click.stop
                    @blur="commitEntitlementTokenLabel(token)"
                    @keydown.enter.prevent="commitEntitlementTokenLabel(token)"
                    @keydown.esc.prevent="cancelEntitlementTokenLabelEdit"
                  />
                </form>
              </template>
              <button
                v-else
                class="budget-admin__token-label-display"
                type="button"
                :title="t('admin_budget_rename')"
                @click.stop="startEntitlementTokenLabelEdit(token)"
              >
                {{ token.label || t("budget_admin_token_label_placeholder") }}
              </button>
              <code
                v-if="token.tokenPreview"
                class="budget-admin__token-id"
                :title="token.tokenPreview"
              >
                {{ token.tokenPreview }}
              </code>
              <span v-else class="budget-admin__token-id budget-admin__token-id--muted">
                {{ t("budget_admin_token_preview_unavailable") }}
              </span>
              <button
                type="button"
                class="budget-admin__icon-button budget-admin__icon-button--copy"
                :title="t('admin_copy_token')"
                :aria-label="t('admin_copy_token')"
                @click="copyEntitlementToken(token)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect
                    x="9"
                    y="9"
                    width="10"
                    height="10"
                    rx="2"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <path
                    d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComponentPublicInstance,
} from "vue"
import VerticalToggle from "../components/VerticalToggle.vue"
import { useAppStore } from "../composables/useAppStore"
import { useI18n } from "../composables/useI18n"
import { useToast } from "../composables/useToast"

type AccessState = "checking" | "authorized" | "unauthorized"
type BudgetResponse = {
  budgetKey: string
  budgetId: string
  allowance: { remainingBytes: number; consumedBytes: number }
  grace: { lifecycle: "active" | "in_grace" | "exhausted"; graceEndsAt: number | null }
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
type EntitlementTokenRecord = {
  tokenId: string
  budgetKey: string
  budgetId: string
  secretVersion: number
  tokenPreview: string | null
  label: string | null
  active: boolean
  createdAt: number
  updatedAt: number
}

const props = defineProps<{ budgetKey: string }>()
const store = useAppStore()
const { t } = useI18n()
const { show } = useToast()
const budget = ref<BudgetResponse | null>(null)
const monthlyAllowance = ref<MonthlyAllowanceResponse | null>(null)
const budgetLabel = ref(props.budgetKey)
const accessState = ref<AccessState>("checking")
const budgetAdminTokenInput = ref("")
const lastError = ref("")
const entitlementTokens = ref<EntitlementTokenRecord[]>([])
const tokenDraftLabels = ref<Record<string, string>>({})
const editingTokenId = ref("")
const editingTokenOriginalLabel = ref("")
const editingTokenInput = ref<HTMLInputElement | null>(null)
const hasHostAdminSession = computed(() => !!store.hostAdminSessionToken.value)
const showBudgetKey = computed(() => budgetLabel.value.trim() !== props.budgetKey.trim())

const budgetStatus = computed(() => {
  switch (budget.value?.grace.lifecycle) {
    case "active":
      return t("admin_status_active")
    case "in_grace":
      return t("admin_status_in_grace")
    case "exhausted":
      return t("admin_status_exhausted")
    default:
      return t("admin_status_loading")
  }
})

const usageSummary = computed(() => {
  if (!budget.value) {
    return "— used"
  }
  const totalBytes =
    monthlyAllowance.value?.resetAmountBytes ??
    budget.value.allowance.remainingBytes + budget.value.allowance.consumedBytes
  if (totalBytes <= 0) return t("admin_budget_used_percent", { percent: "0" })
  const percent = Math.max(
    0,
    Math.min(100, Math.round((budget.value.allowance.consumedBytes / totalBytes) * 100)),
  )
  return t("admin_budget_used_percent", { percent: String(percent) })
})

const usagePercent = computed(() => {
  if (!budget.value) {
    return 0
  }
  const totalBytes =
    monthlyAllowance.value?.resetAmountBytes ??
    budget.value.allowance.remainingBytes + budget.value.allowance.consumedBytes
  if (totalBytes <= 0) return 0
  return Math.max(
    0,
    Math.min(100, Math.round((budget.value.allowance.consumedBytes / totalBytes) * 100)),
  )
})

const usageLimitLabel = computed(() => {
  if (!budget.value && !monthlyAllowance.value) {
    return "— budget size"
  }
  const totalBytes =
    monthlyAllowance.value?.resetAmountBytes ??
    (budget.value?.allowance.remainingBytes ?? 0) + (budget.value?.allowance.consumedBytes ?? 0)
  if (totalBytes <= 0) return "0 B budget size"
  return `${formatBytes(totalBytes)} budget size`
})

const usageDetail = computed(() => {
  if (!budget.value) {
    return ""
  }
  const totalBytes =
    monthlyAllowance.value?.resetAmountBytes ??
    budget.value.allowance.remainingBytes + budget.value.allowance.consumedBytes
  if (totalBytes <= 0) return ""
  return t("admin_budget_used_detail", {
    used: formatBytes(budget.value.allowance.consumedBytes),
    total: formatBytes(totalBytes),
  })
})

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

function goHome() {
  window.location.href = "/"
}

function goHostAdmin() {
  window.location.href = "/host-admin"
}

function adminHeaders() {
  if (store.hostAdminSessionToken.value) {
    return store.getHostAdminHeaders()
  }
  return store.getBudgetAdminHeaders()
}

async function adminFetch(path: string, init: RequestInit = {}) {
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...adminHeaders(),
      ...(init.headers && !Array.isArray(init.headers)
        ? (init.headers as Record<string, string>)
        : {}),
    },
  })
}

async function verifyAccess() {
  if (store.hostAdminSessionToken.value) {
    accessState.value = "authorized"
    return true
  }
  if (
    !store.budgetAdminSessionToken.value ||
    store.budgetAdminBudgetKey.value !== props.budgetKey
  ) {
    accessState.value = "unauthorized"
    return false
  }
  accessState.value = "checking"
  const response = await fetch(
    `/budget-admin/auth/verify?budgetKey=${encodeURIComponent(props.budgetKey)}`,
    { headers: store.getBudgetAdminHeaders() },
  )
  if (!response.ok) {
    accessState.value = "unauthorized"
    store.clearBudgetAdminSession()
    return false
  }
  accessState.value = "authorized"
  return true
}

async function loadBudget() {
  const response = await adminFetch(
    `/admin/entitlement/budget?budgetKey=${encodeURIComponent(props.budgetKey)}`,
  )
  if (!response.ok) throw new Error(await response.text())
  budget.value = (await response.json()) as BudgetResponse
}

async function loadMonthlyAllowance() {
  const response = await adminFetch(
    `/admin/entitlement/monthly-allowance?budgetKey=${encodeURIComponent(props.budgetKey)}`,
  )
  if (!response.ok) throw new Error(await response.text())
  monthlyAllowance.value = (await response.json()) as MonthlyAllowanceResponse
}

async function loadEntitlementTokens() {
  const response = await adminFetch(
    `/admin/entitlement/tokens?budgetKey=${encodeURIComponent(props.budgetKey)}`,
  )
  if (!response.ok) throw new Error(await response.text())
  const data = (await response.json()) as { tokens: EntitlementTokenRecord[] }
  entitlementTokens.value = data.tokens
  tokenDraftLabels.value = Object.fromEntries(
    data.tokens.map((token) => [token.tokenId, token.label ?? ""]),
  )
}

async function loadBudgetLabel() {
  if (!store.hostAdminSessionToken.value) return
  const response = await adminFetch("/admin/host/budgets")
  if (!response.ok) return
  const data = (await response.json()) as {
    budgets: Array<{ budgetKey: string; label: string | null }>
  }
  budgetLabel.value =
    data.budgets.find((item) => item.budgetKey === props.budgetKey)?.label || props.budgetKey
}

async function refresh() {
  lastError.value = ""
  try {
    const ok = await verifyAccess()
    if (!ok) return
    await Promise.all([
      loadBudget(),
      loadMonthlyAllowance(),
      loadBudgetLabel(),
      loadEntitlementTokens(),
    ])
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
  }
}

async function unlockBudgetAdmin() {
  const token = store.sanitizeCredentialToken(budgetAdminTokenInput.value)
  if (!token) return
  lastError.value = ""
  try {
    const response = await fetch("/budget-admin/auth/exchange", {
      method: "POST",
      headers: { "X-Budget-Admin-Token": token },
    })
    if (!response.ok) throw new Error(await response.text())
    const data = (await response.json()) as { budgetKey: string; budgetAdminSessionToken: string }
    store.setBudgetAdminSession(data.budgetAdminSessionToken, data.budgetKey)
    budgetAdminTokenInput.value = ""
    show(t("budget_admin_unlocked"), "success")
    await refresh()
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
    show(lastError.value, "error")
  }
}

async function mintEntitlementToken() {
  try {
    const response = await adminFetch("/admin/entitlement/mint", {
      method: "POST",
      body: JSON.stringify({ budgetKey: props.budgetKey }),
    })
    if (!response.ok) throw new Error(await response.text())
    const data = (await response.json()) as {
      serviceEntitlementToken: string
      tokenId: string
      budgetKey: string
      budgetId: string
      secretVersion: number
    }
    const mintedRecord: EntitlementTokenRecord = {
      tokenId: data.tokenId,
      budgetKey: data.budgetKey,
      budgetId: data.budgetId,
      secretVersion: data.secretVersion,
      tokenPreview:
        data.serviceEntitlementToken.length <= 18
          ? data.serviceEntitlementToken
          : `${data.serviceEntitlementToken.slice(0, 8)}…${data.serviceEntitlementToken.slice(-8)}`,
      label: null,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    entitlementTokens.value = [
      mintedRecord,
      ...entitlementTokens.value.filter((token) => token.tokenId !== mintedRecord.tokenId),
    ]
    tokenDraftLabels.value[mintedRecord.tokenId] = ""
    await loadEntitlementTokens()
    try {
      await navigator.clipboard.writeText(data.serviceEntitlementToken)
      show(t("admin_token_copied"), "success")
    } catch {
      show(t("budget_admin_entitlement_minted"), "success")
    }
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
    show(lastError.value, "error")
  }
}

function setTokenDraftLabel(tokenId: string, event: Event) {
  const target = event.target as HTMLInputElement
  tokenDraftLabels.value[tokenId] = target.value
}

function setEditingTokenInput(el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLInputElement) {
    editingTokenInput.value = el
    return
  }
  if (el instanceof Element) {
    editingTokenInput.value = el instanceof HTMLInputElement ? el : el.querySelector("input")
    return
  }
  if (el && "$el" in el && el.$el instanceof Element) {
    editingTokenInput.value =
      el.$el instanceof HTMLInputElement ? el.$el : el.$el.querySelector("input")
    return
  }
  editingTokenInput.value = null
}

function startEntitlementTokenLabelEdit(token: EntitlementTokenRecord) {
  editingTokenId.value = token.tokenId
  tokenDraftLabels.value[token.tokenId] = token.label ?? ""
  editingTokenOriginalLabel.value = token.label ?? ""
  void nextTick(() => {
    editingTokenInput.value?.focus()
    editingTokenInput.value?.select()
  })
}

function cancelEntitlementTokenLabelEdit() {
  if (!editingTokenId.value) return
  const tokenId = editingTokenId.value
  tokenDraftLabels.value[tokenId] = editingTokenOriginalLabel.value
  editingTokenId.value = ""
  editingTokenOriginalLabel.value = ""
}

function resetEntitlementTokenLabel(token: EntitlementTokenRecord) {
  tokenDraftLabels.value[token.tokenId] = token.label ?? ""
}

async function saveEntitlementTokenLabel(token: EntitlementTokenRecord) {
  const nextLabel = (tokenDraftLabels.value[token.tokenId] ?? "").trim()
  const currentLabel = token.label ?? ""
  if (nextLabel === currentLabel) return

  try {
    const response = await adminFetch("/admin/entitlement/tokens/label", {
      method: "POST",
      body: JSON.stringify({
        budgetKey: props.budgetKey,
        tokenId: token.tokenId,
        label: nextLabel || null,
      }),
    })
    if (!response.ok) throw new Error(await response.text())
    const data = (await response.json()) as { token: EntitlementTokenRecord | null }
    if (data.token) {
      entitlementTokens.value = entitlementTokens.value.map((item) =>
        item.tokenId === data.token?.tokenId ? data.token : item,
      )
      tokenDraftLabels.value[token.tokenId] = data.token.label ?? ""
    }
    show(t("budget_admin_token_label_saved"), "success")
  } catch (error) {
    resetEntitlementTokenLabel(token)
    lastError.value = error instanceof Error ? error.message : String(error)
    show(lastError.value, "error")
  }
}

async function copyEntitlementToken(token: EntitlementTokenRecord) {
  try {
    const response = await adminFetch(
      `/admin/entitlement/tokens/value?budgetKey=${encodeURIComponent(props.budgetKey)}&tokenId=${encodeURIComponent(token.tokenId)}`,
    )
    if (!response.ok) throw new Error(await response.text())
    const data = (await response.json()) as { tokenValue: string | null }
    if (!data.tokenValue) {
      throw new Error("Token value unavailable")
    }
    await navigator.clipboard.writeText(data.tokenValue)
    show(t("admin_token_copied"), "success")
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : String(error)
    show(t("admin_token_copy_failed"), "error")
  }
}

async function commitEntitlementTokenLabel(token: EntitlementTokenRecord) {
  if (editingTokenId.value !== token.tokenId) return
  editingTokenId.value = ""
  editingTokenOriginalLabel.value = ""
  await saveEntitlementTokenLabel(token)
}

async function toggleEntitlementToken(token: EntitlementTokenRecord) {
  const previous = token.active
  entitlementTokens.value = entitlementTokens.value.map((item) =>
    item.tokenId === token.tokenId ? { ...item, active: !item.active } : item,
  )

  try {
    const response = await adminFetch("/admin/entitlement/tokens/active", {
      method: "POST",
      body: JSON.stringify({
        budgetKey: props.budgetKey,
        tokenId: token.tokenId,
        active: !previous,
      }),
    })
    if (!response.ok) throw new Error(await response.text())
    const data = (await response.json()) as { token: EntitlementTokenRecord | null }
    if (data.token) {
      entitlementTokens.value = entitlementTokens.value.map((item) =>
        item.tokenId === data.token?.tokenId ? data.token : item,
      )
    }
  } catch (error) {
    entitlementTokens.value = entitlementTokens.value.map((item) =>
      item.tokenId === token.tokenId ? { ...item, active: previous } : item,
    )
    lastError.value = error instanceof Error ? error.message : String(error)
    show(lastError.value, "error")
  }
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) {
    cancelEntitlementTokenLabelEdit()
    return
  }

  if (
    editingTokenId.value &&
    !target.closest(".budget-admin__token-label-edit") &&
    !target.closest(".budget-admin__token-label-display")
  ) {
    cancelEntitlementTokenLabelEdit()
  }
}

onMounted(() => {
  document.addEventListener("click", handleDocumentClick)
  void refresh()
})

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick)
})
</script>

<style scoped>
.budget-admin {
  --budget-admin-surface: color-mix(in srgb, var(--ui-bg) 90%, var(--ui-text) 10%);
  --budget-admin-surface-soft: color-mix(in srgb, var(--ui-bg) 94%, var(--ui-text) 6%);
  --budget-admin-surface-hover: color-mix(in srgb, var(--ui-bg) 84%, var(--ui-text) 16%);
  min-height: 100vh;
  padding: 2rem 1rem 3rem;
  background: color-mix(in srgb, var(--ui-bg) 96%, var(--ui-text) 4%);
}

.budget-admin__hero,
.budget-admin__panel,
.budget-admin__alert {
  width: min(52rem, 100%);
  margin: 0 auto;
}

.budget-admin__hero {
  margin-bottom: 1.25rem;
}

.budget-admin__copy {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.budget-admin__home {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.85rem;
  background: var(--budget-admin-surface);
}

.budget-admin__home-icon {
  width: 1.4rem;
  height: 1.4rem;
}

.budget-admin__host-link {
  margin-left: auto;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--budget-admin-surface);
  color: var(--ui-text-muted);
  font: inherit;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}

.budget-admin__kicker,
.budget-admin__subtitle,
.budget-admin__hint,
.budget-admin__meta {
  color: var(--ui-text-muted);
}

.budget-admin__kicker {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.budget-admin__title {
  margin: 0;
  font-size: 2rem;
  color: var(--ui-text);
}

.budget-admin__subtitle {
  margin: 0.3rem 0 0;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;
}

.budget-admin__panel {
  display: grid;
  gap: 0.9rem;
  padding: 1.1rem;
  border: 1px solid var(--ui-border);
  border-radius: 1rem;
  background: var(--budget-admin-surface);
}

.budget-admin__alert {
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  border: 1px solid rgb(196 61 47 / 0.22);
  border-radius: 0.9rem;
  color: #a63227;
  background: color-mix(in srgb, #a63227 14%, var(--budget-admin-surface) 86%);
}

.budget-admin__form {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
}

.budget-admin__meta-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: var(--ui-text-muted);
  font-size: 0.85rem;
}

.budget-admin__input {
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  background: var(--budget-admin-surface);
  color: var(--ui-text);
  font: inherit;
  padding: 0.65rem 0.8rem;
}

.budget-admin__button,
.budget-admin__text-button,
.budget-admin__icon-button {
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  background: var(--budget-admin-surface);
  color: var(--ui-text);
  font: inherit;
  padding: 0.65rem 0.8rem;
  cursor: pointer;
}

.budget-admin__icon-button--inline {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 1.9rem;
  width: auto;
  padding: 0 0.65rem;
  border-radius: 999px;
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.budget-admin__create-token-header {
  margin-left: auto;
}

.budget-admin__status {
  color: var(--ui-text);
  font-weight: 600;
}

.budget-admin__usage-strip {
  display: block;
}

.budget-admin__usage-bar {
  width: 100%;
  height: 0.35rem;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-border) 76%, var(--budget-admin-surface) 24%);
}

.budget-admin__usage-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #cb641c;
}

.budget-admin__text-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
}

.budget-admin__token-list {
  display: grid;
  gap: 0.65rem;
}

.budget-admin__token-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.budget-admin__token-list-heading {
  display: grid;
  gap: 0.2rem;
}

.budget-admin__token-list-title {
  color: var(--ui-text);
  font-size: 0.88rem;
  font-weight: 600;
}

.budget-admin__token-list-subtitle {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 0.85rem;
}

.budget-admin__token-empty {
  display: grid;
  justify-items: start;
  justify-content: start;
  align-items: start;
  gap: 0.6rem;
  color: var(--ui-text-muted);
  font-size: 0.9rem;
}

.budget-admin__token-empty-copy {
  margin: 0;
}

.budget-admin__token-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-border) 75%, white 25%);
}

.budget-admin__token-main {
  min-width: 0;
}

.budget-admin__token-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.budget-admin__token-label-edit {
  display: block;
  flex: none;
}

.budget-admin__token-label-display {
  min-width: 0;
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: text;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: color-mix(in srgb, var(--ui-text-muted) 75%, transparent 25%);
  text-underline-offset: 0.18em;
}

.budget-admin__token-label-input {
  min-width: 0;
  width: min(18rem, 100%);
  padding: 0;
  border: 0;
  border-bottom: 1px dotted color-mix(in srgb, var(--ui-text-muted) 75%, transparent 25%);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-weight: 600;
}

.budget-admin__token-label-input:focus {
  outline: none;
  border-bottom-color: var(--ui-primary);
}

.budget-admin__token-id,
.budget-admin__token-version {
  color: var(--ui-text-muted);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;
  font-size: 0.78rem;
}

.budget-admin__token-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
}

.budget-admin__token-meta {
  display: contents;
}

.budget-admin__token-state {
  color: #1f6f43;
  font-size: 0.8rem;
  font-weight: 600;
}

.budget-admin__token-state--off {
  color: var(--ui-text-muted);
}
</style>
