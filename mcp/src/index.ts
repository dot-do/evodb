/**
 * EvoDB MCP Server Package
 *
 * MCP (Model Context Protocol) server implementation for EvoDB
 * with oauth.do authentication support.
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { createMCPServer, type EvoDBBinding } from '@evodb/mcp'
 *
 * // Create evodb binding (adapter for your EvoDB instance)
 * const evodb: EvoDBBinding = {
 *   search: async (query, options) => {
 *     // Implementation using EvoDB full-text search
 *   },
 *   vectorSearch: async (embedding, options) => {
 *     // Implementation using EvoDB vector search
 *   },
 *   query: async (sql) => {
 *     // Implementation using EvoDB query
 *   },
 *   get: async (id) => {
 *     // Implementation using EvoDB get
 *   },
 * }
 *
 * // Create MCP server
 * const server = createMCPServer({ evodb })
 *
 * // Handle requests
 * const response = await server.handleRequest(request)
 * ```
 */

// Types
export type {
  EvoDBBinding,
  SearchOptions,
  VectorSearchOptions,
  EvoDBSearchResult,
  QueryResult,
  MCPServerConfig,
  ToolResponse,
  SearchInput,
  FetchInput,
  DoInput,
  DoResult,
} from './types.js'

// Server
export { MCPServer, createMCPServer } from './server.js'

// Tools
export {
  searchTool,
  createSearchHandler,
  fetchTool,
  createFetchHandler,
  doTool,
  createDoHandler,
  evodbTypeDefinitions,
} from './tools/index.js'

export type { DoHandlerOptions } from './tools/index.js'

// Auth
export {
  verifyJWT,
  clearJWKSCache,
  authenticateRequest,
  authMiddleware,
  getAuthContext,
  requireAuth,
  requireWrite,
  requireAdmin,
  ANONYMOUS_CONTEXT,
} from './auth/index.js'

export type {
  AuthContext,
  AuthMode,
  OAuthConfig,
  AuthConfig,
  AuthError,
  AuthResult,
  JWTPayload,
  MiddlewareHandler,
} from './auth/index.js'
