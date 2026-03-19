# WebRTC Security Model

How encryption keys are established and where packets can be intercepted.

## Overview

WebRTC uses **end-to-end encryption** (E2EE) by design. Media is encrypted at the sender and only decrypted at the receiver. The SFU (Cloudflare) routes packets but **cannot decrypt them**.

## Key Establishment: DTLS Handshake

### The Process

```
Step 1: SDP Exchange (via signaling server)
┌─────────────┐                  ┌─────────────┐
│  Browser A  │──Offer SDP──────►│  Browser B  │
│  (generates │  (fingerprint    │  (generates │
│   keys)     │   only)          │   keys)     │
│             │◄─Answer SDP──────│             │
└─────────────┘                  └─────────────┘

Step 2: ICE Connectivity
   - UDP hole punching via STUN/TURN
   - Direct peer-to-peer path established

Step 3: DTLS Handshake (over UDP)
   - ECDH key exchange
   - Certificate verification via fingerprint
   - Master secret derived locally

Step 4: SRTP Key Derivation
   - SRTP keys extracted from DTLS master secret
   - Keys never leave the browser
```

### Local Key Generation

Keys are generated **inside the browser** using the Web Crypto API:

```javascript
// Ephemeral ECDH key pair generated locally
const keyPair = await crypto.subtle.generateKey(
  { name: "ECDH", namedCurve: "P-256" },
  true, // extractable
  ["deriveBits"],
);
// Private key NEVER leaves the browser
```

### What's in the SDP?

```sdp
// SDP contains fingerprint of certificate, NOT the key
a=fingerprint:sha-256
   4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B:19:E5:7C:AB

// This allows certificate verification (pinning)
// The actual private keys stay in the browser
```

## Security Architecture

### Who Can Decrypt?

| Location                 | Can Decrypt? | Reason                           |
| ------------------------ | ------------ | -------------------------------- |
| **Browser A (sender)**   | ✅ Yes       | Generated keys locally           |
| **Browser B (receiver)** | ✅ Yes       | Derived keys from DTLS handshake |
| **Cloudflare SFU**       | ❌ No        | No access to DTLS keys           |
| **Your Worker**          | ❌ No        | Only passes SDP, no keys         |
| **Network sniffers**     | ❌ No        | Encrypted with DTLS/SRTP         |

### What the SFU Sees

```
✅ Can see:
- Encrypted SRTP packets (garbage without keys)
- SSRC (stream identifiers)
- Packet sizes and timing
- ICE candidates

❌ Cannot see:
- DTLS keys
- SRTP keys
- Media content (audio/video)
- Certificate private keys
```

## Interception Points

### Legitimate Debugging

| Method                         | How                               | Use Case                   |
| ------------------------------ | --------------------------------- | -------------------------- |
| **chrome://webrtc-internals/** | Built-in browser tool             | Connection stats, no media |
| **SSLKEYLOGFILE**              | Export keys before browser launch | Wireshark decryption       |
| **Insertable Streams API**     | Transform encoded frames          | Custom encryption/effects  |
| **Browser dev tools**          | Memory debugging                  | Development only           |

### Example: SSLKEYLOGFILE

```bash
# 1. Export key log before launching browser
SSLKEYLOGFILE=~/keys.log google-chrome

# 2. Capture packets
sudo tcpdump -i any -w capture.pcap udp portrange 10000-20000

# 3. Decrypt in Wireshark
# Edit → Preferences → Protocols → TLS
# Point to (Pre)-Master-Secret log filename: ~/keys.log
```

### Attack Vectors (Theoretical)

| Attack                   | Feasibility | Mitigation                                     |
| ------------------------ | ----------- | ---------------------------------------------- |
| **Browser compromise**   | Medium      | OS sandbox, browser updates, malware detection |
| **DTLS downgrade**       | Low         | Modern browsers reject weak ciphers            |
| **Certificate spoofing** | Low         | Fingerprint verification in SDP                |
| **SFU compromise**       | N/A         | SFU has no keys by design                      |
| **Key extraction**       | Hard        | Production browsers protect keys in memory     |

## The DTLS Handshake in Detail

### 1. ClientHello (Browser A)

```
- Protocol version: DTLS 1.2
- Random nonce
- Cipher suites supported
- Extensions (SRI for SRTP)
```

### 2. ServerHello + Certificate (Browser B)

```
- Selected cipher suite
- Server certificate
- Server key exchange (ECDH public key)
- Hello done
```

### 3. Key Exchange

```
Both sides:
- Generate ephemeral ECDH key pair
- Exchange public keys
- Compute shared secret: ECDH(priv_A, pub_B) = ECDH(priv_B, pub_A)
- Derive master secret from shared secret
```

### 4. SRTP Key Derivation

```
SRTP_master_key = HKDF-Expand(
  master_secret,
  "EXTRACTOR-dtls_srtp",
  key_length
)
```

## Perfect Forward Secrecy (PFS)

**Property**: Even if long-term keys are compromised later, past sessions remain secure.

**Why**: WebRTC uses **ephemeral keys** - new keys generated for every session, discarded after use.

```
Session 1: Keys K1 → Used → Discarded
Session 2: Keys K2 → Used → Discarded
Session 3: Keys K3 → Used → Discarded

Even if K3 is compromised:
- Session 1 and 2 remain secure
- Only Session 3 is affected
```

## Application-Level Access Control

### Token-Based Authentication

The worker implements simple token-based auth to control access:

```
Client ──X-User-Token──► Worker ──► Verify against GENERIC_USER_TOKEN
```

**Configuration**:
| Environment | Variable | Purpose |
|-------------|----------|---------|
| All | `GENERIC_USER_TOKEN` | Secret token clients must provide |
| Dev only | `DO_NOT_ENFORCE_USER_TOKEN` | Set `true` to disable auth locally |

**Production**: Auth enforced (no `DO_NOT_ENFORCE_USER_TOKEN` set)  
**Development**: Auth disabled by default (`DO_NOT_ENFORCE_USER_TOKEN=true` in `.dev.vars`)

### Security Model

| Aspect             | Implementation                          |
| ------------------ | --------------------------------------- |
| Token storage      | Wrangler secret (encrypted at rest)     |
| Token transmission | HTTP header (`X-User-Token`)            |
| Token validation   | Constant-time comparison (Hono default) |
| Dev bypass         | Environment variable (dev only)         |

> **Note**: This is simple shared-token auth. Anyone with the token can use the app. For per-user auth, you'd need to add a user database and session management.

## Summary

| Question                  | Answer                                            |
| ------------------------- | ------------------------------------------------- |
| Where are keys generated? | **Inside the browser** (Web Crypto API)           |
| Where are keys exchanged? | **Peer-to-peer** over UDP (DTLS)                  |
| Who can decrypt?          | **Only the browsers** (endpoints)                 |
| Can SFU decrypt?          | **No** - by design                                |
| Can you intercept?        | **Only with browser cooperation** (SSLKEYLOGFILE) |
| App access control?       | **Token-based** (`X-User-Token` header)           |

## See Also

- [DTLS RFC 6347](https://tools.ietf.org/html/rfc6347)
- [SRTP RFC 3711](https://tools.ietf.org/html/rfc3711)
- [WebRTC Security Architecture](https://www.w3.org/TR/webrtc-security/)
- [Media Flow](../10-architecture/02-media-flow.md) - Packet-level details
