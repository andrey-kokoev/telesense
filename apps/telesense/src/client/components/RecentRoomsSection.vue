<template>
  <div class="landing__recent">
    <button type="button" class="landing__recent-debug" @click="emit('add-debug')">+12</button>
    <h3 class="landing__recent-title">{{ title }}</h3>
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
import RecentRoomItem from "./RecentRoomItem.vue"
import type { RecentCall } from "../composables/useAppStore"
import type { Availability } from "../composables/useRecentRoomAvailability"

defineProps<{
  title: string
  recentCalls: RecentCall[]
  roomAvailability: Record<string, Availability>
  setScrollRef: (el: Element | null) => void
  registerVisibilityRef: (el: unknown, roomId: string) => void
}>()

const emit = defineEmits<{
  (e: "add-debug"): void
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

.landing__recent-debug {
  margin-bottom: var(--space-3);
  padding: var(--space-1) var(--space-2);
  font: inherit;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-full);
}

.landing__recent-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-3);
}

.landing__recent-scroll {
  position: relative;
  min-height: 100px;
  max-height: 60vh;
  overflow-y: auto;
  padding-inline: var(--space-4);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-text-tertiary) 45%, var(--color-bg-tertiary))
    transparent;
}

.landing__recent-scroll::before,
.landing__recent-scroll::after {
  content: "";
  position: sticky;
  left: 0;
  right: 0;
  display: block;
  height: 24px;
  pointer-events: none;
  z-index: 1;
}

.landing__recent-scroll::before {
  top: 0;
  margin-bottom: -24px;
  background: linear-gradient(to bottom, var(--color-bg-secondary), transparent);
}

.landing__recent-scroll::after {
  bottom: 0;
  margin-top: -24px;
  background: linear-gradient(to top, var(--color-bg-secondary), transparent);
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
