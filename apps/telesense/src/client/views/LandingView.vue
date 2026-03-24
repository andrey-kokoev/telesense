<template>
  <div class="landing">
    <LandingHero :subtitle="t('landing_secure_video_calls')" />

    <main class="landing__main">
      <RoomCodeSection
        :title="t('landing_enter_room')"
        :digits="roomCodeDigits"
        name="room-code"
        :button-class="roomActionButtonClass"
        :button-label="roomActionButtonLabel"
        :button-disabled="isRoomActionButtonDisabled"
        :set-input-ref="setRoomCodeInputRef"
        :is-input-disabled="isRoomCodeInputDisabled"
        @submit="submitRoomAction"
        @paste="onRoomCodePaste"
        @input="handleRoomCodeInput"
        @keydown="handleRoomCodeKeydown"
        @blur="handleRoomCodeBlur"
      />

      <div v-if="roomEntryHelperText" class="landing__room-helper">
        <p v-if="roomEntryHelperText" class="landing__hint">
          {{ roomEntryHelperText }}
        </p>
      </div>

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
    <div v-if="showTokenModal" class="landing__modal" @click.self="closeTokenModal">
      <div class="landing__modal-content">
        <h3 class="landing__modal-title">{{ tokenModalTitle }}</h3>
        <form class="landing__form" @submit.prevent="updateServiceEntitlementToken">
          <input
            v-model="tokenInput"
            type="password"
            class="landing__input"
            :placeholder="tokenModalPlaceholder"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            inputmode="text"
          />
          <div class="landing__modal-actions">
            <button type="button" class="landing__btn landing__btn--ghost" @click="closeTokenModal">
              {{ t("landing_cancel") }}
            </button>
            <button
              type="submit"
              class="landing__btn landing__btn--primary"
              :disabled="!tokenInput.trim() || serviceEntitlementUiState === 'verifying'"
            >
              {{ t("landing_save") }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="serviceEntitlementUiState !== 'missing'" class="landing__token-status">
      <span class="landing__token-badge">
        {{ tokenStatusLabel }}
      </span>
      <button class="landing__token-action" @click="openTokenModal">
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
      <button class="landing__token-action" @click="clearEnteredAccess">
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
        <button
          v-if="hasHostAdminSessionToken || hasBudgetAdminSessionToken"
          class="landing__footer-admin"
          :aria-label="t('landing_admin')"
          :title="t('landing_admin')"
          @click="openAdmin"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 3v18" />
            <path d="M3 12h18" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComponentPublicInstance,
} from "vue"
import LandingHero from "../components/LandingHero.vue"
import LanguageToggle from "../components/LanguageToggle.vue"
import RecentRoomsSection from "../components/RecentRoomsSection.vue"
import RoomCodeSection from "../components/RoomCodeSection.vue"
import ThemeToggle from "../components/ThemeToggle.vue"
import { useAppStore } from "../composables/useAppStore"
import { useI18n } from "../composables/useI18n"
import { useLandingTokenEntry } from "../composables/useLandingTokenEntry"
import { useRecentRoomAvailability } from "../composables/useRecentRoomAvailability"
import { useRoomCodeInput } from "../composables/useRoomCodeInput"
import { useToast } from "../composables/useToast"

const {
  serviceEntitlementState,
  hasServiceEntitlementToken,
  hasHostAdminSessionToken,
  hasBudgetAdminSessionToken,
  budgetAdminBudgetKey,
  sanitizeCredentialToken,
  setServiceEntitlementToken,
  setHostAdminSessionToken,
  setBudgetAdminSession,
  recentCalls,
  addRecentCall,
  clearServiceEntitlementToken: clearStoredToken,
  clearHostAdminSessionToken,
  clearBudgetAdminSession,
  renameRecentCall,
  removeRecentCall,
} = useAppStore()
const { show } = useToast()
const { t } = useI18n()
const {
  digits: roomCodeDigits,
  value: roomIdInput,
  setValue: setRoomCodeValue,
  setInputRef: setRoomCodeInputRef,
  focusInput: focusRoomCodeInput,
  isInputDisabled: isRoomCodeInputDisabled,
  onInput: onRoomCodeInput,
  onKeydown: onRoomCodeKeydown,
  onPaste: onRoomCodePaste,
  clear: clearRoomCode,
  insertCharacter: insertRoomCodeCharacter,
} = useRoomCodeInput({
  onSubmit: submitRoomAction,
  onInvalidCharacter: () => {
    show(t("landing_room_code_invalid_character"), "error")
  },
})
const { roomAvailability, recentScrollEl, setRecentItemRef } =
  useRecentRoomAvailability(recentCalls)
const showActiveRecentOnly = ref(false)
type RoomLookupState = "idle" | "checking" | "exists" | "missing" | "error"
type RoomActionState = "idle" | "submitting"
type RoomEntryState =
  | "incomplete"
  | "checking"
  | "joinable"
  | "creatable"
  | "token_required"
  | "error"

const roomLookupState = ref<RoomLookupState>("idle")
const roomActionState = ref<RoomActionState>("idle")
let lastCheckedRoomId = ""
let roomLookupRequest = 0

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
const canCreateRooms = computed(() => serviceEntitlementUiState.value === "valid")
const hasCompleteRoomCode = computed(() => roomIdInput.value.length === 6)
const roomEntryState = computed<RoomEntryState>(() => {
  if (!hasCompleteRoomCode.value) return "incomplete"
  if (roomLookupState.value === "checking") return "checking"
  if (roomLookupState.value === "exists") return "joinable"
  if (roomLookupState.value === "error") return "error"
  if (roomLookupState.value === "missing" && canCreateRooms.value) return "creatable"
  if (roomLookupState.value === "missing") return "token_required"
  return "checking"
})
const roomActionButtonLabel = computed(() => {
  if (roomEntryState.value === "incomplete") return t("landing_enter_room_code")
  if (roomEntryState.value === "checking") return t("landing_checking_room")
  if (roomEntryState.value === "joinable") return t("landing_join_room_action")
  if (roomEntryState.value === "token_required") return t("landing_enter_token_prompt_action")
  if (roomEntryState.value === "error") return t("landing_try_again")
  return t("landing_create_room_action")
})
const roomActionButtonClass = computed(() => {
  if (roomEntryState.value === "joinable" || roomEntryState.value === "error") {
    return "landing__btn--secondary"
  }
  return "landing__btn--primary"
})
const isRoomActionButtonDisabled = computed(() => {
  if (roomActionState.value === "submitting") return true
  return roomEntryState.value === "incomplete" || roomEntryState.value === "checking"
})
const roomEntryHelperText = computed(() => {
  if (roomIdInput.value.length === 0) return ""
  if (roomEntryState.value === "incomplete") return t("landing_room_code_helper")
  if (roomEntryState.value === "checking") return t("landing_checking_room_hint")
  if (roomEntryState.value === "joinable") return t("landing_room_found_hint")
  if (roomEntryState.value === "creatable") return t("landing_room_not_found_create_hint")
  if (roomEntryState.value === "error") return t("landing_room_check_failed")
  if (roomEntryState.value === "token_required" && hasServiceEntitlementToken.value) {
    return serviceEntitlementUiState.value === "verifying"
      ? t("landing_service_entitlement_verifying_hint")
      : t("landing_service_entitlement_exhausted_hint")
  }
  if (roomEntryState.value === "token_required") return t("landing_token_required_hint")
  return ""
})
const tokenModalTitle = computed(() =>
  roomEntryState.value === "token_required"
    ? t("landing_enter_token_prompt_action")
    : t("landing_change_token"),
)
const tokenModalPlaceholder = computed(() =>
  roomEntryState.value === "token_required"
    ? t("landing_enter_token_hint")
    : t("landing_enter_new_token_placeholder"),
)
const {
  tokenInput,
  showTokenModal,
  serviceEntitlementUiState,
  tokenStatusLabel,
  openTokenModal,
  closeTokenModal,
  saveEnteredToken,
  updateServiceEntitlementToken,
  clearEnteredAccess,
} = useLandingTokenEntry({
  serviceEntitlementState,
  hasHostAdminSessionToken,
  hasBudgetAdminSessionToken,
  sanitizeCredentialToken,
  setServiceEntitlementToken,
  setHostAdminSessionToken,
  setBudgetAdminSession,
  clearServiceEntitlementToken: clearStoredToken,
  clearHostAdminSessionToken,
  clearBudgetAdminSession,
  resolveEnteredToken,
  t: t as (key: string, params?: Record<string, string>) => string,
  show,
  navigate: (path) => {
    window.location.href = path
  },
})

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
  window.addEventListener("keydown", handleDesktopLandingKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleDesktopLandingKeydown)
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
  const roomId = roomIdInput.value || generateCallId()
  if (!recentCalls.value.some((room) => room.id === roomId)) {
    addRecentCall(roomId)
  }
  show(t("landing_created_room", { roomId }), "success")
  clearRoomCode()
  goToRoom(roomId)
}

async function joinExistingRoom() {
  if (roomActionState.value === "submitting") return
  const id = roomIdInput.value
  if (id.length !== 6) return

  roomActionState.value = "submitting"
  if (!recentCalls.value.some((room) => room.id === id)) {
    addRecentCall(id)
  }
  goToRoom(id)
}

async function handleRoomCodeInput(index: number, event: Event) {
  await onRoomCodeInput(index, event)
  if (roomIdInput.value.length === 6) {
    await checkEnteredRoomAvailability()
  } else {
    roomLookupState.value = "idle"
    lastCheckedRoomId = ""
  }
}

async function handleRoomCodeKeydown(index: number, event: KeyboardEvent) {
  onRoomCodeKeydown(index, event)

  if (event.defaultPrevented && roomIdInput.value.length === 6) {
    await checkEnteredRoomAvailability()
    return
  }

  if (roomIdInput.value.length < 6) {
    roomLookupState.value = "idle"
    lastCheckedRoomId = ""
  }
}

async function handleRoomCodeBlur() {
  if (roomIdInput.value.length === 6) {
    await checkEnteredRoomAvailability()
  }
}

async function checkEnteredRoomAvailability() {
  const roomId = roomIdInput.value
  if (roomId.length !== 6) return
  if (lastCheckedRoomId === roomId && roomLookupState.value !== "error") return

  roomLookupState.value = "checking"
  const requestId = ++roomLookupRequest
  try {
    const res = await fetch(`/api/rooms/${roomId}/status`)
    if (!res.ok) {
      throw new Error("room check failed")
    }

    const data = (await res.json()) as { exists?: boolean }
    if (requestId !== roomLookupRequest || roomIdInput.value !== roomId) return

    lastCheckedRoomId = roomId
    roomLookupState.value = data.exists ? "exists" : "missing"
  } catch {
    if (requestId !== roomLookupRequest || roomIdInput.value !== roomId) return
    roomLookupState.value = "error"
  }
}

async function submitRoomAction() {
  if (roomActionState.value === "submitting") return
  if (roomIdInput.value.length !== 6) return

  if (roomLookupState.value === "idle" || roomLookupState.value === "error") {
    await checkEnteredRoomAvailability()
  }

  if (roomLookupState.value === "exists") {
    await joinExistingRoom()
    return
  }

  if (roomEntryState.value === "creatable") {
    roomActionState.value = "submitting"
    await createNewRoom()
    return
  }

  if (roomEntryState.value === "token_required") {
    openTokenModal()
    return
  }

  if (roomEntryState.value === "error") {
    await checkEnteredRoomAvailability()
  }
}

function goToRoom(roomId: string) {
  window.location.href = `/?room=${roomId}`
}

function handleRecentItemClick(roomId: string) {
  void openRecentRoom(roomId)
}

async function openRecentRoom(roomId: string) {
  if (serviceEntitlementUiState.value === "valid") {
    goToRoom(roomId)
    return
  }

  setRoomCodeValue(roomId)
  await nextTick()
  focusRoomCodeInput(0)
  await checkEnteredRoomAvailability()

  if (roomLookupState.value === "exists") {
    roomAvailability.value[roomId] = "available"
    goToRoom(roomId)
    return
  }

  if (roomLookupState.value === "missing") {
    roomAvailability.value[roomId] = "unavailable"
    show(t("landing_room_unavailable"), "error")
    if (!canCreateRooms.value) {
      openTokenModal()
    }
    return
  }

  if (roomLookupState.value === "error") {
    show(t("landing_room_check_failed"), "error")
  }
}

function renameRoom(roomId: string, nextLabel: string) {
  renameRecentCall(roomId, nextLabel)
}

function deleteRoom(roomId: string) {
  removeRecentCall(roomId)
}

function setRecentScrollRef(el: Element | ComponentPublicInstance | null) {
  recentScrollEl.value =
    el instanceof HTMLElement
      ? el
      : el instanceof Element
        ? el instanceof HTMLElement
          ? el
          : null
        : el && "$el" in el && el.$el instanceof HTMLElement
          ? el.$el
          : null
}

function isDesktopViewport() {
  return typeof window !== "undefined" && window.matchMedia("(pointer:fine)").matches
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest(".landing__modal-content")) return true
  const tagName = target.tagName
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  )
}

function roomCodeCharacterFromKeyboardEvent(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return ""

  return event.key
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(-1)
}

function isInvalidRoomCodeCharacter(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false
  if (event.key.length !== 1) return false
  return !roomCodeCharacterFromKeyboardEvent(event)
}

function handleDesktopLandingKeydown(event: KeyboardEvent) {
  const roomCodeCharacter = roomCodeCharacterFromKeyboardEvent(event)
  if (!isDesktopViewport()) return
  if (event.defaultPrevented) return
  if (isEditableTarget(event.target)) return
  if (showTokenModal.value) return
  if (isInvalidRoomCodeCharacter(event)) {
    event.preventDefault()
    show(t("landing_room_code_invalid_character"), "error")
    return
  }
  if (!roomCodeCharacter) return

  event.preventDefault()
  void insertRoomCodeCharacter(roomCodeCharacter)
}

async function resolveEnteredToken(candidateToken: string) {
  const res = await fetch("/auth/resolve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: candidateToken }),
  })

  const data = (await res.json().catch(() => ({}))) as
    | {
        kind?: "host-admin"
        hostAdminSessionToken?: string
        serviceEntitlementToken?: string
        budgetKey?: string
        error?: string
      }
    | {
        kind?: "budget-admin"
        budgetAdminSessionToken?: string
        budgetKey?: string
        serviceEntitlementToken?: string
        error?: string
      }
    | {
        kind?: "service-entitlement"
        entitlementState?: "valid" | "exhausted"
        error?: string
      }

  return {
    ok: res.ok,
    status: res.status,
    data,
  }
}

function openAdmin() {
  if (hasHostAdminSessionToken.value) {
    window.location.href = "/host-admin"
    return
  }

  if (hasBudgetAdminSessionToken.value && budgetAdminBudgetKey.value) {
    window.location.href = `/budget-admin/${encodeURIComponent(budgetAdminBudgetKey.value)}`
  }
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

.landing__footer-admin {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font: inherit;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.landing__footer-admin:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border-color: var(--color-accent);
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

.landing__room-helper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  text-align: center;
}

.landing__inline-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-accent);
  font: inherit;
  font-size: 0.92rem;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.16em;
}

.landing__inline-link:hover {
  color: color-mix(in srgb, var(--color-accent) 82%, white 18%);
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
  user-select: none;
  -webkit-user-select: none;
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
  user-select: none;
  -webkit-user-select: none;
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
    padding: var(--space-6) var(--space-4) var(--space-8);
  }

  .landing__main,
  .landing__footer {
    max-width: none;
  }

  .landing__divider {
    margin: var(--space-5) 0;
  }

  .landing__token-status {
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: var(--space-2);
  }

  .landing__footer {
    justify-content: flex-start;
    padding-top: var(--space-6);
    padding-bottom: 0;
  }

  .landing__footer-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .landing__modal {
    align-items: flex-end;
    padding: 0;
  }

  .landing__modal-content {
    max-width: none;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }
}
</style>
