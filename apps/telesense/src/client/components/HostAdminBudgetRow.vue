<template>
  <article class="admin-budget">
    <div class="admin-budget__summary">
      <VerticalToggle
        :active="budgetIsActive"
        :title="budgetIsActive ? budgetDeactivateTitle : budgetActivateTitle"
        :aria-label="budgetIsActive ? budgetDeactivateTitle : budgetActivateTitle"
        dim-inactive
        @click.stop="$emit('toggle-budget-active', budget.budgetKey)"
      />
      <div class="admin-budget__summary-main">
        <div class="admin-budget__identity">
          <template v-if="isEditingLabel">
            <form
              class="admin-budget__label-edit"
              @submit.prevent="$emit('commit-label', budget.budgetKey)"
            >
              <input
                :ref="setEditingInputRef"
                :value="editingBudgetLabel"
                class="admin-budget__label-input"
                type="text"
                spellcheck="false"
                maxlength="40"
                @input="$emit('update:editing-budget-label', $event)"
                @click.stop
                @keydown.esc.prevent="$emit('cancel-label-edit')"
                @blur="$emit('commit-label', budget.budgetKey)"
              />
            </form>
          </template>
          <strong
            v-else
            class="admin-budget__label"
            :title="renameTitle"
            @click.stop="$emit('start-label-edit', budget)"
          >
            {{ budget.label || unlabeledLabel }}
          </strong>
          <span>{{ budget.budgetKey }}</span>
        </div>
      </div>
      <div class="admin-budget__summary-meta">
        <div v-if="usageSummary" class="admin-budget__usage" :title="usageSummary.title">
          <div class="admin-budget__usage-bar" aria-hidden="true">
            <span
              class="admin-budget__usage-fill"
              :style="{ width: `${usageSummary.percent}%` }"
            ></span>
          </div>
          <span class="admin-budget__usage-label">{{ usageSummary.label }}</span>
        </div>
        <div class="admin-budget__override-wrap">
          <button
            type="button"
            class="admin-badge admin-badge--toggle"
            :class="{ 'admin-badge--inactive': !budgetPolicyIsActive }"
            :title="remainingOverrideTitle"
            :aria-label="remainingOverrideTitle"
            @click.stop="$emit('open-remaining-override', budget.budgetKey)"
          >
            {{ policyBadgeLabel }}
          </button>
          <form
            v-if="isRemainingOverrideOpen"
            class="admin-budget__override-popup"
            @submit.prevent="$emit('save-current-remaining')"
          >
            <label class="admin-budget__override-input-wrap">
              <input
                :value="currentRemainingGiB"
                class="admin-input admin-input--compact"
                type="number"
                min="0"
                step="1"
                :placeholder="currentRemainingPlaceholder"
                @input="$emit('update:current-remaining-gib', $event)"
                @click.stop
              />
              <span class="admin-budget__override-unit">GiB</span>
            </label>
            <button
              class="admin-btn admin-btn--primary admin-btn--compact"
              :disabled="loadingState === 'saving-remaining'"
              :aria-label="remainingOkTitle"
              :title="remainingOkTitle"
            >
              {{ remainingOkTitle }}
            </button>
          </form>
        </div>
        <div class="admin-budget__actions">
          <VerticalToggle
            :active="budgetPolicyIsActive"
            :title="budgetPolicyIsActive ? monthlyDeactivateTitle : monthlyActivateTitle"
            :aria-label="budgetPolicyIsActive ? monthlyDeactivateTitle : monthlyActivateTitle"
            dim-inactive
            @click.stop="$emit('toggle-budget-policy-active', budget.budgetKey)"
          />
          <div class="admin-budget__menu-wrap">
            <button
              class="admin-btn admin-btn--ghost admin-btn--compact admin-budget__menu-trigger"
              :title="moreActionsTitle"
              :aria-label="moreActionsTitle"
              :aria-expanded="isMenuOpen"
              @click.stop="$emit('open-budget-menu', budget.budgetKey)"
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
            <div v-if="isMenuOpen" class="admin-budget__menu">
              <form
                class="admin-budget__menu-form"
                @submit.prevent="$emit('save-monthly-allowance')"
              >
                <label class="admin-field admin-field--inline">
                  <span class="admin-field__label">{{ monthlyResetAmountLabel }}</span>
                  <input
                    :value="monthlyAllowanceForm.resetAmountGiB"
                    class="admin-input admin-input--compact"
                    type="number"
                    min="0"
                    step="0.01"
                    @input="$emit('update:monthly-reset-amount-gib', $event)"
                    @click.stop
                  />
                </label>
                <label class="admin-field admin-field--inline admin-field--cron">
                  <span class="admin-field__label admin-field__label--with-action">
                    <span>{{ monthlyCronLabel }}</span>
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
                          d="M12 8h.01M11 12h1v4h1"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </button>
                  </span>
                  <input
                    :value="monthlyAllowanceForm.cronExpr"
                    class="admin-input admin-input--compact"
                    type="text"
                    spellcheck="false"
                    @input="$emit('update:monthly-cron-expr', $event)"
                    @click.stop
                  />
                </label>
                <button
                  v-if="hasMonthlyAllowanceChanges"
                  class="admin-btn admin-btn--primary admin-btn--compact admin-btn--icon-only"
                  :disabled="loadingState === 'saving-monthly'"
                  :aria-label="monthlySaveTitle"
                  :title="monthlySaveTitle"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M20 6 9 17l-5-5"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </form>

              <div class="admin-budget__menu-token">
                <button
                  type="button"
                  class="admin-budget__menu-item"
                  :disabled="loadingState === 'minting'"
                  @click="$emit('mint-token', budget.budgetKey)"
                >
                  {{ copyBudgetAdminTokenLabel }}
                </button>
                <div v-if="mintedToken" class="admin-token-result">
                  <div class="admin-token-result__actions">
                    <button type="button" class="admin-link" @click="$emit('toggle-minted-token')">
                      {{ showMintedToken ? hideTokenLabel : revealTokenLabel }}
                    </button>
                    <button type="button" class="admin-link" @click="$emit('copy-minted-token')">
                      {{ copyTokenLabel }}
                    </button>
                  </div>
                  <p v-if="showMintedToken" class="admin-token-result__value">
                    {{ mintedToken }}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="admin-btn admin-btn--ghost admin-btn--compact admin-budget__open-trigger"
            :title="openBudgetTitle"
            :aria-label="openBudgetTitle"
            @click.stop="$emit('open-budget-page', budget.budgetKey)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m9 6 6 6-6 6"
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
  </article>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from "vue"
import type { BudgetListItem, BudgetUsageSummary } from "../types/hostAdmin"
import VerticalToggle from "./VerticalToggle.vue"

defineProps<{
  budget: BudgetListItem
  budgetIsActive: boolean
  budgetPolicyIsActive: boolean
  policyBadgeLabel: string
  usageSummary: BudgetUsageSummary | null
  isEditingLabel: boolean
  editingBudgetLabel: string
  isRemainingOverrideOpen: boolean
  isMenuOpen: boolean
  currentRemainingGiB: string
  monthlyAllowanceForm: {
    resetAmountGiB: string
    cronExpr: string
  }
  hasMonthlyAllowanceChanges: boolean
  monthlyNextResetTooltip: string
  loadingState:
    | "idle"
    | "loading"
    | "saving-label"
    | "saving-monthly"
    | "saving-remaining"
    | "minting"
  mintedToken: string
  showMintedToken: boolean
  setEditingInputRef: (el: Element | ComponentPublicInstance | null) => void
  budgetActivateTitle: string
  budgetDeactivateTitle: string
  monthlyActivateTitle: string
  monthlyDeactivateTitle: string
  remainingOverrideTitle: string
  currentRemainingPlaceholder: string
  remainingOkTitle: string
  moreActionsTitle: string
  monthlyResetAmountLabel: string
  monthlyCronLabel: string
  monthlySaveTitle: string
  copyBudgetAdminTokenLabel: string
  revealTokenLabel: string
  hideTokenLabel: string
  copyTokenLabel: string
  openBudgetTitle: string
  renameTitle: string
  unlabeledLabel: string
}>()

defineEmits<{
  "toggle-budget-active": [budgetKey: string]
  "start-label-edit": [budget: BudgetListItem]
  "cancel-label-edit": []
  "commit-label": [budgetKey: string]
  "update:editing-budget-label": [event: Event]
  "open-remaining-override": [budgetKey: string]
  "update:current-remaining-gib": [event: Event]
  "save-current-remaining": []
  "toggle-budget-policy-active": [budgetKey: string]
  "open-budget-menu": [budgetKey: string]
  "update:monthly-reset-amount-gib": [event: Event]
  "update:monthly-cron-expr": [event: Event]
  "save-monthly-allowance": []
  "mint-token": [budgetKey: string]
  "toggle-minted-token": []
  "copy-minted-token": []
  "open-budget-page": [budgetKey: string]
}>()
</script>

<style scoped>
.admin-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.7rem 0.95rem;
  border-radius: 0.8rem;
  border: 1px solid var(--ui-border);
  background: var(--admin-surface);
  color: var(--ui-text);
  font: inherit;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    color 140ms ease;
}

.admin-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ui-primary) 40%, var(--ui-border) 60%);
  background: var(--admin-surface-hover);
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
  background: var(--admin-surface);
}

.admin-btn--compact {
  padding: 0.5rem 0.7rem;
  font-size: 0.9rem;
}

.admin-btn--icon-only {
  width: 2.4rem;
  height: 2.4rem;
  padding: 0;
}

.admin-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
  background: var(--admin-surface);
  color: var(--ui-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.admin-badge--inactive {
  opacity: 0.7;
}

.admin-badge--toggle {
  cursor: pointer;
  text-transform: lowercase;
}

.admin-field {
  display: grid;
  gap: 0.45rem;
}

.admin-field--inline {
  gap: 0.3rem;
}

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

.admin-input {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: 0.8rem;
  background: var(--admin-surface);
  color: var(--ui-text);
  font: inherit;
  padding: 0.75rem 0.9rem;
}

.admin-input--compact {
  padding: 0.55rem 0.7rem;
  border-radius: 0.7rem;
}

.admin-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border) 50%);
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

.admin-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  font: inherit;
  cursor: pointer;
}

.admin-token-result {
  display: grid;
  gap: 0.45rem;
}

.admin-token-result__actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.admin-token-result__value {
  margin: 0;
  color: var(--ui-text-muted);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-all;
}

.admin-budget {
  border: 1px solid var(--ui-border);
  border-radius: 1rem;
  background: var(--admin-surface);
}

.admin-budget__summary {
  display: flex;
  align-items: center;
  width: 100%;
  justify-content: flex-start;
  padding: 1rem;
  border: 0;
  border-radius: 1rem;
  text-align: left;
  gap: 0.45rem;
}

.admin-budget__summary-main,
.admin-budget__summary-meta {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.admin-budget__summary-main {
  flex: 1 1 auto;
  min-width: 0;
}

.admin-budget__summary-meta {
  justify-content: flex-end;
  min-width: 0;
  position: relative;
  gap: 0.65rem;
}

.admin-budget__identity {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
  width: 100%;
  padding: 0 0 0 0.35rem;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.admin-budget__identity strong {
  color: var(--ui-text);
}

.admin-budget__label {
  display: inline-block;
  width: fit-content;
  cursor: text;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: color-mix(in srgb, var(--ui-text-muted) 75%, transparent 25%);
  text-underline-offset: 0.18em;
}

.admin-budget__label-edit {
  display: inline-block;
  width: auto;
}

.admin-budget__label-input {
  width: auto;
  min-width: 6rem;
  max-width: 18rem;
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

.admin-budget__identity span {
  color: var(--ui-text-muted);
  font-size: 0.85rem;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;
}

.admin-budget__usage {
  display: inline-grid;
  gap: 0.25rem;
  justify-items: center;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 0.78rem;
}

.admin-budget__usage-bar {
  width: 4.25rem;
  height: 0.35rem;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-border) 76%, var(--admin-surface) 24%);
}

.admin-budget__usage-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #cb641c;
}

.admin-budget__usage-label {
  white-space: nowrap;
}

.admin-budget__override-wrap {
  position: relative;
}

.admin-budget__override-popup {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.85rem;
  background: var(--admin-surface);
  box-shadow: var(--admin-shadow);
}

.admin-budget__override-popup .admin-input {
  min-width: 8rem;
}

.admin-budget__override-input-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.admin-budget__override-unit {
  color: var(--ui-text-muted);
  font-size: 0.85rem;
  white-space: nowrap;
}

.admin-budget__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

.admin-budget__menu-wrap {
  position: relative;
}

.admin-budget__menu-trigger {
  min-width: 0;
  margin-left: 0.2rem;
}

.admin-budget__open-trigger {
  margin-left: 0;
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
  background: var(--admin-surface);
  box-shadow: var(--admin-shadow);
}

.admin-budget__menu-form {
  display: grid;
  gap: 0.65rem;
  padding: 0.2rem 0.2rem 0.45rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border) 75%, transparent 25%);
  margin-bottom: 0.2rem;
}

.admin-budget__menu-token {
  display: grid;
  gap: 0.5rem;
  padding: 0.2rem 0.2rem 0.45rem;
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
  font-size: 0.88rem;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.admin-budget__menu-item:hover {
  background: var(--admin-surface-hover);
}
</style>
