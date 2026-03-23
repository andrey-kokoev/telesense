<template>
  <div class="admin-view">
    <header class="admin-hero">
      <div class="admin-hero__copy">
        <HomeLogoButton :aria-label="t('admin_home')" @click="goBack" />
        <div>
          <p class="admin-kicker">{{ t("admin_host_operations") }}</p>
          <h1 class="admin-hero__title">{{ t("admin_title") }}</h1>
          <p class="admin-hero__subtitle">{{ t("admin_subtitle") }}</p>
        </div>
      </div>
      <div v-if="adminAccessState === 'authorized'" class="admin-hero__actions">
        <button
          type="button"
          class="admin-btn admin-btn--ghost admin-btn--compact"
          @click="copyHostAdminToken"
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
          {{ t("admin_bootstrap_copy") }}
        </button>
        <form v-if="creatingBudget" class="admin-inline-create" @submit.prevent="createBudget">
          <input
            :ref="setCreatingBudgetInput"
            v-model="newBudgetKey"
            class="admin-input admin-input--compact"
            type="text"
            spellcheck="false"
            :placeholder="t('admin_budget_new_placeholder')"
            @keydown.esc.prevent="cancelCreateBudget"
          />
          <button class="admin-btn admin-btn--primary admin-btn--compact">
            {{ t("admin_budget_add_confirm") }}
          </button>
        </form>
        <button
          v-else
          type="button"
          class="admin-btn admin-btn--ghost admin-btn--compact admin-inline-action"
          @click="toggleCreateBudget"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <span>{{ t("admin_budget_add") }}</span>
        </button>
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
      <label v-if="budgets.length >= 4" class="admin-search">
        <input
          v-model="budgetSearch"
          class="admin-input"
          type="search"
          spellcheck="false"
          :placeholder="t('admin_budget_search_placeholder')"
        />
      </label>

      <div v-if="filteredBudgets.length" class="admin-budget-list">
        <HostAdminBudgetRow
          v-for="item in filteredBudgets"
          :key="item.budgetKey"
          :budget="item"
          :budget-is-active="budgetIsActive(item.budgetKey)"
          :budget-policy-is-active="budgetPolicyIsActive(item.budgetKey)"
          :policy-badge-label="budgetPolicyBadgeLabel(item.budgetKey)"
          :usage-summary="budgetUsageSummary(item.budgetKey)"
          :is-editing-label="editingBudgetKey === item.budgetKey"
          :editing-budget-label="editingBudgetLabel"
          :is-remaining-override-open="openRemainingOverrideKey === item.budgetKey"
          :is-menu-open="openBudgetMenuKey === item.budgetKey"
          :current-remaining-gib="currentRemainingGiB"
          :monthly-allowance-form="monthlyAllowanceForm"
          :has-monthly-allowance-changes="hasMonthlyAllowanceChanges"
          :monthly-next-reset-tooltip="monthlyNextResetTooltip"
          :loading-state="loadingState"
          :minted-token="selectedBudgetKey === item.budgetKey ? mintedToken : ''"
          :show-minted-token="showMintedToken"
          :set-editing-input-ref="setEditingBudgetInput"
          :budget-activate-title="t('admin_budget_activate')"
          :budget-deactivate-title="t('admin_budget_deactivate')"
          :monthly-activate-title="t('admin_monthly_activate')"
          :monthly-deactivate-title="t('admin_monthly_deactivate')"
          :remaining-override-title="t('admin_budget_remaining_override')"
          :current-remaining-placeholder="t('admin_budget_current_remaining')"
          :remaining-ok-title="t('admin_budget_remaining_ok')"
          :more-actions-title="t('admin_budget_more_actions')"
          :monthly-reset-amount-label="t('admin_monthly_reset_amount')"
          :monthly-cron-label="t('admin_monthly_cron_expr')"
          :monthly-save-title="t('admin_monthly_save')"
          :copy-budget-admin-token-label="t('admin_budget_admin_token_copy')"
          :reveal-token-label="t('admin_reveal_token')"
          :hide-token-label="t('admin_hide_token')"
          :copy-token-label="t('admin_copy_token')"
          :open-budget-title="t('admin_budget_open')"
          :rename-title="t('admin_budget_rename')"
          :unlabeled-label="t('admin_budget_unlabeled')"
          @toggle-budget-active="toggleBudgetActive"
          @start-label-edit="startBudgetLabelEdit"
          @cancel-label-edit="cancelBudgetLabelEdit"
          @commit-label="commitBudgetLabel"
          @update:editing-budget-label="
            editingBudgetLabel = ($event.target as HTMLInputElement)?.value ?? ''
          "
          @open-remaining-override="openRemainingOverride"
          @update:current-remaining-gib="
            currentRemainingGiB = ($event.target as HTMLInputElement)?.value ?? ''
          "
          @save-current-remaining="saveCurrentRemaining"
          @toggle-budget-policy-active="toggleBudgetPolicyActive"
          @open-budget-menu="openBudgetMenu"
          @update:monthly-reset-amount-gib="
            monthlyAllowanceForm.resetAmountGiB = ($event.target as HTMLInputElement)?.value ?? ''
          "
          @update:monthly-cron-expr="
            monthlyAllowanceForm.cronExpr = ($event.target as HTMLInputElement)?.value ?? ''
          "
          @save-monthly-allowance="saveMonthlyAllowance"
          @mint-token="mintToken"
          @toggle-minted-token="toggleMintedToken"
          @copy-minted-token="copyMintedToken"
          @open-budget-page="openBudgetPage"
        />
      </div>

      <div v-else class="admin-card admin-card--empty">
        <p class="admin-card__hint">
          {{ budgets.length ? t("admin_budget_search_empty") : t("admin_not_loaded") }}
        </p>
      </div>
    </section>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue"
import HomeLogoButton from "../components/HomeLogoButton.vue"
import HostAdminBudgetRow from "../components/HostAdminBudgetRow.vue"
import useAdminView from "./AdminView"

export default defineComponent({
  name: "AdminView",
  components: { HomeLogoButton, HostAdminBudgetRow },
  setup: useAdminView,
})
</script>

<style scoped src="./AdminView.css"></style>
