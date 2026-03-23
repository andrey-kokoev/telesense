<template>
  <div class="landing__recent-item-main" :style="itemStyle">
    <template v-if="editing">
      <form class="landing__recent-edit" @submit.prevent="emit('save')">
        <input
          ref="editingInput"
          :value="editLabel"
          type="text"
          class="landing__input landing__recent-input"
          maxlength="20"
          @click.stop
          @input="emit('update:editLabel', ($event.target as HTMLInputElement).value)"
          @keydown.esc.prevent="emit('cancel')"
        />
        <button
          type="submit"
          class="landing__recent-icon"
          @click.stop
          :aria-label="t('landing_save_label')"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </form>
    </template>
    <template v-else>
      <span
        class="landing__recent-status-dot"
        :class="`landing__recent-status-dot--${availability}`"
        aria-hidden="true"
      ></span>
      <div class="landing__recent-copy">
        <span v-if="room.name" class="landing__recent-label">{{ room.name }}</span>
        <span class="landing__recent-id" :class="{ 'landing__recent-id--muted': room.name }">
          {{ room.id }}
        </span>
      </div>
      <button
        class="landing__recent-icon"
        @click.stop="emit('startEdit')"
        :aria-label="t('landing_edit_label')"
        :title="t('landing_edit_label')"
        tabindex="-1"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
      <button
        class="landing__recent-icon"
        @click.stop="emit('delete')"
        :aria-label="t('landing_delete_room')"
        :title="t('landing_delete_room')"
        tabindex="-1"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import type { RecentCall } from "../composables/useAppStore"
import { useI18n } from "../composables/useI18n"
import type { Availability } from "../composables/useRecentRoomAvailability"

defineProps<{
  room: RecentCall
  availability: Availability
  editing: boolean
  editLabel: string
  itemStyle?: { transform: string }
}>()

const emit = defineEmits<{
  (e: "startEdit"): void
  (e: "delete"): void
  (e: "save"): void
  (e: "cancel"): void
  (e: "update:editLabel", value: string): void
}>()

const { t } = useI18n()
const editingInput = ref<HTMLInputElement | null>(null)

function focusEditingInput() {
  editingInput.value?.focus()
  editingInput.value?.select()
}

defineExpose({
  focusEditingInput,
})
</script>

<style scoped>
.landing__recent-item-main {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-tertiary);
}

.landing__recent-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.landing__recent-status-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: var(--color-text-tertiary);
  opacity: 0.55;
}

.landing__recent-status-dot--available {
  background: var(--ui-success);
}

.landing__recent-status-dot--queued,
.landing__recent-status-dot--checking {
  background: color-mix(in srgb, var(--color-text-tertiary) 72%, var(--ui-success) 28%);
  opacity: 0.75;
}

.landing__recent-status-dot--unavailable {
  background: color-mix(in srgb, var(--color-text-tertiary) 85%, var(--color-accent) 15%);
  opacity: 0.45;
}

.landing__recent-label {
  font-size: 0.875rem;
  color: var(--color-text-primary);
  font-weight: 500;
  line-height: 1.2;
}

.landing__recent-id {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
  line-height: 1.2;
}

.landing__recent-id--muted {
  color: var(--color-text-secondary);
  font-size: 0.8rem;
}

.landing__recent-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-full);
  opacity: 1;
}

.landing__recent-edit {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
}

.landing__recent-input {
  min-width: 0;
  flex: 1;
  padding: var(--space-2) var(--space-3);
}

@media (pointer: coarse) {
  .landing__recent-item-main {
    background: transparent;
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .landing__recent-id--muted {
    color: color-mix(in srgb, var(--color-text-primary) 72%, var(--color-text-secondary));
  }

  .landing__recent-icon {
    display: none;
  }
}
</style>
