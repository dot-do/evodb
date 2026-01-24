/**
 * MCP Server Unit Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { createMCPServer, MCPServer } from '../server.js'
import type { EvoDBBinding } from '../types.js'

describe('MCP Server', () => {
  const createMockEvodb = (): EvoDBBinding => ({
    search: vi.fn().mockResolvedValue([
      { id: '1', title: 'Test Doc', score: 0.9 },
    ]),
    vectorSearch: vi.fn().mockResolvedValue([]),
    query: vi.fn().mockResolvedValue({ rows: [], totalCount: 0, hasMore: false }),
    get: vi.fn().mockResolvedValue({ _id: 'doc-1', content: 'test' }),
  })

  describe('createMCPServer', () => {
    it('should create an MCPServer instance', () => {
      const server = createMCPServer({ evodb: createMockEvodb() })
      expect(server).toBeInstanceOf(MCPServer)
    })
  })

  describe('MCPServer', () => {
    describe('listTools', () => {
      it('should return all three tools', () => {
        const server = createMCPServer({ evodb: createMockEvodb() })
        const tools = server.listTools()

        expect(tools).toHaveLength(3)
        const names = tools.map((t) => t.name)
        expect(names).toContain('search')
        expect(names).toContain('fetch')
        expect(names).toContain('do')
      })
    })

    describe('executeTool', () => {
      it('should execute search tool', async () => {
        const mockEvodb = createMockEvodb()
        const server = createMCPServer({ evodb: mockEvodb })

        const result = await server.executeTool('search', { query: 'test' })

        expect(result.isError).toBeUndefined()
        expect(mockEvodb.search).toHaveBeenCalledWith('test', {
          limit: undefined,
          table: undefined,
          type: undefined,
        })
      })

      it('should execute fetch tool', async () => {
        const mockEvodb = createMockEvodb()
        const server = createMCPServer({ evodb: mockEvodb })

        const result = await server.executeTool('fetch', { resource: 'users/user-1' })

        expect(result.isError).toBeUndefined()
        expect(mockEvodb.get).toHaveBeenCalledWith('users/user-1')
      })

      it('should execute do tool', async () => {
        const server = createMCPServer({ evodb: createMockEvodb() })

        const result = await server.executeTool('do', { code: 'return 42' })

        expect(result.isError).toBeUndefined()
        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.success).toBe(true)
        expect(parsed.value).toBe(42)
      })

      it('should return error for unknown tool', async () => {
        const server = createMCPServer({ evodb: createMockEvodb() })

        const result = await server.executeTool('unknown', {})

        expect(result.isError).toBe(true)
        const parsed = JSON.parse(result.content[0].text)
        expect(parsed.error).toBe('UNKNOWN_TOOL')
        expect(parsed.availableTools).toContain('search')
      })
    })

    describe('handleRequest', () => {
      it('should handle initialize request', async () => {
        const server = createMCPServer({ evodb: createMockEvodb() })

        const response = await server.handleRequest({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
        })

        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe(1)
        expect(response.result).toBeDefined()
        expect((response.result as any).serverInfo.name).toBe('evodb-mcp')
      })

      it('should handle tools/list request', async () => {
        const server = createMCPServer({ evodb: createMockEvodb() })

        const response = await server.handleRequest({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        })

        expect(response.result).toBeDefined()
        expect((response.result as any).tools).toHaveLength(3)
      })

      it('should handle tools/call request', async () => {
        const server = createMCPServer({ evodb: createMockEvodb() })

        const response = await server.handleRequest({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: { query: 'test' },
          },
        })

        expect(response.result).toBeDefined()
        expect((response.result as any).content).toBeDefined()
      })

      it('should return error for unknown method', async () => {
        const server = createMCPServer({ evodb: createMockEvodb() })

        const response = await server.handleRequest({
          jsonrpc: '2.0',
          id: 4,
          method: 'unknown/method',
        })

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32601)
      })
    })

    describe('handleHTTPRequest', () => {
      it('should reject non-POST requests', async () => {
        const server = createMCPServer({ evodb: createMockEvodb() })
        const request = new Request('https://example.com', { method: 'GET' })

        const response = await server.handleHTTPRequest(request)

        expect(response.status).toBe(405)
      })

      it('should handle valid MCP request', async () => {
        const server = createMCPServer({ evodb: createMockEvodb() })
        const request = new Request('https://example.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
          }),
        })

        const response = await server.handleHTTPRequest(request)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.jsonrpc).toBe('2.0')
      })

      it('should return parse error for invalid JSON', async () => {
        const server = createMCPServer({ evodb: createMockEvodb() })
        const request = new Request('https://example.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json',
        })

        const response = await server.handleHTTPRequest(request)

        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body.error.code).toBe(-32700)
      })

      it('should reject invalid JSON-RPC version', async () => {
        const server = createMCPServer({ evodb: createMockEvodb() })
        const request = new Request('https://example.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '1.0',
            id: 1,
            method: 'initialize',
          }),
        })

        const response = await server.handleHTTPRequest(request)

        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body.error.message).toContain('Invalid JSON-RPC version')
      })
    })
  })
})
