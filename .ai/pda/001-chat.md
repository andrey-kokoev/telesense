# PDA Descent: Chat Feature in Telesense

## Status: E2E TEST CREATED

Since manual testing isn't possible, created automated e2e test to observe actual behavior.

---

## Test Strategy

Created: `e2e/chat-messaging.e2e.ts`

**What it does:**

1. Opens two separate browser contexts (completely isolated)
2. Browser A creates room, Browser B joins same room
3. A sends chat message
4. Test verifies B receives the message
5. B sends reply
6. Test verifies A receives reply
7. Tests message deletion across both sides

**What this tells us:**

| Test Result                | Conclusion                                   |
| -------------------------- | -------------------------------------------- |
| Both tests pass            | Chat works, earlier issue was something else |
| A sends, B doesn't receive | Problem in sender→SFU or SFU→B path          |
| Neither can send           | Data channel fundamentally broken            |
| Delete fails               | Delete signal not reaching counterparty      |

---

## Hypothesis Update

**If tests fail:** We have reproducible failure case.

- Can add logging ONLY at failure point
- Can inspect WebRTC internals in test context
- Can capture SDP offer/answer

**If tests pass:** Earlier failure was due to:

- Timing (test has explicit waits)
- Browser permissions (test handles this)
- Specific browser version
- Network conditions

---

## Running the Test

```bash
cd apps/telesense
pnpm run test -- chat-messaging.e2e.ts
```

Or with UI mode to see what's happening:

```bash
pnpm run test:ui
# Then select chat-messaging.e2e.ts
```

---

## PDA Status

**Ambiguity localized to:** Observable behavior in controlled environment.

**No more guessing:** The test will show exactly what happens.

**Next step:** Run the test, observe result, then fix based on evidence.
