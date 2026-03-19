<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"

import { GPUNoiseGenerator, createScanlinesOverlay } from "../utils/tvNoise"

const container = ref<HTMLElement | null>(null)

let generator: GPUNoiseGenerator | null = null
let scanlines: HTMLElement | null = null

onMounted(() => {
  if (!container.value) return

  generator = new GPUNoiseGenerator(container.value, {
    baseFrequency: 0.3,
    slope: 5,
    discrete: true,
  })
  generator.start()
  scanlines = createScanlinesOverlay(container.value)
})

onBeforeUnmount(() => {
  generator?.destroy()
  generator = null
  scanlines?.remove()
  scanlines = null
})
</script>

<template>
  <div ref="container" class="tv-noise-surface">
    <div class="tv-noise-surface__content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.tv-noise-surface {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #050505;
}

.tv-noise-surface__content {
  position: absolute;
  inset: 0;
  z-index: 1;
}
</style>
