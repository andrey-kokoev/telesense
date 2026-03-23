<template>
  <div class="landing__recent">
    <div class="landing__recent-header">
      <button
        type="button"
        class="landing__recent-title"
        :class="{ 'landing__recent-title--interactive': activeOnly }"
        :disabled="!activeOnly"
        @click="activeOnly && emit('toggle-active-only')"
      >
        {{ title }}
      </button>
      <button
        v-if="activeCount > 0"
        type="button"
        class="landing__recent-filter"
        :class="{ 'landing__recent-filter--active': activeOnly }"
        :aria-pressed="activeOnly"
        :title="activeOnly ? 'Showing active rooms only' : 'Show active rooms only'"
        aria-label="Show active rooms only"
        @click="emit('toggle-active-only')"
      >
        <span class="landing__recent-filter-dot" aria-hidden="true"></span>
        <span class="landing__recent-filter-label">Active</span>
        <span v-if="activeCount > 0" class="landing__recent-filter-count">({{ activeCount }})</span>
      </button>
    </div>
    <div :ref="setScrollRef" class="landing__recent-scroll">
      <ul class="landing__recent-list">
        <RecentRoomItem
          v-for="room in recentCalls"
          :key="room.id"
          :room="room"
          :availability="roomAvailability[room.id] ?? 'unchecked'"
          :register-visibility-ref="registerVisibilityRef"
          @open="emit('open', room.id)"
          @rename="emit('rename', room.id, $event)"
          @delete="emit('delete', room.id)"
        />
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from "vue"
import RecentRoomItem from "./RecentRoomItem.vue"
import type { RecentCall } from "../composables/useAppStore"
import type { Availability } from "../composables/useRecentRoomAvailability"

defineProps<{
  title: string
  recentCalls: RecentCall[]
  roomAvailability: Record<string, Availability>
  activeOnly: boolean
  activeCount: number
  setScrollRef: (el: Element | ComponentPublicInstance | null) => void
  registerVisibilityRef: (el: unknown, roomId: string) => void
}>()

const emit = defineEmits<{
  (e: "toggle-active-only"): void
  (e: "open", roomId: string): void
  (e: "rename", roomId: string, nextLabel: string): void
  (e: "delete", roomId: string): void
}>()
</script>

<style scoped>
.landing__recent {
  margin-top: var(--space-8);
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
}

.landing__recent-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
}

.landing__recent-title--interactive {
  cursor: pointer;
}

.landing__recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.landing__recent-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-right: var(--space-1);
  padding: 0.15rem 0.4rem;
  border-radius: var(--radius-full);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.landing__recent-filter:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.landing__recent-filter-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--ui-success);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-border) 82%, transparent);
}

.landing__recent-filter--active .landing__recent-filter-dot {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-success) 26%, transparent);
}

.landing__recent-filter-label {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
}

.landing__recent-filter-count {
  font-family: "Geist Mono", var(--font-mono);
  font-size: 0.75rem;
  line-height: 1;
}

.landing__recent-scroll {
  min-height: 0;
  max-height: 60vh;
  overflow-y: auto;
  padding: var(--space-4);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow:
    inset 0 2px 5px rgb(0 0 0 / 0.08),
    inset 0 1px 0 rgb(255 255 255 / 0.22);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-text-tertiary) 45%, var(--color-bg-tertiary))
    transparent;
}

.landing__recent-scroll::-webkit-scrollbar {
  width: 10px;
}

.landing__recent-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.landing__recent-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--color-text-tertiary) 45%, var(--color-bg-tertiary));
  border: 2px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
}

.landing__recent-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--color-text-secondary) 55%, var(--color-bg-tertiary));
  border: 2px solid transparent;
  background-clip: padding-box;
}

.landing__recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
