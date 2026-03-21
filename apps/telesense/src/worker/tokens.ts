// Stateless Service Entitlement Token helpers
// Token format: budgetId.secretVersion.claims.proof
// Claims: base64url(JSON({ tokenFormatVersion, issuedAt }))
// Proof: HMAC-SHA256(secret, budgetId + "." + secretVersion + "." + claims)

export const TOKEN_FORMAT_VERSION = 1

export type TokenClaims = {
  tokenFormatVersion: number
  issuedAt: number
}

export type ParsedToken = {
  budgetId: string
  secretVersion: number
  claims: TokenClaims
  claimsBase64: string
  proof: string
}

export type TokenVerificationResult =
  | { valid: true; budgetId: string; secretVersion: number; claims: TokenClaims }
  | { valid: false; reason: string }

/**
 * Encode claims to base64url
 */
function base64urlEncode(data: string): string {
  return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

/**
 * Decode base64url to string
 */
function base64urlDecode(data: string): string {
  // Add padding if needed
  const padding = 4 - (data.length % 4)
  if (padding !== 4) {
    data += "=".repeat(padding)
  }
  return atob(data.replace(/-/g, "+").replace(/_/g, "/"))
}

/**
 * Generate HMAC-SHA256 proof
 */
async function generateProof(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(message)

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData)
  return bytesToHex(new Uint8Array(signature))
}

/**
 * Verify HMAC-SHA256 proof
 */
async function verifyProof(secret: string, message: string, proof: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(message)

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  )

  const signature = hexToBytes(proof)
  // @ts-expect-error - Uint8Array is valid BufferSource at runtime
  return await crypto.subtle.verify("HMAC", cryptoKey, signature, messageData)
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
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Mint a new service entitlement token
 */
export async function mintToken(
  budgetId: string,
  secretVersion: number,
  secret: string,
  claims?: Partial<TokenClaims>,
): Promise<string> {
  const fullClaims: TokenClaims = {
    tokenFormatVersion: TOKEN_FORMAT_VERSION,
    issuedAt: Math.floor(Date.now() / 1000),
    ...claims,
  }

  const claimsJson = JSON.stringify(fullClaims)
  const claimsBase64 = base64urlEncode(claimsJson)
  const message = `${budgetId}.${secretVersion}.${claimsBase64}`
  const proof = await generateProof(secret, message)

  return `${budgetId}.${secretVersion}.${claimsBase64}.${proof}`
}

/**
 * Parse a token into its components without verifying
 */
export function parseToken(token: string): ParsedToken | null {
  const parts = token.split(".")
  if (parts.length !== 4) {
    return null
  }

  const [budgetId, secretVersionStr, claimsBase64, proof] = parts

  const secretVersion = parseInt(secretVersionStr, 10)
  if (isNaN(secretVersion) || secretVersion < 1) {
    return null
  }

  try {
    const claimsJson = base64urlDecode(claimsBase64)
    const claims = JSON.parse(claimsJson) as TokenClaims

    if (claims.tokenFormatVersion !== TOKEN_FORMAT_VERSION) {
      return null
    }

    return {
      budgetId,
      secretVersion,
      claims,
      claimsBase64,
      proof,
    }
  } catch {
    return null
  }
}

/**
 * Verify a token's proof using the provided secret
 */
export async function verifyTokenWithSecret(
  token: string,
  secret: string,
): Promise<TokenVerificationResult> {
  const parsed = parseToken(token)
  if (!parsed) {
    return { valid: false, reason: "Malformed token" }
  }

  const message = `${parsed.budgetId}.${parsed.secretVersion}.${parsed.claimsBase64}`
  const isValid = await verifyProof(secret, message, parsed.proof)

  if (!isValid) {
    return { valid: false, reason: "Invalid proof" }
  }

  return {
    valid: true,
    budgetId: parsed.budgetId,
    secretVersion: parsed.secretVersion,
    claims: parsed.claims,
  }
}

/**
 * Extract budget ID from token without verifying
 */
export function extractBudgetId(token: string): string | null {
  const parsed = parseToken(token)
  return parsed?.budgetId || null
}

/**
 * Extract secret version from token without verifying
 */
export function extractSecretVersion(token: string): number | null {
  const parsed = parseToken(token)
  return parsed?.secretVersion || null
}

/**
 * Extract claims from token without verifying
 */
export function extractClaims(token: string): TokenClaims | null {
  const parsed = parseToken(token)
  return parsed?.claims || null
}
