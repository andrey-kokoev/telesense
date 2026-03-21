<template>
  <div class="landing">
    <LandingHero :subtitle="t('landing_secure_video_calls')" />

    <main class="landing__main">
      <!-- Authenticated User View -->
      <template v-if="isAuthenticated">
        <RoomCodeSection
          :title="t('landing_start_room')"
          :digits="createRoomCodeDigits"
          name="create-room-code"
          :show-inputs="createRoomFlowState !== 'idle'"
          :button-label="createRoomButtonLabel"
          button-class="landing__btn--primary"
          :button-disabled="isCreateRoomButtonDisabled"
          :button-icon="createRoomButtonIcon"
          :set-input-ref="setCreateRoomCodeInputRef"
          :is-input-disabled="isCreateRoomCodeInputDisabled"
          @submit="submitCreateRoom"
          @paste="onCreateRoomCodePaste"
          @input="onCreateRoomCodeInput"
          @keydown="onCreateRoomCodeKeydown"
        />

        <div class="landing__divider">
          <span>{{ t("landing_or") }}</span>
        </div>

        <RoomCodeSection
          :title="t('landing_join_room')"
          :digits="roomCodeDigits"
          name="room-code"
          button-class="landing__btn--secondary"
          :button-label="t('landing_join')"
          :button-disabled="isJoinRoomButtonDisabled"
          :set-input-ref="setRoomCodeInputRef"
          :is-input-disabled="isRoomCodeInputDisabled"
          @submit="joinExistingRoom"
          @paste="onRoomCodePaste"
          @input="onRoomCodeInput"
          @keydown="onRoomCodeKeydown"
        />
      </template>

      <!-- Unauthenticated User View -->
      <template v-else>
        <RoomCodeSection
          :title="t('landing_join_room')"
          :digits="roomCodeDigits"
          name="room-code"
          button-class="landing__btn--secondary"
          :button-label="t('landing_join')"
          :button-disabled="isJoinRoomButtonDisabled"
          :set-input-ref="setRoomCodeInputRef"
          :is-input-disabled="isRoomCodeInputDisabled"
          @submit="joinExistingRoom"
          @paste="onRoomCodePaste"
          @input="onRoomCodeInput"
          @keydown="onRoomCodeKeydown"
        />

        <div class="landing__divider">
          <span>{{ t("landing_or") }}</span>
        </div>

        <div class="landing__section">
          <h2 class="landing__section-title">{{ t("landing_create_rooms") }}</h2>
          <p class="landing__hint">{{ t("landing_enter_token_hint") }}</p>

          <form class="landing__form" @submit.prevent="saveServiceEntitlementToken">
            <input
              v-model="tokenInput"
              type="password"
              class="landing__input"
              :placeholder="t('landing_enter_token_placeholder')"
              autocomplete="off"
            />
            <button
              type="submit"
              class="landing__btn landing__btn--primary"
              :disabled="!tokenInput.trim()"
            >
              {{ t("landing_save_token") }}
            </button>
          </form>
        </div>
      </template>

      <!-- Recent Calls -->
      <RecentRoomsSection
        v-if="recentCalls.length > 0"
        :title="
          recentCalls.length > 8
            ? `${t('landing_recent')} (${recentCalls.length})`
            : t('landing_recent')
        "
        :recent-calls="displayedRecentCalls"
        :room-availability="roomAvailability"
        :active-only="showActiveRecentOnly"
        :active-count="activeRecentCount"
        :set-scroll-ref="setRecentScrollRef"
        :register-visibility-ref="setRecentItemRef"
        @toggle-active-only="showActiveRecentOnly = !showActiveRecentOnly"
        @open="handleRecentItemClick"
        @rename="renameRoom"
        @delete="deleteRoom"
      />
    </main>

    <!-- Token Change Modal (for authenticated users) -->
    <div v-if="showTokenModal" class="landing__modal" @click.self="showTokenModal = false">
      <div class="landing__modal-content">
        <h3 class="landing__modal-title">{{ t("landing_change_token") }}</h3>
        <form class="landing__form" @submit.prevent="updateToken">
          <input
            v-model="tokenInput"
            type="password"
            class="landing__input"
            :placeholder="t('landing_enter_new_token_placeholder')"
            autocomplete="off"
          />
          <div class="landing__modal-actions">
            <button
              type="button"
              class="landing__btn landing__btn--ghost"
              @click="showTokenModal = false"
            >
              {{ t("landing_cancel") }}
            </button>
            <button
              type="submit"
              class="landing__btn landing__btn--primary"
              :disabled="!tokenInput.trim()"
            >
              {{ t("landing_save") }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="isAuthenticated" class="landing__token-status">
      <span class="landing__token-badge">✓ {{ t("landing_token_set") }}</span>
      <button class="landing__token-action" @click="showTokenModal = true">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        <span>{{ t("landing_change_token_action") }}</span>
      </button>
      <button class="landing__token-action" @click="clearServiceEntitlementToken">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        <span>{{ t("landing_clear_token") }}</span>
      </button>
    </div>

    <div class="landing__footer">
      <div class="landing__footer-actions">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue"
import LandingHero from "../components/LandingHero.vue"
import LanguageToggle from "../components/LanguageToggle.vue"
import RecentRoomsSection from "../components/RecentRoomsSection.vue"
import RoomCodeSection from "../components/RoomCodeSection.vue"
import ThemeToggle from "../components/ThemeToggle.vue"
import { useAppStore } from "../composables/useAppStore"
import { useI18n } from "../composables/useI18n"
import { useRecentRoomAvailability } from "../composables/useRecentRoomAvailability"
import { useRoomCodeInput } from "../composables/useRoomCodeInput"
import { useToast } from "../composables/useToast"

const {
  isAuthenticated,
  setServiceEntitlementToken,
  recentCalls,
  addRecentCall,
  clearServiceEntitlementToken: clearStoredToken,
  renameRecentCall,
  removeRecentCall,
} = useAppStore()
const { show } = useToast()
const { t } = useI18n()

const tokenInput = ref("")
const showTokenModal = ref(false)
const {
  digits: roomCodeDigits,
  value: roomIdInput,
  setInputRef: setRoomCodeInputRef,
  focusInput: focusRoomCodeInput,
  isInputDisabled: isRoomCodeInputDisabled,
  onInput: onRoomCodeInput,
  onKeydown: onRoomCodeKeydown,
  onPaste: onRoomCodePaste,
} = useRoomCodeInput(joinExistingRoom)
const {
  digits: createRoomCodeDigits,
  value: createRoomIdInput,
  setInputRef: setCreateRoomCodeInputRef,
  focusInput: focusCreateRoomCodeInput,
  isInputDisabled: isCreateRoomCodeInputDisabled,
  onInput: onCreateRoomCodeInput,
  onKeydown: onCreateRoomCodeKeydown,
  onPaste: onCreateRoomCodePaste,
  setValue: setCreateRoomCodeValue,
  clear: clearCreateRoomCode,
} = useRoomCodeInput(submitCreateRoom)
const { roomAvailability, recentScrollEl, setRecentItemRef } =
  useRecentRoomAvailability(recentCalls)
const showActiveRecentOnly = ref(false)
type CreateRoomFlowState = "idle" | "editing" | "submitting"
type JoinRoomFlowState = "editing" | "submitting"

const createRoomFlowState = ref<CreateRoomFlowState>("idle")
const joinRoomFlowState = ref<JoinRoomFlowState>("editing")

const createRoomButtonLabel = computed(() =>
  createRoomFlowState.value === "idle"
    ? t("landing_create_new_room")
    : t("landing_create_room_with_id", { roomId: createRoomIdInput.value }),
)
const createRoomButtonIcon = computed(() => (createRoomFlowState.value === "idle" ? "+" : "✓"))
const isCreateRoomButtonDisabled = computed(
  () =>
    createRoomFlowState.value === "submitting" ||
    (createRoomFlowState.value === "editing" && createRoomIdInput.value.length !== 6),
)
const isJoinRoomButtonDisabled = computed(
  () => joinRoomFlowState.value === "submitting" || roomIdInput.value.length !== 6,
)
const activeRecentCount = computed(
  () =>
    recentCalls.value.filter(
      (room) => (roomAvailability.value[room.id] ?? "unchecked") === "available",
    ).length,
)
const displayedRecentCalls = computed(() =>
  showActiveRecentOnly.value
    ? recentCalls.value.filter(
        (room) => (roomAvailability.value[room.id] ?? "unchecked") === "available",
      )
    : recentCalls.value,
)

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const error = params.get("error")
  if (error) {
    show(error, "error")
    params.delete("error")
    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`
    window.history.replaceState({}, "", nextUrl)
  }
  focusRoomCodeInput(0)
})

watch(createRoomIdInput, (value) => {
  if (createRoomFlowState.value === "submitting") return
  createRoomFlowState.value = value.length > 0 ? "editing" : "idle"
})

watch(roomIdInput, () => {
  if (joinRoomFlowState.value === "submitting") return
  joinRoomFlowState.value = "editing"
})

function generateCallId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let result = ""
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

async function createNewRoom() {
  const roomId = createRoomIdInput.value || generateCallId()
  if (!recentCalls.value.some((room) => room.id === roomId)) {
    addRecentCall(roomId)
  }
  show(t("landing_created_room", { roomId }), "success")
  clearCreateRoomCode()
  goToRoom(roomId)
}

async function submitCreateRoom() {
  if (createRoomFlowState.value === "submitting") return

  if (createRoomFlowState.value === "idle") {
    const roomId = generateCallId()
    setCreateRoomCodeValue(roomId)
    createRoomFlowState.value = "editing"
    await nextTick()
    focusCreateRoomCodeInput(0)
    return
  }

  if (createRoomIdInput.value.length !== 6) return
  createRoomFlowState.value = "submitting"
  await createNewRoom()
}

function joinExistingRoom() {
  if (joinRoomFlowState.value === "submitting") return
  const id = roomIdInput.value
  if (id.length !== 6) return

  joinRoomFlowState.value = "submitting"
  if (!recentCalls.value.some((room) => room.id === id)) {
    addRecentCall(id)
  }
  goToRoom(id)
}

function goToRoom(roomId: string) {
  window.location.href = `/?room=${roomId}`
}

function handleRecentItemClick(roomId: string) {
  void openRecentRoom(roomId)
}

async function openRecentRoom(roomId: string) {
  if (isAuthenticated.value) {
    goToRoom(roomId)
    return
  }

  try {
    const res = await fetch(`/api/rooms/${roomId}/status`)
    if (!res.ok) {
      show("Could not check room availability", "error")
      return
    }

    const data = (await res.json()) as { exists?: boolean }
    if (!data.exists) {
      roomAvailability.value[roomId] = "unavailable"
      show("Room is no longer available", "error")
      return
    }

    roomAvailability.value[roomId] = "available"
    goToRoom(roomId)
  } catch {
    show("Could not check room availability", "error")
  }
}

function renameRoom(roomId: string, nextLabel: string) {
  renameRecentCall(roomId, nextLabel)
}

function deleteRoom(roomId: string) {
  removeRecentCall(roomId)
}

function setRecentScrollRef(el: Element | null) {
  recentScrollEl.value = el instanceof HTMLElement ? el : null
}

async function verifyServiceEntitlementToken(candidateToken: string) {
  const res = await fetch("/api/auth/verify", {
    headers: {
      "X-Service-Entitlement-Token": candidateToken,
    },
  })

  return res.ok
}

async function saveServiceEntitlementToken() {
  const token = tokenInput.value.trim()
  if (!token) return

  const isValid = await verifyServiceEntitlementToken(token)
  if (!isValid) {
    show(t("landing_invalid_token"), "error")
    return
  }

  setServiceEntitlementToken(token, true)
  tokenInput.value = ""
  show(t("landing_token_saved"), "success")
}

async function updateServiceEntitlementToken() {
  await saveServiceEntitlementToken()
  showTokenModal.value = false
}

function clearServiceEntitlementToken() {
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

.landing__main {
  width: 100%;
  max-width: 360px;
}

.landing__footer {
  width: 100%;
  max-width: 360px;
  margin-top: auto;
  padding-top: var(--space-8);
  padding-bottom: var(--space-6);
  display: flex;
  justify-content: center;
}

.landing__footer-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.landing__footer-actions :deep(.theme-toggle) {
  margin-bottom: 0;
}

:deep(.landing__section),
.landing__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

:deep(.landing__section-title),
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

:deep(.landing__form),
.landing__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

:deep(.landing__input),
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

:deep(.landing__input:focus),
.landing__input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-alpha);
}

:deep(.landing__input::placeholder),
.landing__input::placeholder {
  color: var(--color-text-tertiary);
}

:deep(.landing__btn),
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

:deep(.landing__btn:disabled),
.landing__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

:deep(.landing__btn:active:not(:disabled)),
.landing__btn:active:not(:disabled) {
  transform: scale(0.98);
}

:deep(.landing__btn--primary),
.landing__btn--primary {
  background: var(--color-accent);
  color: var(--color-accent-foreground);
}

:deep(.landing__btn--primary:hover:not(:disabled)),
.landing__btn--primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

:deep(.landing__btn--secondary),
.landing__btn--secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

:deep(.landing__btn--secondary:hover:not(:disabled)),
.landing__btn--secondary:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

:deep(.landing__btn--ghost),
.landing__btn--ghost {
  background: transparent;
  color: var(--color-text-secondary);
}

:deep(.landing__btn--ghost:hover:not(:disabled)),
.landing__btn--ghost:hover:not(:disabled) {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

:deep(.landing__btn-icon),
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

.landing__token-action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  border-radius: var(--radius-full);
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.landing__token-action:hover {
  color: var(--color-text-primary);
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
}
</style>
