/**
 * Authentication Types for EvoDB MCP Server
 *
 * Integrates with oauth.do for token validation.
 */

/**
 * Authentication context attached to requests
 */
export interface AuthContext {
  /** Type of authentication used */
  type: 'anon' | 'oauth' | 'apikey'
  /** Unique identifier for the authenticated entity */
  id: string
  /** Whether the context allows readonly operations only */
  readonly: boolean
  /** Whether the user has admin privileges */
  isAdmin?: boolean
  /** The raw access token */
  token?: string
  /** Additional metadata from the authentication provider */
  metadata?: Record<string, unknown>
}

/**
 * Authentication modes
 * - anon: Anonymous access only (readonly)
 * - anon+auth: Both anonymous and authenticated access
 * - auth-required: Authentication required for all access
 */
export type AuthMode = 'anon' | 'anon+auth' | 'auth-required'

/**
 * OAuth configuration for oauth.do
 */
export interface OAuthConfig {
  /** Issuer URL (e.g., https://oauth.do) */
  issuer: string
  /** Audience for token validation */
  audience?: string
  /** Required scopes for access */
  requiredScopes?: string[]
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  /** Authentication mode */
  mode: AuthMode
  /** OAuth configuration for oauth.do */
  oauth?: OAuthConfig
}

/**
 * Authentication error details
 */
export interface AuthError {
  /** Error code for programmatic handling */
  code: string
  /** Human-readable error message */
  message: string
  /** Additional error details */
  details?: Record<string, unknown>
}

/**
 * Result of authentication attempt
 */
export type AuthResult =
  | { success: true; context: AuthContext }
  | { success: false; error: AuthError }

/**
 * Anonymous auth context (readonly access)
 */
export const ANONYMOUS_CONTEXT: AuthContext = {
  type: 'anon',
  id: 'anonymous',
  readonly: true,
}

/**
 * JWT payload from oauth.do tokens
 */
export interface JWTPayload {
  /** Subject - user ID */
  sub: string
  /** Issuer */
  iss: string
  /** Audience */
  aud?: string | string[]
  /** Expiration time (Unix timestamp) */
  exp: number
  /** Issued at (Unix timestamp) */
  iat: number
  /** Space-separated scopes */
  scope?: string
  /** Additional claims */
  [key: string]: unknown
}
