<template>
  <button
    type="button"
    class="vertical-toggle"
    :class="{
      'vertical-toggle--active': active,
      'vertical-toggle--inactive': !active,
      'vertical-toggle--dim': dimInactive && !active,
    }"
    :title="title"
    :aria-label="ariaLabel || title"
    :aria-pressed="active"
    @click="$emit('click', $event)"
  >
    <span class="vertical-toggle__thumb" aria-hidden="true"></span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  active: boolean
  title: string
  ariaLabel?: string
  dimInactive?: boolean
}>()

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<style scoped>
.vertical-toggle {
  display: inline-flex;
  align-items: flex-start;
  justify-content: center;
  width: 1.15rem;
  height: 2.1rem;
  padding: 0.13rem 0.1rem 0.1rem;
  border: 1px solid color-mix(in srgb, var(--ui-text) 18%, var(--ui-border) 82%);
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--ui-muted) 75%, var(--ui-bg) 25%);
  flex: none;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-text) 18%, transparent 82%);
}

.vertical-toggle__thumb {
  display: block;
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 0.28rem;
  border: 1px solid color-mix(in srgb, var(--ui-border) 78%, var(--ui-text) 22%);
  background: color-mix(in srgb, var(--ui-bg) 82%, var(--ui-text) 18%);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
  transform: translateY(0);
  margin-left: 0.03rem;
}

.vertical-toggle--active {
  background: color-mix(in srgb, var(--ui-success, #16a34a) 16%, var(--ui-bg) 84%);
  border-color: color-mix(in srgb, var(--ui-success, #16a34a) 32%, var(--ui-border) 68%);
}

.vertical-toggle--active .vertical-toggle__thumb {
  transform: translateY(0);
  background: var(--ui-success, #16a34a);
}

.vertical-toggle--inactive .vertical-toggle__thumb {
  transform: translateY(0.92rem);
  background: color-mix(in srgb, var(--ui-text-muted) 72%, var(--ui-bg) 28%);
}

.vertical-toggle--dim {
  opacity: 0.7;
}
</style>
