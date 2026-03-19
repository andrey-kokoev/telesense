<script setup lang="ts">
import { computed } from 'vue'
import LandingView from './views/LandingView.vue'
import CallView from './views/CallView.vue'
import ToastContainer from './components/ToastContainer.vue'

const callId = computed(() => {
  const raw = new URLSearchParams(location.search).get('call')
  return raw ? raw.toUpperCase() : null
})
</script>

<template>
  <div class="container">
    <header class="header">
      <h1>Telesense</h1>
      <p class="subtitle">Cloudflare Realtime 1:1 Video Call</p>
    </header>

    <main>
      <LandingView v-if="!callId" />
      <CallView v-else :callId="callId" />
    </main>
  </div>
  
  <ToastContainer />
</template>
