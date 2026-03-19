<script setup lang="ts">
import { computed } from "vue";
import LandingView from "./views/LandingView.vue";
import CallView from "./views/CallView.vue";
import ToastContainer from "./components/ToastContainer.vue";

const callId = computed(() => {
  const raw = new URLSearchParams(location.search).get("call");
  return raw ? raw.toUpperCase() : null;
});
</script>

<template>
  <div class="container">
    <header class="header">
      <h1>Telesense</h1>
      <p class="subtitle">Cloudflare Realtime 1:1 Video Call</p>
    </header>

    <main>
      <Transition name="page" mode="out-in">
        <LandingView v-if="!callId" key="landing" />
        <CallView v-else :callId="callId" key="call" />
      </Transition>
    </main>
  </div>

  <ToastContainer />
</template>

<style>
/* Page Transitions */
.page-enter-active,
.page-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* For mobile: slide transitions */
@media (max-width: 768px) {
  .page-enter-from {
    opacity: 0;
    transform: translateY(100%);
  }

  .page-leave-to {
    opacity: 0;
    transform: translateY(-50px);
  }
}
</style>
