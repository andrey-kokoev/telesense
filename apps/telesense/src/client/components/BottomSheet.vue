<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface Props {
  modelValue: 'collapsed' | 'half' | 'full'
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: 'collapsed' | 'half' | 'full']
}>()

const sheetRef = ref<HTMLDivElement>()
const isDragging = ref(false)
const dragStartY = ref(0)
const dragCurrentY = ref(0)
const currentTranslate = ref(0)

const snapPoints = {
  collapsed: 0,
  half: -200,
  full: -400
}

const sheetStyle = computed(() => {
  if (isDragging.value) {
    return {
      transform: `translateY(${currentTranslate.value}px)`,
      transition: 'none'
    }
  }
  return {
    transform: `translateY(${snapPoints[props.modelValue]}px)`,
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  }
})

const backdropStyle = computed(() => ({
  opacity: props.modelValue === 'collapsed' ? 0 : 0.5,
  pointerEvents: props.modelValue === 'collapsed' ? 'none' as const : 'auto' as const
}))

function onTouchStart(e: TouchEvent) {
  isDragging.value = true
  dragStartY.value = e.touches[0].clientY
  dragCurrentY.value = snapPoints[props.modelValue]
  currentTranslate.value = snapPoints[props.modelValue]
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging.value) return
  const delta = e.touches[0].clientY - dragStartY.value
  currentTranslate.value = Math.min(0, dragCurrentY.value + delta)
}

function onTouchEnd() {
  if (!isDragging.value) return
  isDragging.value = false
  
  const current = currentTranslate.value
  const absCurrent = Math.abs(current)
  
  // Determine closest snap point
  if (absCurrent < 100) {
    emit('update:modelValue', 'collapsed')
  } else if (absCurrent < 300) {
    emit('update:modelValue', 'half')
  } else {
    emit('update:modelValue', 'full')
  }
}

function close() {
  emit('update:modelValue', 'collapsed')
}
</script>

<template>
  <div 
    class="sheet-backdrop"
    :style="backdropStyle"
    @click="close"
  />
  <div
    ref="sheetRef"
    class="bottom-sheet"
    :style="sheetStyle"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
  >
    <div class="sheet-handle">
      <div class="sheet-handle-bar"></div>
    </div>
    <div class="sheet-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.bottom-sheet {
  position: fixed;
  bottom: -400px;
  left: 0;
  right: 0;
  height: 500px;
  background: var(--ui-bg-elevated);
  border-radius: 1rem 1rem 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  z-index: 100;
  display: flex;
  flex-direction: column;
  touch-action: none;
}

.sheet-handle {
  padding: 0.75rem 0;
  display: flex;
  justify-content: center;
  cursor: grab;
  flex-shrink: 0;
}

.sheet-handle:active {
  cursor: grabbing;
}

.sheet-handle-bar {
  width: 40px;
  height: 4px;
  background: var(--ui-border);
  border-radius: 2px;
}

.sheet-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 1rem 2rem;
}

.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: black;
  z-index: 99;
  transition: opacity 0.3s ease;
}

/* Desktop: show as panel instead of sheet */
@media (min-width: 769px) {
  .bottom-sheet {
    position: static;
    bottom: auto;
    transform: none !important;
    height: auto;
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    border: 1px solid var(--ui-border);
  }
  
  .sheet-handle {
    display: none;
  }
  
  .sheet-backdrop {
    display: none;
  }
}
</style>
