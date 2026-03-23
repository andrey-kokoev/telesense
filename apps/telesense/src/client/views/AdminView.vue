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
        <article v-for="item in filteredBudgets" :key="item.budgetKey" class="admin-budget">
          <div class="admin-budget__summary">
            <VerticalToggle
              :active="budgetIsActive(item.budgetKey)"
              :title="
                budgetIsActive(item.budgetKey)
                  ? t('admin_budget_deactivate')
                  : t('admin_budget_activate')
              "
              :aria-label="
                budgetIsActive(item.budgetKey)
                  ? t('admin_budget_deactivate')
                  : t('admin_budget_activate')
              "
              dim-inactive
              @click.stop="toggleBudgetActive(item.budgetKey)"
            />
            <div class="admin-budget__summary-main">
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
              <div
                v-if="budgetUsageSummary(item.budgetKey)"
                class="admin-budget__usage"
                :title="budgetUsageSummary(item.budgetKey)?.title"
              >
                <div class="admin-budget__usage-bar" aria-hidden="true">
                  <span
                    class="admin-budget__usage-fill"
                    :style="{ width: `${budgetUsageSummary(item.budgetKey)?.percent ?? 0}%` }"
                  ></span>
                </div>
                <span class="admin-budget__usage-label">
                  {{ budgetUsageSummary(item.budgetKey)?.label }}
                </span>
              </div>
              <div class="admin-budget__override-wrap">
                <button
                  type="button"
                  class="admin-badge admin-badge--toggle"
                  :class="{ 'admin-badge--inactive': !budgetPolicyIsActive(item.budgetKey) }"
                  :title="t('admin_budget_remaining_override')"
                  :aria-label="t('admin_budget_remaining_override')"
                  @click.stop="openRemainingOverride(item.budgetKey)"
                >
                  {{ budgetPolicyBadgeLabel(item.budgetKey) }}
                </button>
                <form
                  v-if="openRemainingOverrideKey === item.budgetKey"
                  class="admin-budget__override-popup"
                  @submit.prevent="saveCurrentRemaining"
                >
                  <label class="admin-budget__override-input-wrap">
                    <input
                      v-model="currentRemainingGiB"
                      class="admin-input admin-input--compact"
                      type="number"
                      min="0"
                      step="1"
                      :placeholder="t('admin_budget_current_remaining')"
                      @click.stop
                    />
                    <span class="admin-budget__override-unit">GiB</span>
                  </label>
                  <button
                    class="admin-btn admin-btn--primary admin-btn--compact"
                    :disabled="loadingState === 'saving-remaining'"
                    :aria-label="t('admin_budget_remaining_ok')"
                    :title="t('admin_budget_remaining_ok')"
                  >
                    {{ t("admin_budget_remaining_ok") }}
                  </button>
                </form>
              </div>
              <div class="admin-budget__actions">
                <VerticalToggle
                  :active="budgetPolicyIsActive(item.budgetKey)"
                  :title="
                    budgetPolicyIsActive(item.budgetKey)
                      ? t('admin_monthly_deactivate')
                      : t('admin_monthly_activate')
                  "
                  :aria-label="
                    budgetPolicyIsActive(item.budgetKey)
                      ? t('admin_monthly_deactivate')
                      : t('admin_monthly_activate')
                  "
                  dim-inactive
                  @click.stop="toggleBudgetPolicyActive(item.budgetKey)"
                />
                <div class="admin-budget__menu-wrap">
                  <button
                    class="admin-btn admin-btn--ghost admin-btn--compact admin-budget__menu-trigger"
                    :title="t('admin_budget_more_actions')"
                    :aria-label="t('admin_budget_more_actions')"
                    :aria-expanded="openBudgetMenuKey === item.budgetKey"
                    @click.stop="openBudgetMenu(item.budgetKey)"
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
                    <form class="admin-budget__menu-form" @submit.prevent="saveMonthlyAllowance">
                      <label class="admin-field admin-field--inline">
                        <span class="admin-field__label">{{
                          t("admin_monthly_reset_amount")
                        }}</span>
                        <input
                          v-model="monthlyAllowanceForm.resetAmountGiB"
                          class="admin-input admin-input--compact"
                          type="number"
                          min="0"
                          step="0.01"
                          @click.stop
                        />
                      </label>
                      <label class="admin-field admin-field--inline admin-field--cron">
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
                              <circle
                                cx="12"
                                cy="12"
                                r="9"
                                stroke="currentColor"
                                stroke-width="2"
                              />
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
                          class="admin-input admin-input--compact"
                          type="text"
                          spellcheck="false"
                          @click.stop
                        />
                      </label>
                      <button
                        v-if="hasMonthlyAllowanceChanges"
                        class="admin-btn admin-btn--primary admin-btn--icon"
                        :disabled="loadingState === 'saving-monthly'"
                        :aria-label="t('admin_monthly_save')"
                        :title="t('admin_monthly_save')"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
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
                    <div
                      v-if="mintedToken && selectedBudgetKey === item.budgetKey"
                      class="admin-budget__menu-token"
                    >
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
                        class="admin-textarea admin-textarea--inline"
                        readonly
                        :value="mintedToken"
                      ></textarea>
                    </div>
                    <button class="admin-budget__menu-item" @click="mintToken(item.budgetKey)">
                      {{ t("admin_budget_admin_token_copy") }}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  class="admin-btn admin-btn--ghost admin-btn--compact admin-budget__open-trigger"
                  :title="t('admin_budget_open')"
                  :aria-label="t('admin_budget_open')"
                  @click.stop="openBudgetPage(item.budgetKey)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
import VerticalToggle from "../components/VerticalToggle.vue"
import useAdminView from "./AdminView"

export default defineComponent({
  name: "AdminView",
  components: { VerticalToggle },
  setup: useAdminView,
})
</script>

<style scoped src="./AdminView.css"></style>
