# WebRTC Security Model

This document separates two different security layers:

- media transport security
- application access control

## 1. Media Transport Security

For browser-to-Cloudflare media transport, `telesense` relies on standard WebRTC security properties:

- DTLS for key negotiation
- SRTP for media encryption
- ephemeral session keys per connection

That means:

- browsers can encrypt/decrypt their own media
- Cloudflare forwards encrypted media packets
- the worker never sees media keys or raw audio/video

## 2. What the Worker Can and Cannot See

The worker can see:

- room ids
- participant/session metadata
- published track identifiers
- signaling payloads
- service-entitlement and host-admin auth headers

The worker cannot see:

- SRTP keys
- DTLS private keys
- decrypted audio/video frames

## 3. Application Access Control

### Service Entitlement

Service use is gated by:

```http
X-Service-Entitlement-Token
```

This token is used when opening a room that does not yet exist.

The worker verifies that token against the selected `EntitlementBudget` and checks whether budget remains.

Relevant configuration:

- `SERVICE_ENTITLEMENT_TOKEN`
  - worker-side secret used to mint and verify service entitlement tokens
- `DO_NOT_ENFORCE_SERVICE_ENTITLEMENT`
  - local-development-only bypass

### Host Admin

Host admin is intentionally a separate system.

Bootstrap:

```http
X-Host-Admin-Token
```

Steady-state admin:

```http
X-Host-Admin-Session
```

Flow:

1. operator pastes `HOST_ADMIN_BOOTSTRAP_TOKEN` into `/host-admin`
2. browser exchanges it at `POST /admin/auth/exchange`
3. browser stores the returned host-admin session token
4. admin routes require `X-Host-Admin-Session`

Relevant configuration:

- `HOST_ADMIN_BOOTSTRAP_TOKEN`
  - setup-time bootstrap credential

## 4. Security Boundaries

### Browser Compromise

If the browser profile is compromised, stored local credentials are compromised too:

- service-entitlement token if stored
- host-admin session token if stored
- room participant secrets if stored

### Bootstrap Token Leakage

If `HOST_ADMIN_BOOTSTRAP_TOKEN` leaks, an attacker can exchange it for a fresh host-admin session until it is rotated.

### Entitlement Secret Leakage

If `SERVICE_ENTITLEMENT_TOKEN` leaks, an attacker can mint valid service entitlement tokens.

This is why bootstrap/admin auth is now separated from the service-entitlement secret.

## 5. Current Tradeoffs

Current model is intentionally simple:

- stateless service entitlement tokens
- stateless host-admin session tokens
- no per-session server-side revocation store

That means:

- low infrastructure overhead
- clean setup/deploy flow
- but individual host-admin sessions are not separately revocable before expiry

## Summary

| Concern                      | Current Mechanism                         |
| ---------------------------- | ----------------------------------------- |
| Media confidentiality        | DTLS + SRTP                               |
| Room creation authorization  | `X-Service-Entitlement-Token`             |
| Host-admin bootstrap         | `X-Host-Admin-Token`                      |
| Host-admin steady-state auth | `X-Host-Admin-Session`                    |
| Local-dev bypass             | `DO_NOT_ENFORCE_SERVICE_ENTITLEMENT=true` |
