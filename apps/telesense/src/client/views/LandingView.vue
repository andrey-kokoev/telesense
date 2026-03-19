<script setup lang="ts">
import { ref, computed } from 'vue'
import { useClipboard } from '@vueuse/core'
import { useToast } from '../composables/useToast'

const callId = ref('')
const { copy } = useClipboard({ source: callId })
const { show: showToast } = useToast()

const isValidLength = computed(() => callId.value.length === 6)

function formatInput(e: Event) {
  const input = e.target as HTMLInputElement
  // Remove non-alphanumeric, convert to uppercase, limit to 6
  let value = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)
  callId.value = value
}

function generateRandomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let randomId = ''
  for (let i = 0; i < 6; i++) {
    randomId += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  callId.value = randomId
  
  // Copy to clipboard
  copy(randomId).then(() => {
    showToast('Call ID copied to clipboard!', 'success')
  }).catch(() => {
    showToast('Failed to copy', 'error')
  })
}

function joinCall() {
  if (callId.value.length !== 6) {
    showToast('Call ID must be exactly 6 characters', 'error')
    return
  }
  window.location.search = `?call=${encodeURIComponent(callId.value)}`
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') joinCall()
}
</script>

<template>
  <div class="card">
    <h2 class="card-title">Join a Video Call</h2>
    <p class="card-description">Enter a 6-character call ID or generate one</p>
    
    <div class="input-group">
      <div class="input-with-icon">
        <input 
          v-model="callId"
          type="text" 
          class="input" 
          placeholder="XXXXXX"
          autocomplete="off"
          maxlength="6"
          @input="formatInput"
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
      <div class="input-hint" :class="{ 'input-hint-valid': isValidLength }">
        {{ callId.length }}/6 characters
      </div>
    </div>
    
    <button 
      class="btn btn-primary btn-lg btn-full" 
      @click="joinCall"
      :disabled="!isValidLength"
    >
      Join Call
    </button>
    
    <div class="info-box">
      💡 <strong>Tip:</strong> Share your call ID with someone to start a 1:1 video call. Both participants use the same ID.
    </div>
  </div>
</template>
