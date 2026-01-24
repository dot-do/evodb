/**
 * EvoDB MCP Server
 *
 * Main MCP server implementation that exposes evodb functionality
 * through the search, fetch, and do tool primitives.
 */

import type {
  EvoDBBinding,
  MCPServerConfig,
  SearchInput,
  FetchInput,
  DoInput,
  ToolResponse,
} from './types.js'
import { searchTool, createSearchHandler } from './tools/search.js'
import { fetchTool, createFetchHandler } from './tools/fetch.js'
import { doTool, createDoHandler } from './tools/do.js'

/**
 * Tool definition type
 */
interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * MCP request types
 */
interface MCPRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

/**
 * MCP response types
 */
interface MCPResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * MCP Server class
 */
export class MCPServer {
  private readonly evodb: EvoDBBinding
  private readonly timeout: number
  private readonly tools: Map<string, ToolDefinition>
  private readonly handlers: Map<string, (input: unknown) => Promise<ToolResponse>>

  constructor(config: MCPServerConfig) {
    this.evodb = config.evodb
    this.timeout = config.timeout ?? 5000

    // Register tools
    this.tools = new Map([
      [searchTool.name, searchTool],
      [fetchTool.name, fetchTool],
      [doTool.name, doTool],
    ])

    // Create handlers
    const searchHandler = createSearchHandler(this.evodb)
    const fetchHandler = createFetchHandler(this.evodb)
    const doHandler = createDoHandler(this.evodb, { timeout: this.timeout })

    this.handlers = new Map([
      ['search', searchHandler as (input: unknown) => Promise<ToolResponse>],
      ['fetch', fetchHandler as (input: unknown) => Promise<ToolResponse>],
      ['do', doHandler as (input: unknown) => Promise<ToolResponse>],
    ])
  }

  /**
   * List available tools
   */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, input: unknown): Promise<ToolResponse> {
    const handler = this.handlers.get(name)
    if (!handler) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'UNKNOWN_TOOL',
              message: `Unknown tool: ${name}`,
              availableTools: Array.from(this.tools.keys()),
            }),
          },
        ],
        isError: true,
      }
    }

    return handler(input)
  }

  /**
   * Handle MCP JSON-RPC request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { id, method, params } = request

    try {
      switch (method) {
        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: this.listTools(),
            },
          }

        case 'tools/call': {
          const { name, arguments: args } = params as {
            name: string
            arguments: unknown
          }
          const result = await this.executeTool(name, args)
          return {
            jsonrpc: '2.0',
            id,
            result,
          }
        }

        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: 'evodb-mcp',
                version: '0.1.0',
              },
            },
          }

        case 'notifications/initialized':
          return {
            jsonrpc: '2.0',
            id,
            result: {},
          }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          }
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      }
    }
  }

  /**
   * Handle HTTP request (for streamable transport)
   */
  async handleHTTPRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    try {
      const body = await request.json()
      const mcpRequest = body as MCPRequest

      if (mcpRequest.jsonrpc !== '2.0') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: mcpRequest.id ?? null,
            error: {
              code: -32600,
              message: 'Invalid JSON-RPC version',
            },
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      const response = await this.handleRequest(mcpRequest)

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }
}

/**
 * Create an MCP server instance
 */
export function createMCPServer(config: MCPServerConfig): MCPServer {
  return new MCPServer(config)
}
