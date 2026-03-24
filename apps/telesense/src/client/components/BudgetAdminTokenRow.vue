<template>
  <div class="budget-admin-token-row">
    <VerticalToggle
      :active="token.active"
      :title="token.active ? disableTooltip : enableTooltip"
      :aria-label="token.active ? disableTooltip : enableTooltip"
      dim-inactive
      @click="$emit('toggle-active', token)"
    />

    <div class="budget-admin-token-row__main">
      <div class="budget-admin-token-row__line">
        <template v-if="isEditing">
          <form
            class="budget-admin-token-row__label-edit"
            data-budget-token-label-edit
            @submit.prevent="$emit('commit-label', token)"
          >
            <input
              :ref="setInputRef"
              :value="draftLabel"
              class="budget-admin-token-row__label-input"
              type="text"
              spellcheck="false"
              :placeholder="labelPlaceholder"
              @input="$emit('input-label', $event)"
              @click.stop
              @blur="$emit('commit-label', token)"
              @keydown.enter.prevent="$emit('commit-label', token)"
              @keydown.esc.prevent="$emit('cancel-label')"
            />
          </form>
        </template>
        <button
          v-else
          class="budget-admin-token-row__label-display"
          data-budget-token-label-display
          type="button"
          :title="renameTitle"
          @click.stop="$emit('start-label-edit', token)"
        >
          {{ token.label || labelPlaceholder }}
        </button>
        <code
          v-if="token.tokenPreview"
          class="budget-admin-token-row__token-id"
          :title="token.tokenPreview"
        >
          {{ token.tokenPreview }}
        </code>
        <span
          v-else
          class="budget-admin-token-row__token-id budget-admin-token-row__token-id--muted"
        >
          {{ unavailableLabel }}
        </span>
        <button
          type="button"
          class="budget-admin-token-row__icon-button"
          :title="copyTitle"
          :aria-label="copyTitle"
          @click="$emit('copy', token)"
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
        <button
          type="button"
          class="budget-admin-token-row__icon-button budget-admin-token-row__icon-button--delete"
          :title="deleteTitle"
          :aria-label="deleteTitle"
          @click="$emit('delete', token)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path
              d="M10 11v6M14 11v6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <path
              d="M6 7l1 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-11"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
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
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from "vue"
import VerticalToggle from "./VerticalToggle.vue"
import type { EntitlementTokenRecord } from "../types/entitlementTokens"

defineProps<{
  token: EntitlementTokenRecord
  draftLabel: string
  isEditing: boolean
  enableTooltip: string
  disableTooltip: string
  renameTitle: string
  labelPlaceholder: string
  unavailableLabel: string
  copyTitle: string
  deleteTitle: string
  setInputRef: (el: Element | ComponentPublicInstance | null) => void
}>()

defineEmits<{
  "toggle-active": [token: EntitlementTokenRecord]
  "start-label-edit": [token: EntitlementTokenRecord]
  "cancel-label": []
  "commit-label": [token: EntitlementTokenRecord]
  "input-label": [event: Event]
  copy: [token: EntitlementTokenRecord]
  delete: [token: EntitlementTokenRecord]
}>()
</script>

<style scoped>
.budget-admin-token-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 0;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 75%, white 25%);
}

.budget-admin-token-row__main {
  min-width: 0;
}

.budget-admin-token-row__line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.budget-admin-token-row__label-edit {
  display: block;
  flex: none;
}

.budget-admin-token-row__label-display {
  min-width: 0;
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-primary);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: text;
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--color-text-secondary-faded);
  text-underline-offset: 0.18em;
}

.budget-admin-token-row__label-input {
  min-width: 0;
  width: min(18rem, 100%);
  padding: 0;
  border: 0;
  border-bottom: 1px dotted var(--color-text-secondary-faded);
  background: transparent;
  color: var(--color-text-primary);
  font: inherit;
  font-weight: 600;
}

.budget-admin-token-row__label-input:focus {
  outline: none;
  border-bottom-color: var(--color-accent);
}

.budget-admin-token-row__token-id {
  color: var(--color-text-secondary);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
    monospace;
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
}

.budget-admin-token-row__token-id--muted {
  opacity: 0.6;
}

.budget-admin-token-row__icon-button {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--color-bg-primary) 90%, var(--color-text-primary) 10%);
  color: var(--color-text-primary);
  font: inherit;
  padding: 0.65rem 0.8rem;
  cursor: pointer;
}

.budget-admin-token-row__icon-button--delete {
  color: color-mix(in srgb, #9d3023 80%, var(--color-text-primary) 20%);
}
</style>
