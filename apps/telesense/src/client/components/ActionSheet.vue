<script setup lang="ts">
import { onMounted, onUnmounted } from "vue"

interface Action {
  id: string
  label: string
  icon?: string
  danger?: boolean
}

interface Props {
  open: boolean
  title?: string
  actions: Action[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [actionId: string]
  close: []
}>()

function onSelect(actionId: string) {
  emit("select", actionId)
  emit("close")
}

function onBackdropClick() {
  emit("close")
}

// Close on escape key
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open) {
    emit("close")
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown)
})

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="action-sheet-overlay" @click="onBackdropClick">
        <div class="action-sheet" @click.stop>
          <div v-if="title" class="sheet-title">{{ title }}</div>
          <div class="sheet-actions">
            <button
              v-for="action in actions"
              :key="action.id"
              class="sheet-action"
              :class="{ danger: action.danger }"
              @click="onSelect(action.id)"
            >
              <span v-if="action.icon" class="action-icon">{{ action.icon }}</span>
              {{ action.label }}
            </button>
          </div>
          <button class="sheet-cancel" @click="emit('close')">Cancel</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.action-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 0.5rem 0.5rem;
}

.action-sheet {
  width: 100%;
  max-width: 400px;
  background: var(--ui-bg-elevated);
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.2);
}

.sheet-title {
  padding: 1rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
  border-bottom: 1px solid var(--ui-border);
}

.sheet-actions {
  display: flex;
  flex-direction: column;
}

.sheet-action {
  padding: 1rem;
  background: none;
  border: none;
  border-bottom: 1px solid var(--ui-border);
  font-size: 1rem;
  color: var(--ui-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: background 0.15s;
}

.sheet-action:last-child {
  border-bottom: none;
}

.sheet-action:active {
  background: var(--ui-surface);
}

.sheet-action.danger {
  color: var(--ui-error);
}

.action-icon {
  font-size: 1.25rem;
}

.sheet-cancel {
  width: 100%;
  margin-top: 0.5rem;
  padding: 1rem;
  background: var(--ui-bg-elevated);
  border: none;
  border-radius: 1rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--ui-primary);
  cursor: pointer;
  transition: background 0.15s;
}

.sheet-cancel:active {
  background: var(--ui-surface);
}

/* Transitions */
.sheet-enter-active,
.sheet-leave-active {
  transition: all 0.3s ease;
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .action-sheet,
.sheet-leave-to .action-sheet {
  transform: translateY(100%);
}

.sheet-enter-active .action-sheet,
.sheet-leave-active .action-sheet {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
