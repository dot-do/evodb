/**
 * JWT Verification for oauth.do tokens
 *
 * Implements token validation using the Web Crypto API
 * for use in Cloudflare Workers environment.
 */

import type { AuthContext, AuthResult, OAuthConfig, JWTPayload } from './types.js'

/**
 * JWKS (JSON Web Key Set) response from oauth.do
 */
interface JWKSResponse {
  keys: JsonWebKey[]
}

/**
 * Cached JWKS keys
 */
let cachedJWKS: Map<string, CryptoKey> = new Map()
let jwksCacheTime = 0
const JWKS_CACHE_TTL = 3600000 // 1 hour in milliseconds

/**
 * Fetch JWKS from oauth.do
 */
async function fetchJWKS(issuer: string): Promise<Map<string, CryptoKey>> {
  const now = Date.now()

  // Return cached keys if still valid
  if (cachedJWKS.size > 0 && now - jwksCacheTime < JWKS_CACHE_TTL) {
    return cachedJWKS
  }

  const jwksUrl = `${issuer}/.well-known/jwks.json`
  const response = await fetch(jwksUrl)

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status} ${response.statusText}`)
  }

  const jwks: JWKSResponse = await response.json()
  const keyMap = new Map<string, CryptoKey>()

  for (const jwk of jwks.keys) {
    if (jwk.kty === 'RSA' && jwk.use === 'sig') {
      const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      )
      // Use kid if available, otherwise generate from n value
      const kid = (jwk as { kid?: string }).kid || (jwk.n as string).slice(0, 16)
      keyMap.set(kid, key)
    }
  }

  cachedJWKS = keyMap
  jwksCacheTime = now

  return keyMap
}

/**
 * Base64URL decode
 */
function base64UrlDecode(input: string): Uint8Array {
  // Convert base64url to base64
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  // Pad with = if needed
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
  // Decode
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Parse JWT header
 */
function parseJWTHeader(token: string): { alg: string; kid?: string } {
  const [headerB64] = token.split('.')
  const headerJson = new TextDecoder().decode(base64UrlDecode(headerB64))
  return JSON.parse(headerJson)
}

/**
 * Parse JWT payload
 */
function parseJWTPayload(token: string): JWTPayload {
  const [, payloadB64] = token.split('.')
  const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64))
  return JSON.parse(payloadJson)
}

/**
 * Verify JWT signature using Web Crypto API
 */
async function verifySignature(
  token: string,
  key: CryptoKey
): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return false
  }

  const [headerB64, payloadB64, signatureB64] = parts
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signature = base64UrlDecode(signatureB64)

  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data)
}

/**
 * Parse scope string to check for specific scopes
 */
function parseScopes(scope?: string): Set<string> {
  if (!scope) return new Set()
  return new Set(scope.split(' ').filter(Boolean))
}

/**
 * Determine if context should be readonly based on scopes
 */
function isReadonlyScope(scopes: Set<string>): boolean {
  // If has write, admin, or any *:write scope, not readonly
  if (scopes.has('write') || scopes.has('admin')) {
    return false
  }
  for (const scope of scopes) {
    if (scope.endsWith(':write') || scope.endsWith(':admin')) {
      return false
    }
  }
  return true
}

/**
 * Check if scopes include admin access
 */
function hasAdminScope(scopes: Set<string>): boolean {
  if (scopes.has('admin')) return true
  for (const scope of scopes) {
    if (scope.endsWith(':admin')) {
      return true
    }
  }
  return false
}

/**
 * Verify a JWT token from oauth.do
 *
 * @param token - The JWT token to verify
 * @param config - OAuth configuration
 * @returns AuthResult with context or error
 */
export async function verifyJWT(
  token: string,
  config: OAuthConfig
): Promise<AuthResult> {
  try {
    // Parse token parts
    const header = parseJWTHeader(token)
    const payload = parseJWTPayload(token)

    // Validate issuer
    if (payload.iss !== config.issuer) {
      return {
        success: false,
        error: {
          code: 'INVALID_ISSUER',
          message: `Token issuer mismatch: expected ${config.issuer}, got ${payload.iss}`,
        },
      }
    }

    // Validate audience if configured
    if (config.audience) {
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
      if (!audiences.includes(config.audience)) {
        return {
          success: false,
          error: {
            code: 'INVALID_AUDIENCE',
            message: 'Token audience does not match',
          },
        }
      }
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return {
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired',
        },
      }
    }

    // Fetch JWKS and verify signature
    const keys = await fetchJWKS(config.issuer)
    let verified = false

    // Try the key matching kid first, then all keys
    if (header.kid && keys.has(header.kid)) {
      verified = await verifySignature(token, keys.get(header.kid)!)
    }

    if (!verified) {
      // Try all keys
      for (const key of keys.values()) {
        verified = await verifySignature(token, key)
        if (verified) break
      }
    }

    if (!verified) {
      return {
        success: false,
        error: {
          code: 'INVALID_SIGNATURE',
          message: 'Token signature verification failed',
        },
      }
    }

    // Check required scopes
    const scopes = parseScopes(payload.scope)
    if (config.requiredScopes && config.requiredScopes.length > 0) {
      for (const required of config.requiredScopes) {
        if (!scopes.has(required)) {
          return {
            success: false,
            error: {
              code: 'INSUFFICIENT_SCOPE',
              message: `Required scope missing: ${required}`,
            },
          }
        }
      }
    }

    // Build auth context
    const readonly = isReadonlyScope(scopes)
    const isAdmin = hasAdminScope(scopes) || undefined

    const context: AuthContext = {
      type: 'oauth',
      id: payload.sub,
      readonly,
      token,
      ...(isAdmin !== undefined && { isAdmin }),
      metadata: {
        scope: payload.scope,
        exp: payload.exp,
        iat: payload.iat,
        iss: payload.iss,
      },
    }

    return { success: true, context }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'VERIFICATION_ERROR',
        message: error instanceof Error ? error.message : 'JWT verification failed',
      },
    }
  }
}

/**
 * Clear the JWKS cache (useful for testing)
 */
export function clearJWKSCache(): void {
  cachedJWKS = new Map()
  jwksCacheTime = 0
}
