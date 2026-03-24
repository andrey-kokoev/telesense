<template>
  <div class="budget-admin">
    <header class="budget-admin__hero">
      <div class="budget-admin__copy">
        <HomeLogoButton :ariaLabel="t('admin_home')" @click="goHome" />
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

        <BudgetAdminTokenRow
          v-for="token in entitlementTokens"
          :key="token.tokenId"
          :token="token"
          :draft-label="tokenDraftLabels[token.tokenId] ?? token.label ?? ''"
          :is-editing="editingTokenId === token.tokenId"
          :enable-tooltip="t('budget_admin_token_enable_tooltip')"
          :disable-tooltip="t('budget_admin_token_disable_tooltip')"
          :rename-title="t('admin_budget_rename')"
          :label-placeholder="t('budget_admin_token_label_placeholder')"
          :unavailable-label="t('budget_admin_token_preview_unavailable')"
          :copy-title="t('admin_copy_token')"
          :delete-title="t('budget_admin_token_delete')"
          :set-input-ref="
            (el) => {
              if (editingTokenId === token.tokenId) setEditingTokenInput(el)
            }
          "
          @toggle-active="toggleEntitlementToken"
          @start-label-edit="startEntitlementTokenLabelEdit"
          @cancel-label="cancelEntitlementTokenLabelEdit"
          @commit-label="commitEntitlementTokenLabel"
          @input-label="setTokenDraftLabel(token.tokenId, $event)"
          @copy="copyEntitlementToken"
          @delete="deleteEntitlementToken"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import BudgetAdminTokenRow from "../components/BudgetAdminTokenRow.vue"
import HomeLogoButton from "../components/HomeLogoButton.vue"
import useBudgetAdminPage from "../composables/useBudgetAdminPage"

const props = defineProps<{ budgetKey: string }>()
const {
  t,
  goHome,
  goHostAdmin,
  hasHostAdminSession,
  budgetLabel,
  showBudgetKey,
  accessState,
  budgetAdminTokenInput,
  lastError,
  entitlementTokens,
  tokenDraftLabels,
  editingTokenId,
  budgetStatus,
  usageSummary,
  usagePercent,
  usageLimitLabel,
  usageDetail,
  unlockBudgetAdmin,
  mintEntitlementToken,
  setTokenDraftLabel,
  setEditingTokenInput,
  startEntitlementTokenLabelEdit,
  cancelEntitlementTokenLabelEdit,
  commitEntitlementTokenLabel,
  copyEntitlementToken,
  deleteEntitlementToken,
  toggleEntitlementToken,
} = useBudgetAdminPage(props)
</script>

<style scoped>
.budget-admin {
  --budget-admin-surface: color-mix(
    in srgb,
    var(--color-bg-primary) 90%,
    var(--color-text-primary) 10%
  );
  --budget-admin-surface-soft: color-mix(
    in srgb,
    var(--color-bg-primary) 94%,
    var(--color-text-primary) 6%
  );
  --budget-admin-surface-hover: color-mix(
    in srgb,
    var(--color-bg-primary) 84%,
    var(--color-text-primary) 16%
  );
  min-height: 100vh;
  padding: 2rem 1rem 3rem;
  background: color-mix(in srgb, var(--color-bg-primary) 96%, var(--color-text-primary) 4%);
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

.budget-admin__host-link {
  margin-left: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--budget-admin-surface);
  color: var(--color-text-secondary);
  font: inherit;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}

.budget-admin__kicker,
.budget-admin__subtitle,
.budget-admin__hint,
.budget-admin__meta {
  color: var(--color-text-secondary);
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
  color: var(--color-text-primary);
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
  border: 1px solid var(--color-border);
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
  color: var(--color-text-secondary);
  font-size: 0.85rem;
}

.budget-admin__input {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: var(--budget-admin-surface);
  color: var(--color-text-primary);
  font: inherit;
  padding: 0.65rem 0.8rem;
}

.budget-admin__button,
.budget-admin__text-button,
.budget-admin__icon-button {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: var(--budget-admin-surface);
  color: var(--color-text-primary);
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
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.budget-admin__icon-button--delete {
  color: color-mix(in srgb, #9d3023 80%, var(--color-text-primary) 20%);
}

.budget-admin__create-token-header {
  margin-left: auto;
}

.budget-admin__status {
  color: var(--color-text-primary);
  font-weight: 600;
}

.budget-admin__usage-strip {
  display: block;
}

.budget-admin__usage-bar {
  width: 100%;
  height: 0.35rem;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-border) 76%, var(--budget-admin-surface) 24%);
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
  color: var(--color-text-secondary);
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
  color: var(--color-text-primary);
  font-size: 0.88rem;
  font-weight: 600;
}

.budget-admin__token-list-subtitle {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
}

.budget-admin__token-empty {
  display: grid;
  justify-items: start;
  justify-content: start;
  align-items: start;
  gap: 0.6rem;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.budget-admin__token-empty-copy {
  margin: 0;
}
</style>
