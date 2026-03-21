const HOST_ADMIN_SESSION_FORMAT_VERSION = 1
const HOST_ADMIN_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

type HostAdminSessionClaims = {
  tokenFormatVersion: number
  purpose: "host-admin-session"
  issuedAt: number
  expiresAt: number
}

type HostAdminSessionVerificationResult =
  | { valid: true; claims: HostAdminSessionClaims }
  | { valid: false; reason: string }

function base64urlEncode(data: string): string {
  return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function base64urlDecode(data: string): string {
  const padding = 4 - (data.length % 4)
  if (padding !== 4) {
    data += "=".repeat(padding)
  }
  return atob(data.replace(/-/g, "+").replace(/_/g, "/"))
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function sign(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message))
  return bytesToHex(new Uint8Array(signature))
}

async function verify(secret: string, message: string, proof: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  )
  // @ts-expect-error Uint8Array is valid BufferSource at runtime
  return crypto.subtle.verify("HMAC", key, hexToBytes(proof), encoder.encode(message))
}

export async function mintHostAdminSessionToken(secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claims: HostAdminSessionClaims = {
    tokenFormatVersion: HOST_ADMIN_SESSION_FORMAT_VERSION,
    purpose: "host-admin-session",
    issuedAt: now,
    expiresAt: now + HOST_ADMIN_SESSION_TTL_SECONDS,
  }
  const payload = base64urlEncode(JSON.stringify(claims))
  const proof = await sign(secret, payload)
  return `${payload}.${proof}`
}

export async function verifyHostAdminSessionToken(
  token: string | null | undefined,
  secret: string,
): Promise<HostAdminSessionVerificationResult> {
  const value = token?.trim()
  if (!value) {
    return { valid: false, reason: "Missing token" }
  }

  const parts = value.split(".")
  if (parts.length !== 2) {
    return { valid: false, reason: "Malformed token" }
  }

  const [payload, proof] = parts
  let claims: HostAdminSessionClaims
  try {
    claims = JSON.parse(base64urlDecode(payload)) as HostAdminSessionClaims
  } catch {
    return { valid: false, reason: "Malformed claims" }
  }

  if (
    claims.tokenFormatVersion !== HOST_ADMIN_SESSION_FORMAT_VERSION ||
    claims.purpose !== "host-admin-session" ||
    typeof claims.issuedAt !== "number" ||
    typeof claims.expiresAt !== "number"
  ) {
    return { valid: false, reason: "Invalid claims" }
  }

  const proofValid = await verify(secret, payload, proof)
  if (!proofValid) {
    return { valid: false, reason: "Invalid proof" }
  }

  if (claims.expiresAt <= Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: "Expired" }
  }

  return { valid: true, claims }
}
