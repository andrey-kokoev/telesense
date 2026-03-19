<template>
  <div class="skeleton-row">
    <div class="skeleton-content">
      <div class="skeleton-title"></div>
      <div class="skeleton-subtitle"></div>
    </div>
    <div class="skeleton-actions">
      <div class="skeleton-btn"></div>
      <div class="skeleton-btn"></div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.875rem;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
}

.skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  flex: 1;
}

.skeleton-title {
  height: 1rem;
  width: 40%;
  background: linear-gradient(90deg, var(--ui-border) 25%, var(--ui-surface-hover) 50%, var(--ui-border) 75%);
  background-size: 200% 100%;
  border-radius: 0.25rem;
  animation: shimmer 1.5s infinite;
}

.skeleton-subtitle {
  height: 0.75rem;
  width: 25%;
  background: linear-gradient(90deg, var(--ui-border) 25%, var(--ui-surface-hover) 50%, var(--ui-border) 75%);
  background-size: 200% 100%;
  border-radius: 0.25rem;
  animation: shimmer 1.5s infinite 0.2s;
}

.skeleton-actions {
  display: flex;
  gap: 0.5rem;
}

.skeleton-btn {
  width: 2rem;
  height: 2rem;
  background: linear-gradient(90deg, var(--ui-border) 25%, var(--ui-surface-hover) 50%, var(--ui-border) 75%);
  background-size: 200% 100%;
  border-radius: 0.375rem;
  animation: shimmer 1.5s infinite 0.1s;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
