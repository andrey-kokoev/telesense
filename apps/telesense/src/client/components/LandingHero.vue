<template>
  <header class="landing__header">
    <h1 class="landing__title">
      <span class="landing__title__glyph landing__title__glyph--t">t</span
      ><span class="landing__title-rest"
        >ele<span class="landing__title__glyph landing__title__glyph--s">s</span>ense</span
      >
    </h1>
    <p class="landing__subtitle">{{ subtitle }}</p>
  </header>
</template>

<script setup lang="ts">
defineProps<{ subtitle: string }>()
</script>

<style scoped>
.landing__header {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  text-align: center;
  margin-bottom: var(--space-10);
}

.landing__title {
  font-size: 2.5rem;
  font-weight: 700;
  font-family: "Geist Mono", var(--font-mono);
  color: var(--color-text-primary);
  opacity: 0.8;
  margin: 0;
  letter-spacing: 0.1ch;
  margin-top: var(--space-2);
}

.landing__title-rest {
  font-weight: 500;
}

.landing__title__glyph {
  display: inline-block;
  padding: 0 0.04em;
  color: var(--color-bg-primary);
  background: var(--color-text-primary);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
  border-radius: 0.08em;
}

.landing__title__glyph--s {
  padding-left: 0.02em;
  margin-right: 0.05ch;
  margin-left: 0.05ch;
}

.landing__title__glyph--t {
  padding-left: 0.035em;
  margin-right: 0.1ch;
}

.landing__subtitle {
  font-family: "Geist Mono", var(--font-mono);
  font-size: 1rem;
  color: var(--color-text-secondary);
  letter-spacing: 0.04ch;
  margin: var(--space-2) 0 0;
}

@media (max-width: 480px) {
  .landing__header {
    margin-bottom: var(--space-8);
  }

  .landing__title {
    font-size: 2rem;
  }
}
</style>
