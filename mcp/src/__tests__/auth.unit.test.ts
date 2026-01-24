/**
 * Authentication Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  authenticateRequest,
  requireAuth,
  requireWrite,
  requireAdmin,
  getAuthContext,
  ANONYMOUS_CONTEXT,
} from '../auth/index.js'
import type { AuthConfig, AuthContext } from '../auth/index.js'

// Mock fetch for JWKS
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('authenticateRequest', () => {
    describe('anon mode', () => {
      it('should return anonymous context for any request', async () => {
        const config: AuthConfig = { mode: 'anon' }
        const request = new Request('https://example.com', {
          headers: { Authorization: 'Bearer some-token' },
        })

        const result = await authenticateRequest(request, config)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.context.type).toBe('anon')
          expect(result.context.readonly).toBe(true)
        }
      })
    })

    describe('anon+auth mode', () => {
      it('should return anonymous context when no auth header', async () => {
        const config: AuthConfig = { mode: 'anon+auth' }
        const request = new Request('https://example.com')

        const result = await authenticateRequest(request, config)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.context.type).toBe('anon')
        }
      })

      it('should reject malformed auth header', async () => {
        const config: AuthConfig = { mode: 'anon+auth' }
        const request = new Request('https://example.com', {
          headers: { Authorization: 'InvalidHeader' },
        })

        const result = await authenticateRequest(request, config)

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe('INVALID_AUTH_HEADER')
        }
      })

      it('should reject non-bearer scheme', async () => {
        const config: AuthConfig = { mode: 'anon+auth' }
        const request = new Request('https://example.com', {
          headers: { Authorization: 'Basic dXNlcjpwYXNz' },
        })

        const result = await authenticateRequest(request, config)

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe('UNSUPPORTED_AUTH_SCHEME')
        }
      })
    })

    describe('auth-required mode', () => {
      it('should reject requests without auth header', async () => {
        const config: AuthConfig = { mode: 'auth-required' }
        const request = new Request('https://example.com')

        const result = await authenticateRequest(request, config)

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe('UNAUTHORIZED')
        }
      })

      it('should reject when no oauth config provided', async () => {
        const config: AuthConfig = { mode: 'auth-required' }
        const request = new Request('https://example.com', {
          headers: { Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig' },
        })

        const result = await authenticateRequest(request, config)

        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe('NO_OAUTH_CONFIG')
        }
      })
    })
  })

  describe('requireAuth', () => {
    it('should fail for null context', () => {
      const result = requireAuth(null)
      expect(result.success).toBe(false)
    })

    it('should fail for anonymous context', () => {
      const result = requireAuth(ANONYMOUS_CONTEXT)
      expect(result.success).toBe(false)
    })

    it('should succeed for authenticated context', () => {
      const context: AuthContext = {
        type: 'oauth',
        id: 'user-123',
        readonly: false,
      }
      const result = requireAuth(context)
      expect(result.success).toBe(true)
    })
  })

  describe('requireWrite', () => {
    it('should fail for null context', () => {
      const result = requireWrite(null)
      expect(result.success).toBe(false)
    })

    it('should fail for readonly context', () => {
      const context: AuthContext = {
        type: 'oauth',
        id: 'user-123',
        readonly: true,
      }
      const result = requireWrite(context)
      expect(result.success).toBe(false)
    })

    it('should succeed for write-enabled context', () => {
      const context: AuthContext = {
        type: 'oauth',
        id: 'user-123',
        readonly: false,
      }
      const result = requireWrite(context)
      expect(result.success).toBe(true)
    })
  })

  describe('requireAdmin', () => {
    it('should fail for null context', () => {
      const result = requireAdmin(null)
      expect(result.success).toBe(false)
    })

    it('should fail for non-admin context', () => {
      const context: AuthContext = {
        type: 'oauth',
        id: 'user-123',
        readonly: false,
        isAdmin: false,
      }
      const result = requireAdmin(context)
      expect(result.success).toBe(false)
    })

    it('should succeed for admin context', () => {
      const context: AuthContext = {
        type: 'oauth',
        id: 'user-123',
        readonly: false,
        isAdmin: true,
      }
      const result = requireAdmin(context)
      expect(result.success).toBe(true)
    })
  })

  describe('getAuthContext', () => {
    it('should return null for request without context header', () => {
      const request = new Request('https://example.com')
      const context = getAuthContext(request)
      expect(context).toBeNull()
    })

    it('should parse context from header', () => {
      const expected: AuthContext = {
        type: 'oauth',
        id: 'user-123',
        readonly: false,
      }
      const request = new Request('https://example.com', {
        headers: { 'X-Auth-Context': JSON.stringify(expected) },
      })

      const context = getAuthContext(request)
      expect(context).toEqual(expected)
    })

    it('should return null for invalid JSON', () => {
      const request = new Request('https://example.com', {
        headers: { 'X-Auth-Context': 'invalid-json' },
      })

      const context = getAuthContext(request)
      expect(context).toBeNull()
    })
  })
})
