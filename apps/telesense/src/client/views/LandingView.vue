<template>
  <div class="landing">
    <header class="landing__header">
      <h1 class="landing__title">
        <span class="landing__title__glyph landing__title__glyph--t">t</span
        ><span class="landing__title-rest"
          >ele<span class="landing__title__glyph landing__title__glyph--s">s</span>ense</span
        >
      </h1>
      <p class="landing__subtitle">Secure video calls</p>
    </header>

    <main class="landing__main">
      <!-- Authenticated User View -->
      <template v-if="isAuthenticated">
        <div class="landing__section">
          <h2 class="landing__section-title">Start a Room</h2>

          <button class="landing__btn landing__btn--primary" @click="createNewRoom">
            <span class="landing__btn-icon">+</span>
            <span>Create New Room</span>
          </button>
        </div>

        <div class="landing__divider">
          <span>or</span>
        </div>

        <div class="landing__section">
          <h2 class="landing__section-title">Join a Room</h2>

          <form class="landing__form" @submit.prevent="joinExistingRoom">
            <input
              v-model="roomIdInput"
              type="text"
              class="landing__input"
              placeholder="Enter room ID"
              maxlength="20"
              @input="roomIdInput = roomIdInput.toUpperCase()"
            />
            <button
              type="submit"
              class="landing__btn landing__btn--secondary"
              :disabled="!roomIdInput.trim()"
            >
              Join
            </button>
          </form>
        </div>
      </template>

      <!-- Unauthenticated User View -->
      <template v-else>
        <div class="landing__section">
          <h2 class="landing__section-title">Join a Room</h2>

          <form class="landing__form" @submit.prevent="joinExistingRoom">
            <input
              v-model="roomIdInput"
              type="text"
              class="landing__input"
              placeholder="Enter room ID"
              maxlength="20"
              @input="roomIdInput = roomIdInput.toUpperCase()"
            />
            <button
              type="submit"
              class="landing__btn landing__btn--secondary"
              :disabled="!roomIdInput.trim()"
            >
              Join
            </button>
          </form>
        </div>

        <div class="landing__divider">
          <span>or</span>
        </div>

        <div class="landing__section">
          <h2 class="landing__section-title">Create Rooms</h2>
          <p class="landing__hint">Enter your token to create new rooms</p>

          <form class="landing__form" @submit.prevent="saveToken">
            <input
              v-model="tokenInput"
              type="password"
              class="landing__input"
              placeholder="Enter your token"
              autocomplete="off"
            />
            <button
              type="submit"
              class="landing__btn landing__btn--primary"
              :disabled="!tokenInput.trim()"
            >
              Save Token
            </button>
          </form>
        </div>
      </template>

      <!-- Recent Calls -->
      <div v-if="recentCalls.length > 0" class="landing__recent">
        <h3 class="landing__recent-title">Recent</h3>
        <ul class="landing__recent-list">
          <li
            v-for="room in recentCalls"
            :key="room.id"
            class="landing__recent-item"
            @click="goToRoom(room.id)"
          >
            <span class="landing__recent-id">{{ room.id }}</span>
            <span v-if="room.name" class="landing__recent-name">{{ room.name }}</span>
          </li>
        </ul>
      </div>
    </main>

    <!-- Token Change Modal (for authenticated users) -->
    <div v-if="showTokenModal" class="landing__modal" @click.self="showTokenModal = false">
      <div class="landing__modal-content">
        <h3 class="landing__modal-title">Change Token</h3>
        <form class="landing__form" @submit.prevent="updateToken">
          <input
            v-model="tokenInput"
            type="password"
            class="landing__input"
            placeholder="Enter new token"
            autocomplete="off"
          />
          <div class="landing__modal-actions">
            <button
              type="button"
              class="landing__btn landing__btn--ghost"
              @click="showTokenModal = false"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="landing__btn landing__btn--primary"
              :disabled="!tokenInput.trim()"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="isAuthenticated" class="landing__token-status">
      <span class="landing__token-badge">✓ Token set</span>
      <button class="landing__link" @click="showTokenModal = true">Change token</button>
      <button class="landing__link" @click="clearToken">Clear token</button>
    </div>

    <div class="landing__footer">
      <ThemeToggle />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import ThemeToggle from "../components/ThemeToggle.vue"
import { useAppStore } from "../composables/useAppStore"
import { useToast } from "../composables/useToast"

const {
  isAuthenticated,
  setToken,
  recentCalls,
  addRecentCall,
  clearToken: clearStoredToken,
} = useAppStore()
const { show } = useToast()

const roomIdInput = ref("")
const tokenInput = ref("")
const showTokenModal = ref(false)

function generateCallId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let result = ""
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function createNewRoom() {
  const roomId = generateCallId()
  addRecentCall(roomId)
  show(`Created room: ${roomId}`, "success")
  goToRoom(roomId)
}

function joinExistingRoom() {
  const id = roomIdInput.value.trim().toUpperCase()
  if (!id) return

  addRecentCall(id)
  goToRoom(id)
}

function goToRoom(roomId: string) {
  window.location.href = `/?room=${roomId}`
}

async function verifyToken(candidateToken: string) {
  const res = await fetch("/api/auth/verify", {
    headers: {
      "X-User-Token": candidateToken,
    },
  })

  return res.ok
}

async function saveToken() {
  const t = tokenInput.value.trim()
  if (!t) return

  const isValid = await verifyToken(t)
  if (!isValid) {
    show("Invalid token", "error")
    return
  }

  setToken(t, true)
  tokenInput.value = ""
  show("Token saved", "success")
}

async function updateToken() {
  await saveToken()
  showTokenModal.value = false
}

function clearToken() {
  clearStoredToken()
  tokenInput.value = ""
}
</script>

<style scoped>
.landing {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  background: var(--color-bg-primary);
}

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
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin: var(--space-2) 0 0;
}

.landing__main {
  width: 100%;
  max-width: 360px;
}

.landing__footer {
  width: 100%;
  max-width: 360px;
  margin-top: auto;
  padding-top: var(--space-8);
  display: flex;
  justify-content: center;
}

.landing__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.landing__section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.landing__hint {
  font-size: 0.875rem;
  color: var(--color-text-tertiary);
  margin: calc(var(--space-1) * -1) 0 var(--space-1);
}

.landing__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.landing__input {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  font-size: 1rem;
  font-family: inherit;
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.landing__input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-alpha);
}

.landing__input::placeholder {
  color: var(--color-text-tertiary);
}

.landing__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  font-size: 1rem;
  font-weight: 500;
  font-family: inherit;
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease,
    opacity 0.15s ease;
}

.landing__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.landing__btn:active:not(:disabled) {
  transform: scale(0.98);
}

.landing__btn--primary {
  background: var(--color-accent);
  color: white;
}

.landing__btn--primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.landing__btn--secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.landing__btn--secondary:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.landing__btn--ghost {
  background: transparent;
  color: var(--color-text-secondary);
}

.landing__btn--ghost:hover:not(:disabled) {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.landing__btn-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.landing__divider {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin: var(--space-6) 0;
  color: var(--color-text-tertiary);
  font-size: 0.875rem;
}

.landing__divider::before,
.landing__divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

.landing__token-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-8);
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
}

.landing__token-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-success);
  background: var(--color-success-alpha);
  border-radius: var(--radius-full);
}

.landing__link {
  padding: var(--space-1) var(--space-2);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.landing__link:hover {
  color: var(--color-text-primary);
}

.landing__recent {
  margin-top: var(--space-8);
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
}

.landing__recent-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-3);
}

.landing__recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.landing__recent-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.landing__recent-item:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-hover);
}

.landing__recent-id {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: 0.05em;
}

.landing__recent-name {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-left: auto;
}

.landing__modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.landing__modal-content {
  width: 100%;
  max-width: 360px;
  padding: var(--space-6);
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}

.landing__modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-4);
}

.landing__modal-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.landing__modal-actions .landing__btn {
  flex: 1;
}

@media (max-width: 480px) {
  .landing {
    padding: var(--space-6) var(--space-4);
  }

  .landing__header {
    margin-bottom: var(--space-8);
  }

  .landing__title {
    font-size: 2rem;
  }
}
</style>
