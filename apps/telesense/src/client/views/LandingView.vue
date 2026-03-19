<script setup lang="ts">
import { ref, computed } from 'vue'
import { useClipboard } from '@vueuse/core'
import { useToast } from '../composables/useToast'
import { useAuth } from '../composables/useAuth'

const callId = ref('')
const tokenInput = ref('')
const { copy } = useClipboard({ source: callId })
const { show: showToast } = useToast()
const { setToken, isAuthenticated, token } = useAuth()

// If already have token in localStorage, we're good
if (isAuthenticated.value) {
  tokenInput.value = token.value
}

const isValidLength = computed(() => callId.value.length === 6)

function formatInput(e: Event) {
  const input = e.target as HTMLInputElement
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
  
  copy(randomId).then(() => {
    showToast('Call ID copied to clipboard!', 'success')
  }).catch(() => {
    showToast('Failed to copy', 'error')
  })
}

function saveToken() {
  if (!tokenInput.value.trim()) {
    showToast('Please enter a token', 'error')
    return
  }
  setToken(tokenInput.value.trim())
  showToast('Token saved!', 'success')
}

function joinCall() {
  if (callId.value.length !== 6) {
    showToast('Call ID must be exactly 6 characters', 'error')
    return
  }
  if (!isAuthenticated.value) {
    showToast('Please enter and save your access token first', 'error')
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
    
    <!-- Token Section -->
    <div class="token-section">
      <h3>🔐 Access Token</h3>
      <p class="token-description">
        Enter your access token to use the system. 
        <a href="#" @click.prevent="showToast('Contact your admin for a token', 'info')">Get a token</a>
      </p>
      <div class="input-group">
        <input 
          v-model="tokenInput"
          type="password" 
          class="input" 
          placeholder="Enter your access token"
          autocomplete="off"
        >
        <button 
          class="btn btn-secondary"
          @click="saveToken"
          :disabled="!tokenInput.trim()"
        >
          {{ isAuthenticated ? 'Update Token' : 'Save Token' }}
        </button>
      </div>
      <div v-if="isAuthenticated" class="token-status token-valid">
        ✅ Token saved. You're ready to make calls.
      </div>
    </div>

    <div class="divider">
      <span>or</span>
    </div>
    
    <!-- Call ID Section -->
    <div class="call-section">
      <h3>📞 Call ID</h3>
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
        :disabled="!isValidLength || !isAuthenticated"
      >
        Join Call
      </button>
    </div>
    
    <div class="info-box">
      💡 <strong>Tip:</strong> Share your call ID with someone to start a 1:1 video call. Both participants need valid tokens.
    </div>
  </div>
</template>

<style scoped>
.token-section {
  margin-bottom: 1.5rem;
}

.token-section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--ui-text);
}

.token-description {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  margin-bottom: 1rem;
}

.token-description a {
  color: var(--ui-primary);
  text-decoration: underline;
}

.token-status {
  margin-top: 0.75rem;
  font-size: 0.875rem;
}

.token-valid {
  color: var(--ui-success);
}

.call-section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--ui-text);
}
</style>
