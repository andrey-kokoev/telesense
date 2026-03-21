<script setup lang="ts">
import { computed } from "vue"
import AdminView from "./views/AdminView.vue"
import LandingView from "./views/LandingView.vue"
import CallView from "./views/CallView.vue"
import ToastContainer from "./components/ToastContainer.vue"

const roomId = computed(() => {
  const params = new URLSearchParams(location.search)
  const raw = params.get("room")
  return raw ? raw.toUpperCase() : null
})

const adminMode = computed(() => {
  if (location.pathname === "/host-admin") {
    return true
  }
  const params = new URLSearchParams(location.search)
  return params.get("admin") === "1"
})
</script>

<template>
  <div class="container">
    <main>
      <Transition name="page" mode="out-in">
        <CallView v-if="roomId" :roomId="roomId" key="call" />
        <AdminView v-else-if="adminMode" key="admin" />
        <LandingView v-else key="landing" />
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
