/**
 * EvoDB MCP Authentication Module
 *
 * Exports authentication types, verification, and middleware
 * for oauth.do integration.
 */

export type {
  AuthContext,
  AuthMode,
  OAuthConfig,
  AuthConfig,
  AuthError,
  AuthResult,
  JWTPayload,
} from './types.js'

export { ANONYMOUS_CONTEXT } from './types.js'

export { verifyJWT, clearJWKSCache } from './verify.js'

export {
  authenticateRequest,
  authMiddleware,
  getAuthContext,
  requireAuth,
  requireWrite,
  requireAdmin,
} from './middleware.js'

export type { MiddlewareHandler } from './middleware.js'
