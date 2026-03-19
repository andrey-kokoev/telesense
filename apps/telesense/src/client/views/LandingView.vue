<script setup lang="ts">
import { ref, computed } from 'vue'
import { useClipboard } from '@vueuse/core'
import { useToast } from '../composables/useToast'
import { useAppStore, type RecentCall } from '../composables/useAppStore'
import { useSwipeActions } from '../composables/useSwipeActions'
import { useHaptics } from '../composables/useHaptics'
import { usePullToRefresh } from '../composables/usePullToRefresh'
import { useLongPress } from '../composables/useLongPress'
import SkeletonRow from '../components/SkeletonRow.vue'
import ActionSheet from '../components/ActionSheet.vue'

// Component for swipeable row
const SwipeableCallRow = {
  props: ['call', 'isEditing', 'isSelected', 'editName'],
  emits: ['select', 'edit', 'delete', 'saveEdit', 'cancelEdit', 'update:editName', 'longPress'],
  setup(props: { call: RecentCall; isEditing: boolean; isSelected: boolean; editName: string }, 
        { emit }: { emit: (e: string, ...args: any[]) => void }) {
    const swipe = useSwipeActions()
    const { tap } = useHaptics()
    const longPress = useLongPress(() => {
      emit('longPress', props.call)
    })
    
    function onTouchEnd() {
      const action = swipe.onTouchEnd()
      if (action === 'delete') {
        emit('delete', props.call)
        swipe.reset()
      } else if (action === 'edit') {
        tap()
        emit('edit', props.call)
        swipe.reset()
      }
    }
    
    function onClick() {
      if (!props.isEditing && Math.abs(swipe.offsetX.value) < 10) {
        emit('select', props.call)
      }
    }
    
    return { swipe, longPress, onTouchEnd, onClick }
  },
  template: `
    <div
      class="recent-call-row-wrap"
      @touchstart.passive="(e: TouchEvent) => { swipe.onTouchStart(e); longPress.onTouchStart(e); }"
      @touchmove.passive="(e: TouchEvent) => { swipe.onTouchMove(e); longPress.onTouchMove(e); }"
      @touchend="(e: TouchEvent) => { onTouchEnd(); longPress.onTouchEnd(); }"
    >
      <!-- Swipe background layer -->
      <div 
        class="swipe-bg"
        :class="swipe.bgClass"
      >
        <span v-if="swipe.direction === 'left'" class="swipe-action delete">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete
        </span>
        <span v-if="swipe.direction === 'right'" class="swipe-action edit">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit
        </span>
      </div>
      
      <!-- Main row -->
      <div
        class="recent-call-row"
        :class="{ editing: isEditing, selected: isSelected }"
        :style="swipe.rowStyle"
        @click="onClick"
      >
        <template v-if="isEditing">
          <div v-click-outside="() => emit('cancelEdit')" class="call-row-main">
            <input
              :value="editName"
              @input="emit('update:editName', ($event.target as HTMLInputElement).value)"
              type="text"
              class="input input-sm"
              placeholder="Name (optional)"
              maxlength="20"
              @keydown.enter="emit('saveEdit')"
              @keydown.esc="emit('cancelEdit')"
              @click.stop
              v-focus
            >
            <span class="call-id-subtitle">{{ call.id }}</span>
          </div>
          <div class="call-row-actions">
            <button class="btn-icon btn-save" @click.stop="emit('saveEdit')" title="Save">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
            <button class="btn-icon btn-cancel" @click.stop="emit('cancelEdit')" title="Cancel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </template>
        
        <template v-else>
          <div class="call-row-main">
            <span v-if="call.name" class="call-name">{{ call.name }}</span>
            <span class="call-id" :class="{ 'call-id-only': !call.name }">{{ call.id }}</span>
          </div>
          <div v-if="isSelected" class="selected-indicator">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="call-row-actions desktop-only">
            <button class="btn-icon" @click.stop="emit('edit', call)" title="Edit name">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-icon btn-delete" @click.stop="emit('delete', call)" title="Remove">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </template>
      </div>
    </div>
  `
}

const callId = ref('')
const tokenInput = ref('')
const editingCall = ref<string | null>(null)
const editingName = ref('')
const { copy } = useClipboard({ source: callId })
const { show: showToast } = useToast()
const store = useAppStore()
const { tap, success, error, selection, deleteAction } = useHaptics()

// Loading state for skeleton screens
const isLoading = ref(true)

// Simulate initial loading
setTimeout(() => {
  isLoading.value = false
}, 800)

// Long-press action sheet
const actionSheetOpen = ref(false)
const actionSheetCall = ref<RecentCall | null>(null)
const actionSheetActions = [
  { id: 'edit', label: 'Edit Name', icon: '✏️' },
  { id: 'copy', label: 'Copy ID', icon: '📋' },
  { id: 'delete', label: 'Delete', icon: '🗑️', danger: true }
]

function openActionSheet(call: RecentCall) {
  actionSheetCall.value = call
  actionSheetOpen.value = true
}

function onActionSelect(actionId: string) {
  if (!actionSheetCall.value) return
  
  const call = actionSheetCall.value
  
  switch (actionId) {
    case 'edit':
      startEditing(call)
      break
    case 'copy':
      copy(call.id).then(() => {
        success()
        showToast('Call ID copied!', 'success')
      })
      break
    case 'delete':
      deleteCall(call, { stopPropagation: () => {} } as Event)
      break
  }
  
  actionSheetCall.value = null
}

// Pull to refresh for recents (visual feedback only - data is local)
const pullRefresh = usePullToRefresh(async () => {
  // Simulate refresh
  await new Promise(r => setTimeout(r, 500))
  success()
  showToast('Recents refreshed', 'success')
})

// Helper computed for recent calls to avoid ComputedRef issues in v-for
const recentCallsList = computed<RecentCall[]>(() => store.recentCalls.value)

// Track if user has saved a token in this session
const hasSavedToken = ref(false)

// Initialize token input from store
if (store.token.value) {
  tokenInput.value = store.token.value
}

// Computed to show success only after explicit save
const showTokenSuccess = computed(() => hasSavedToken.value || store.token.value)

// Masked token preview (show last 4 chars)
const maskedToken = computed(() => {
  const token = store.token.value
  if (!token || token.length <= 4) return token
  return '•'.repeat(token.length - 4) + token.slice(-4)
})

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
  tap()
  if (!tokenInput.value.trim()) {
    error()
    showToast('Please enter a token', 'error')
    return
  }
  store.setToken(tokenInput.value.trim())
  hasSavedToken.value = true
  success()
  showToast('Token saved!', 'success')
}

function clearToken() {
  tap()
  store.clearToken()
  tokenInput.value = ''
  showToast('Token cleared', 'info')
}

function useRecentCall(call: RecentCall) {
  selection()
  callId.value = call.id
  showToast(`Call ID ${call.id} selected`, 'info')
}

function isSelected(call: RecentCall): boolean {
  return callId.value === call.id
}

function startEditing(call: RecentCall) {
  tap()
  editingCall.value = call.id
  editingName.value = call.name || ''
}

function saveEditing() {
  if (editingCall.value) {
    store.renameRecentCall(editingCall.value, editingName.value)
    editingCall.value = null
    editingName.value = ''
    success()
    showToast('Name updated!', 'success')
  }
}

function cancelEditing() {
  tap()
  editingCall.value = null
  editingName.value = ''
}

function deleteCall(call: RecentCall, event: Event) {
  deleteAction()
  event.stopPropagation()
  store.removeRecentCall(call.id)
  showToast('Call removed', 'info')
}

function joinCall() {
  tap()
  if (callId.value.length !== 6) {
    error()
    showToast('Call ID must be exactly 6 characters', 'error')
    return
  }
  if (!store.isAuthenticated.value) {
    error()
    showToast('Please enter and save your access token first', 'error')
    return
  }
  
  // Add to recent calls (without name - can be renamed later)
  store.addRecentCall(callId.value)
  success()
  
  window.location.search = `?call=${encodeURIComponent(callId.value)}`
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') joinCall()
}
</script>

<template>
  <div class="card" role="main" aria-label="Join a video call">
    <h2 class="card-title">Join a Video Call</h2>
    
    <!-- Token Section -->
    <div class="section">
      <h3>🔐 Access Token</h3>
      <p class="section-description">
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
          aria-label="Access token"
        >
        <button 
          class="btn btn-secondary"
          @click="saveToken"
          :disabled="!tokenInput.trim()"
          aria-label="Save access token"
        >
          {{ store.isAuthenticated ? 'Update' : 'Save' }}
        </button>
        <button 
          v-if="store.isAuthenticated"
          class="btn btn-secondary"
          @click="clearToken"
          aria-label="Clear access token"
        >
          Clear
        </button>
      </div>
      <div v-if="showTokenSuccess" class="status-success" role="status" aria-live="polite">
        ✅ Token saved: <code class="token-preview">{{ maskedToken }}</code>
      </div>
    </div>

    <!-- Recent Calls - only show when authenticated -->
    <div v-if="store.isAuthenticated" class="section">
      <div class="section-header">
        <h3>📞 Recent Calls</h3>
        <button v-if="recentCallsList.length > 0" class="btn-text" @click="store.clearRecentCalls" aria-label="Clear all recent calls">Clear all</button>
      </div>
      <!-- Skeleton loading -->
      <div v-if="isLoading" class="skeleton-list">
        <SkeletonRow v-for="i in 3" :key="i" />
      </div>
      
      <div v-else-if="recentCallsList.length === 0" class="empty-state">
        No recent calls. Create a new call below.
      </div>
      <TransitionGroup
        v-else 
        tag="div"
        name="list"
        class="recent-calls-list scrollable"
        :style="pullRefresh.pullStyle"
        @touchstart.passive="pullRefresh.onTouchStart"
        @touchmove.passive="pullRefresh.onTouchMove"
        @touchend="pullRefresh.onTouchEnd"
      >
        <!-- Pull to refresh indicator -->
        <div key="pull-indicator" class="pull-indicator" :style="pullRefresh.indicatorStyle">
          <div v-if="pullRefresh.isRefreshing" class="spinner"></div>
          <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </div>
        <SwipeableCallRow
          v-for="call in recentCallsList"
          :key="call.id"
          :call="call"
          :is-editing="editingCall === call.id"
          :is-selected="isSelected(call)"
          v-model:edit-name="editingName"
          @select="useRecentCall"
          @edit="startEditing"
          @delete="(c) => { deleteCall(c, { stopPropagation: () => {} } as Event); }"
          @save-edit="saveEditing"
          @cancel-edit="cancelEditing"
          @long-press="openActionSheet"
        />
      </TransitionGroup>
    </div>

    <!-- Long-press Action Sheet -->
    <ActionSheet
      :open="actionSheetOpen"
      title="Call Options"
      :actions="actionSheetActions"
      @select="onActionSelect"
      @close="actionSheetOpen = false"
    />

    <div class="divider">
      <span>or</span>
    </div>
    
    <template v-if="store.isAuthenticated">
    <!-- Call ID Section - requires auth to create/join -->
    <div class="section">
      <h3>🆕 New Call</h3>
      
      <div class="input-group">
        <div class="input-with-icon input-with-double-icon">
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
            v-if="callId"
            class="input-icon-btn input-icon-btn-left" 
            @click="copy(callId).then(() => showToast('Copied!', 'success'))"
            title="Copy call ID"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
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
        {{ isValidLength ? `Join ${callId}` : 'Enter Call ID' }}
      </button>
    </div>
    
    <div class="info-box">
      💡 <strong>Tip:</strong> Share your call ID with someone to start a 1:1 video call. Both participants need valid tokens.
    </div>
    </template>
  </div>
</template>

<style scoped>
.section {
  margin-bottom: 1.5rem;
}

.section h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--ui-text);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.section-header h3 {
  margin-bottom: 0;
}

.section-description {
  font-size: 0.875rem;
  color: var(--ui-text-muted);
  margin-bottom: 1rem;
}

.section-description a {
  color: var(--ui-primary);
  text-decoration: underline;
}

.status-success {
  margin-top: 0.75rem;
  font-size: 0.875rem;
  color: var(--ui-success);
}

/* Recent Calls List - Row-based design */
.recent-calls-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: relative;
}

/* Pull to refresh indicator */
.pull-indicator {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
  pointer-events: none;
}

.pull-indicator .spinner {
  width: 24px;
  height: 24px;
  border-color: var(--ui-border);
  border-top-color: var(--ui-primary);
}

/* Swipeable row container */
.recent-call-row-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 0.5rem;
  touch-action: pan-y;
}

/* Swipe background layer */
.swipe-bg {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.25rem;
  border-radius: 0.5rem;
  transition: background-color 0.15s ease;
}

.swipe-bg.bg-delete {
  background: linear-gradient(to right, #dc2626 0%, #ef4444 100%);
  justify-content: flex-end;
}

.swipe-bg.bg-edit {
  background: linear-gradient(to left, #2563eb 0%, #3b82f6 100%);
  justify-content: flex-start;
}

.swipe-action {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: white;
  font-weight: 600;
  font-size: 0.9375rem;
}

.recent-call-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.875rem;
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.recent-call-row:hover {
  border-color: var(--ui-primary);
  background: var(--ui-surface-hover);
}

.recent-call-row.selected {
  border-color: var(--ui-success);
  background: rgba(22, 163, 74, 0.08);
}

.recent-call-row.selected:hover {
  border-color: var(--ui-success);
  background: rgba(22, 163, 74, 0.12);
}

.recent-call-row.editing {
  cursor: default;
  background: var(--ui-surface);
  border-color: var(--ui-primary);
}

.call-row-main {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
}

.call-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ui-text);
  line-height: 1.3;
}

.call-id {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', monospace;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  letter-spacing: 0.025em;
}

.call-id-only {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--ui-text);
}

.call-id-subtitle {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', monospace;
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  margin-top: 0.25rem;
}

.call-row-actions {
  display: flex;
  gap: 0.5rem;
  margin-left: 0.75rem;
  flex-shrink: 0;
}

/* Hide desktop buttons on touch devices, show on hover-capable */
@media (hover: none) {
  .desktop-only {
    display: none;
  }
}

/* Button styles */
.btn-text {
  background: none;
  border: none;
  color: var(--ui-text-muted);
  font-size: 0.8125rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  transition: color 0.15s;
}

.btn-text:hover {
  color: var(--ui-text);
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-icon:hover {
  background: var(--ui-surface-hover);
  color: var(--ui-text);
}

.btn-icon.btn-save:hover {
  color: var(--ui-success);
}

.btn-icon.btn-cancel:hover,
.btn-icon.btn-delete:hover {
  color: var(--ui-error);
}

.selected-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  color: var(--ui-success);
  margin-left: 0.5rem;
  flex-shrink: 0;
}

.token-preview {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', monospace;
  font-size: 0.8125rem;
  background: rgba(22, 163, 74, 0.1);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  color: var(--ui-text);
}

.empty-state {
  padding: 1.5rem;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 0.875rem;
  background: var(--ui-surface);
  border-radius: 0.5rem;
  border: 1px dashed var(--ui-border);
}

/* List item animations */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.list-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.list-move {
  transition: transform 0.3s ease;
}

/* Skeleton list */
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Small input for editing */
.input-sm {
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  height: auto;
}

/* Double icon input layout */
.input-with-double-icon .input {
  padding-right: 5rem;
}

.input-icon-btn-left {
  right: 3rem;
}

/* Focus directive helper */
[v-focus] {
  outline: none;
}
</style>
