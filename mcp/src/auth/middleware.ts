/**
 * Authentication Middleware for EvoDB MCP Server
 *
 * Provides request authentication using oauth.do tokens.
 */

import type {
  AuthConfig,
  AuthResult,
  AuthContext,
} from './types.js'
import { ANONYMOUS_CONTEXT } from './types.js'
import { verifyJWT } from './verify.js'

/**
 * Parse result for Authorization header
 */
type ParsedAuthHeader =
  | { status: 'missing' }
  | { status: 'malformed' }
  | { status: 'valid'; scheme: string; token: string }

/**
 * Parse the Authorization header
 */
function parseAuthHeader(header: string | null): ParsedAuthHeader {
  if (!header) return { status: 'missing' }

  const parts = header.split(' ')
  if (parts.length !== 2) return { status: 'malformed' }

  return { status: 'valid', scheme: parts[0], token: parts[1] }
}

/**
 * Create an error result
 */
function errorResult(code: string, message: string): AuthResult {
  return {
    success: false,
    error: { code, message },
  }
}

/**
 * Create anonymous context
 */
function createAnonymousContext(): AuthContext {
  return { ...ANONYMOUS_CONTEXT }
}

/**
 * Authenticate a request based on the configuration mode
 *
 * @param request - The incoming request
 * @param config - Authentication configuration
 * @returns AuthResult with context or error
 */
export async function authenticateRequest(
  request: Request,
  config: AuthConfig
): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization')
  const parsed = parseAuthHeader(authHeader)

  // Handle anon mode - always return anonymous context
  if (config.mode === 'anon') {
    return {
      success: true,
      context: createAnonymousContext(),
    }
  }

  // Handle malformed header
  if (parsed.status === 'malformed') {
    return errorResult('INVALID_AUTH_HEADER', 'Malformed Authorization header')
  }

  // No auth header provided
  if (parsed.status === 'missing') {
    // anon+auth mode allows anonymous access
    if (config.mode === 'anon+auth') {
      return {
        success: true,
        context: createAnonymousContext(),
      }
    }

    // auth-required mode requires authentication
    return errorResult('UNAUTHORIZED', 'Authentication required')
  }

  // Validate auth scheme
  if (parsed.scheme.toLowerCase() !== 'bearer') {
    return errorResult(
      'UNSUPPORTED_AUTH_SCHEME',
      `Unsupported authentication scheme: ${parsed.scheme}`
    )
  }

  // Verify JWT token via oauth.do
  if (!config.oauth) {
    return errorResult('NO_OAUTH_CONFIG', 'OAuth configuration not provided')
  }

  return verifyJWT(parsed.token, config.oauth)
}

/**
 * Middleware handler type
 */
export type MiddlewareHandler = (
  request: Request,
  next: () => Promise<Response>
) => Promise<Response>

/**
 * Create authentication middleware
 *
 * @param config - Authentication configuration
 * @returns Middleware handler
 */
export function authMiddleware(config: AuthConfig): MiddlewareHandler {
  return async (request: Request, next: () => Promise<Response>) => {
    const result = await authenticateRequest(request, config)

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer',
          },
        }
      )
    }

    // Attach auth context to request headers for downstream handlers
    const headers = new Headers(request.headers)
    headers.set('X-Auth-Context', JSON.stringify(result.context))

    const authenticatedRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
    })

    return next()
  }
}

/**
 * Get auth context from request headers
 * (set by authMiddleware)
 */
export function getAuthContext(request: Request): AuthContext | null {
  const contextHeader = request.headers.get('X-Auth-Context')
  if (!contextHeader) return null

  try {
    return JSON.parse(contextHeader) as AuthContext
  } catch {
    return null
  }
}

/**
 * Require authentication - returns error if not authenticated
 */
export function requireAuth(context: AuthContext | null): AuthResult {
  if (!context || context.type === 'anon') {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    }
  }

  return { success: true, context }
}

/**
 * Require write access - returns error if readonly
 */
export function requireWrite(context: AuthContext | null): AuthResult {
  if (!context || context.readonly) {
    return {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Write access required',
      },
    }
  }

  return { success: true, context }
}

/**
 * Require admin privileges
 */
export function requireAdmin(context: AuthContext | null): AuthResult {
  if (!context || context.type === 'anon') {
    return {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    }
  }

  if (!context.isAdmin) {
    return {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin privileges required',
      },
    }
  }

  return { success: true, context }
}
