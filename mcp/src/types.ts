/**
 * EvoDB MCP Server Types
 *
 * Types for the MCP server tools and evodb binding interface.
 */

/**
 * Search options for full-text and semantic search
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number
  /** Table to search in (if not specified, searches all tables) */
  table?: string
  /** Search type: 'fulltext' for keyword search, 'semantic' for vector search */
  type?: 'fulltext' | 'semantic'
  /** Minimum score threshold for results (0-1) */
  minScore?: number
}

/**
 * Vector search options
 */
export interface VectorSearchOptions {
  /** Maximum number of results to return */
  limit?: number
  /** Table to search in */
  table?: string
  /** Distance metric for vector similarity */
  metric?: 'cosine' | 'euclidean' | 'dot'
}

/**
 * Search result from evodb
 */
export interface EvoDBSearchResult {
  /** Unique identifier for the result */
  id: string
  /** Title or primary field of the result */
  title: string
  /** Text snippet showing the match context */
  snippet?: string
  /** Relevance score (0-1, higher is better) */
  score: number
  /** Additional metadata about the result */
  metadata?: Record<string, unknown>
}

/**
 * Query result from SQL execution
 */
export interface QueryResult<T = Record<string, unknown>> {
  /** Result rows */
  rows: T[]
  /** Total count of matching rows (before limit) */
  totalCount: number
  /** Whether there are more results */
  hasMore: boolean
}

/**
 * EvoDB binding interface exposed to MCP tools
 *
 * This interface defines the methods available to MCP tools
 * for interacting with EvoDB.
 */
export interface EvoDBBinding {
  /**
   * Full-text search across documents
   *
   * @param query - Search query string
   * @param options - Search options
   * @returns Array of search results
   *
   * @example
   * ```typescript
   * const results = await evodb.search('user authentication', { limit: 10 })
   * ```
   */
  search(query: string, options?: SearchOptions): Promise<EvoDBSearchResult[]>

  /**
   * Vector/semantic search using embeddings
   *
   * @param embedding - Vector embedding array
   * @param options - Vector search options
   * @returns Array of search results
   *
   * @example
   * ```typescript
   * const embedding = await getEmbedding('semantic query')
   * const results = await evodb.vectorSearch(embedding, { limit: 5 })
   * ```
   */
  vectorSearch(
    embedding: number[],
    options?: VectorSearchOptions
  ): Promise<EvoDBSearchResult[]>

  /**
   * Execute a SQL query against EvoDB
   *
   * @param sql - SQL query string
   * @returns Query result with rows
   *
   * @example
   * ```typescript
   * const result = await evodb.query('SELECT * FROM users WHERE role = ?', ['admin'])
   * ```
   */
  query<T = Record<string, unknown>>(sql: string): Promise<QueryResult<T>>

  /**
   * Get a document by ID
   *
   * @param id - Document identifier
   * @returns The document or null if not found
   *
   * @example
   * ```typescript
   * const user = await evodb.get('users/user-123')
   * ```
   */
  get<T = Record<string, unknown>>(id: string): Promise<T | null>
}

/**
 * MCP tool response format
 */
export interface ToolResponse {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

/**
 * Search tool input
 */
export interface SearchInput {
  query: string
  limit?: number
  table?: string
  type?: 'fulltext' | 'semantic'
}

/**
 * Fetch tool input
 */
export interface FetchInput {
  resource: string
}

/**
 * Do tool input
 */
export interface DoInput {
  code: string
}

/**
 * Do tool execution result
 */
export interface DoResult {
  success: boolean
  value?: unknown
  logs: Array<{ level: string; message: string; timestamp: number }>
  error?: string
  duration: number
}

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  /** EvoDB binding instance */
  evodb: EvoDBBinding
  /** Execution timeout for the do tool (milliseconds) */
  timeout?: number
}
