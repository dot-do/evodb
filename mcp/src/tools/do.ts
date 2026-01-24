/**
 * Do Tool for EvoDB MCP Server
 *
 * MCP tool for executing code with access to the evodb binding.
 * Runs code in a sandboxed environment with the evodb object available.
 */

import type { EvoDBBinding, DoInput, DoResult, ToolResponse } from '../types.js'

/**
 * Tool definition for the do tool
 */
export const doTool = {
  name: 'do',
  description: `Execute code with access to the evodb binding. The 'evodb' object is available with methods:
- evodb.search(query, options?) - Full-text/semantic search
- evodb.vectorSearch(embedding, options?) - Vector similarity search
- evodb.query(sql) - Execute SQL queries
- evodb.get(id) - Get document by ID

Code runs in a sandboxed environment with console.log available for output.`,
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'TypeScript/JavaScript code to execute. Use await for async operations.',
      },
    },
    required: ['code'],
  },
} as const

/**
 * Console capture interface
 */
interface CapturedLog {
  level: string
  message: string
  timestamp: number
}

/**
 * Creates a console capture object
 */
function createConsoleCapture(): {
  console: Console
  logs: CapturedLog[]
} {
  const logs: CapturedLog[] = []

  const capture = (level: string) => (...args: unknown[]) => {
    logs.push({
      level,
      message: args.map((arg) => {
        if (typeof arg === 'string') return arg
        try {
          return JSON.stringify(arg, null, 2)
        } catch {
          return String(arg)
        }
      }).join(' '),
      timestamp: Date.now(),
    })
  }

  const console = {
    log: capture('log'),
    info: capture('info'),
    warn: capture('warn'),
    error: capture('error'),
    debug: capture('debug'),
  } as Console

  return { console, logs }
}

/**
 * Execution options
 */
export interface DoHandlerOptions {
  /** Execution timeout in milliseconds (default: 5000) */
  timeout?: number
}

/**
 * Creates a do handler function that executes code with the evodb binding
 *
 * @param evodb - The EvoDB binding instance
 * @param options - Execution options
 * @returns Handler function for the do tool
 */
export function createDoHandler(
  evodb: EvoDBBinding,
  options: DoHandlerOptions = {}
): (input: DoInput) => Promise<ToolResponse> {
  const timeout = options.timeout ?? 5000

  return async (input: DoInput): Promise<ToolResponse> => {
    const startTime = Date.now()
    const { console: capturedConsole, logs } = createConsoleCapture()

    try {
      // Create sandbox with evodb binding and console
      const sandbox = {
        evodb,
        console: capturedConsole,
        // Expose common utilities
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Map,
        Set,
        Promise,
        // Block dangerous globals
        fetch: undefined,
        XMLHttpRequest: undefined,
        WebSocket: undefined,
      }

      // Wrap code in async function to support top-level await
      const wrappedCode = `
        return (async () => {
          ${input.code}
        })()
      `

      // Create function with sandbox as scope
      const fn = new Function(...Object.keys(sandbox), wrappedCode)

      // Execute with timeout
      const result = await Promise.race([
        fn(...Object.values(sandbox)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Execution timeout after ${timeout}ms`)), timeout)
        ),
      ])

      const duration = Date.now() - startTime

      const doResult: DoResult = {
        success: true,
        value: result,
        logs,
        duration,
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(doResult, null, 2),
          },
        ],
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

      const doResult: DoResult = {
        success: false,
        error: errorMessage,
        logs,
        duration,
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(doResult, null, 2),
          },
        ],
        isError: true,
      }
    }
  }
}

/**
 * TypeScript type definitions for the evodb binding
 * (for LLM code generation context)
 */
export const evodbTypeDefinitions = `
interface SearchOptions {
  limit?: number
  table?: string
  type?: 'fulltext' | 'semantic'
  minScore?: number
}

interface VectorSearchOptions {
  limit?: number
  table?: string
  metric?: 'cosine' | 'euclidean' | 'dot'
}

interface EvoDBSearchResult {
  id: string
  title: string
  snippet?: string
  score: number
  metadata?: Record<string, unknown>
}

interface QueryResult<T = Record<string, unknown>> {
  rows: T[]
  totalCount: number
  hasMore: boolean
}

interface EvoDBBinding {
  search(query: string, options?: SearchOptions): Promise<EvoDBSearchResult[]>
  vectorSearch(embedding: number[], options?: VectorSearchOptions): Promise<EvoDBSearchResult[]>
  query<T = Record<string, unknown>>(sql: string): Promise<QueryResult<T>>
  get<T = Record<string, unknown>>(id: string): Promise<T | null>
}

declare const evodb: EvoDBBinding
declare const console: Console
`
