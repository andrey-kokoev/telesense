# Chat Feature: PDA Descent Toward Terminal State

## Starting Point

The chat feature exists but carries distributed ambiguity across multiple layers.

---

## Layer 1: Ontology - What kinds of things exist here?

**Current state (ambiguous):**

- "Messages" have: id, text, timestamp, isLocal
- "Chat" is: a data channel + localStorage + UI panel
- "History" is: per-device, per-room, limited to 100 items

**Question:** What is the essential entity we're working with?

**Options:**

1. **Ephemeral coordination signal** - Like hand gestures, exists only while call is active
2. **Persistent conversation record** - Like email, survives the call, searchable, referenceable
3. **Hybrid ephemeral-persistent** - Some messages matter after call, some don't

**Decision-forcing question:** If the browser crashes mid-call, which messages should be recoverable?

→ If only "important" ones: ontology must distinguish signal types
→ If all or none: simpler ontology, but policy must be explicit

**Live ambiguity:** Are we building a **coordination channel** or a **conversation record**?

---

## Layer 2: Dynamics - What changes and by what rule?

**Current state (implicit):**

- Messages appear when sent or received
- Messages persist in localStorage
- Messages disappear when limit (100) reached

**Question:** What is the legitimate lifecycle of a chat message?

**Options:**

| Model              | Creation | Persistence              | Destruction                |
| ------------------ | -------- | ------------------------ | -------------------------- |
| A. Pure ephemeral  | On send  | While call active        | On call end                |
| B. Pure persistent | On send  | Forever (or user delete) | Never (or explicit delete) |
| C. Bounded buffer  | On send  | Last N messages          | Automatic FIFO             |
| D. Tiered          | On send  | Important flagged        | Unimportant auto-expires   |

**Current implementation:** Mix of C (100 limit) with implicit B aspirations (localStorage)

**Decision-forcing question:** When a user rejoins the same room a week later, what do they need to see?

→ Nothing: Model A - chat is call-context-only
→ Last 100 messages: Model C - but why 100? Why not 10 or 1000?
→ Everything: Model B - but localStorage is unreliable for "forever"
→ Flagged messages only: Model D - but we have no flag mechanism

**Live ambiguity:** What is the **persistence intent**?

---

## Layer 3: Normativity - What counts as valid/preferable?

**Current state (tacit):**

- 500 chars is "good enough"
- 100 messages is "reasonable limit"
- Per-device storage is "acceptable"
- Ordered delivery is "required"

**Question:** What are the actual constraints vs preferences?

**Forced structure (technically constrained):**

- WebRTC data channels have ~16KB MTU practical limit
- localStorage has ~5-10MB quota (shared across origin)
- Data channels can be ordered or unordered (configuration, not forced)
- Storage can fail (full, private mode, disabled)

**Contingent policy (chosen, not forced):**

- 500 char limit (could be 1000 or 2000)
- 100 message limit (could be 10 or 1000)
- Per-device only (could sync via server or peer-to-peer)
- Ordered delivery (could be unordered for lower latency)

**Decision-forcing question:** What failure modes are acceptable?

- Message too long: Reject? Truncate? Split?
- Storage full: Silent drop? Notify user? Stop accepting messages?
- Cross-device mismatch: Last-write-wins? Merge? Show conflict?

**Live ambiguity:** What are our **reliability targets**?

---

## Layer 4: Environment - What assumptions about platform/world?

**Current assumptions (unstated):**

- Both peers support WebRTC data channels
- localStorage is available and writable
- Messages fit in memory
- Users are on same "version" of chat protocol

**Question:** What environmental dependencies are we taking for granted?

**Risky assumptions:**

1. **Symmetric capability** - Both sides have same storage, same limits
2. **Storage durability** - localStorage persists reliably
3. **Protocol compatibility** - No versioning of message format
4. **Single-device-per-user** - One localStorage per participant

**Decision-forcing question:** What happens when assumptions break?

- One side has no localStorage: Asymmetric history?
- One side is mobile (limited storage): Different limits?
- Message format changes: Silent failure? Version negotiation?

**Live ambiguity:** What is our **compatibility boundary**?

---

## Layer 5: Stopping - What makes further refinement unnecessary?

**Question:** When is "chat" done enough?

**Options for closure:**

1. **Minimal viable** - Text only, ephemeral, no persistence
2. **Basic persistent** - Text + localStorage + 100 msg limit (current)
3. **Rich coordination** - Reactions, typing indicators, ephemeral
4. **Full communication** - Persistent, searchable, cross-device, attachments

**Decision-forcing question:** What would make us add more features?

- Users asking for history search → persistence model insufficient
- Users asking for emojis → rich coordination needed
- Users asking for file sharing → full communication needed

**Live ambiguity:** What is the **feature boundary**?

---

## Synthesis: The Core Decision Surface

After descent, three legitimate terminal formulations emerge:

### Terminal Formulation A: Ephemeral Coordination

```
Purpose: Real-time call coordination only
Persistence: None (memory only)
Scope: Current call session only
Features: Text only, no history, no sync
Acceptable failure: Messages lost on disconnect
Policy choice: Intentionally transient
```

### Terminal Formulation B: Bounded Persistent Record

```
Purpose: Short-term reference during and immediately after call
Persistence: localStorage, per-device, last 100 messages
Scope: Per-room, per-device, 30-day TTL
Features: Text only, scrollable history, no sync
Acceptable failure: History diverges across devices, drops after 30 days
Policy choice: Convenience persistence, not archival
Explicit limits: 100 msgs, 500 chars, 30-day TTL
```

### Terminal Formulation C: Rich Communication Channel

```
Purpose: Full alternative communication path during calls
Persistence: Server-backed or synchronized peer state
Scope: Cross-device, searchable, exportable
Features: Text, reactions, presence, attachments
Acceptable failure: None - requires reliability engineering
Policy choice: Core feature, not add-on
```

---

## Current Implementation vs Terminal States

Current implementation is a **hybrid** that satisfies none:

- Has persistence (suggests B or C)
- But no sync (suggests A or B)
- Has limits 100/500 (suggests B)
- But no TTL (suggests B or C)
- No explicit policy document (satisfies none)

**Required choice:** Which terminal state to target?

---

## Recommended Path to Closure

If choosing **Terminal Formulation B** (bounded persistent record):

1. **Ontology collapse:** Message = {id, text, timestamp} only (remove isLocal - UI concern)
2. **Dynamics explicit:** FIFO at 100, 30-day TTL, explicit expiration
3. **Normativity stated:**
   - 500 chars = "single paragraph constraint" (policy)
   - 100 msgs = "recent context window" (policy)
   - Per-device = "privacy-first, no server" (policy)
4. **Environment bounded:**
   - Graceful degradation if localStorage unavailable
   - Protocol version in messages for future compatibility
5. **Stopping declared:**
   - Explicitly out of scope: cross-device sync, search, attachments, reactions

This reaches PDA closure relative to the decision context of "optional chat for video calls."
