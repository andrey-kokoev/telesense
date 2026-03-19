<script setup lang="ts">
import { ref } from 'vue'
import { useClipboard } from '@vueuse/core'
import { useToast } from '../composables/useToast'

const callId = ref('')
const { copy } = useClipboard({ source: callId })
const { show: showToast } = useToast()

function generateRandomId() {
  const randomId = Math.random().toString(36).substring(2, 10)
  callId.value = randomId
  
  // Copy to clipboard
  copy(randomId).then(() => {
    showToast('Call ID copied to clipboard!', 'success')
  }).catch(() => {
    showToast('Failed to copy', 'error')
  })
}

function joinCall() {
  if (!callId.value.trim()) return
  window.location.search = `?call=${encodeURIComponent(callId.value.trim())}`
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') joinCall()
}
</script>

<template>
  <div class="card">
    <h2 class="card-title">Join a Video Call</h2>
    <p class="card-description">Enter a call ID or generate a random one to start</p>
    
    <div class="input-group">
      <div class="input-with-icon">
        <input 
          v-model="callId"
          type="text" 
          class="input" 
          placeholder="Enter call ID (e.g., team-meeting)"
          autocomplete="off"
          @keydown="onKeydown"
        >
        <button 
          class="input-icon-btn" 
          @click="generateRandomId"
          title="Generate random call ID"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
            <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
            <circle cx="16" cy="8" r="1.5" fill="currentColor"/>
            <circle cx="8" cy="16" r="1.5" fill="currentColor"/>
            <circle cx="16" cy="16" r="1.5" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </div>
    
    <button class="btn btn-primary btn-lg btn-full" @click="joinCall">
      Join Call
    </button>
    
    <div class="info-box">
      💡 <strong>Tip:</strong> Share your call ID with someone to start a 1:1 video call. Both participants use the same ID.
    </div>
  </div>
</template>
