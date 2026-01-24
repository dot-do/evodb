/**
 * Do Tool Unit Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { createDoHandler, doTool, evodbTypeDefinitions } from '../tools/do.js'
import type { EvoDBBinding } from '../types.js'

describe('Do Tool', () => {
  const createMockEvodb = (): EvoDBBinding => ({
    search: vi.fn().mockResolvedValue([]),
    vectorSearch: vi.fn().mockResolvedValue([]),
    query: vi.fn().mockResolvedValue({ rows: [], totalCount: 0, hasMore: false }),
    get: vi.fn().mockResolvedValue(null),
  })

  describe('doTool definition', () => {
    it('should have correct name and description', () => {
      expect(doTool.name).toBe('do')
      expect(doTool.description).toContain('evodb')
      expect(doTool.description).toContain('evodb.search')
      expect(doTool.description).toContain('evodb.query')
    })

    it('should require code parameter', () => {
      expect(doTool.inputSchema.required).toContain('code')
    })
  })

  describe('evodbTypeDefinitions', () => {
    it('should contain interface definitions', () => {
      expect(evodbTypeDefinitions).toContain('interface EvoDBBinding')
      expect(evodbTypeDefinitions).toContain('search(query:')
      expect(evodbTypeDefinitions).toContain('vectorSearch(embedding:')
      expect(evodbTypeDefinitions).toContain('query<T')
      expect(evodbTypeDefinitions).toContain('get<T')
    })
  })

  describe('createDoHandler', () => {
    it('should execute simple code and return result', async () => {
      const mockEvodb = createMockEvodb()
      const handler = createDoHandler(mockEvodb)

      const result = await handler({ code: 'return 1 + 1' })

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.success).toBe(true)
      expect(parsed.value).toBe(2)
      expect(parsed.duration).toBeGreaterThanOrEqual(0)
    })

    it('should capture console.log output', async () => {
      const mockEvodb = createMockEvodb()
      const handler = createDoHandler(mockEvodb)

      const result = await handler({ code: 'console.log("Hello, world!")' })

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.success).toBe(true)
      expect(parsed.logs).toHaveLength(1)
      expect(parsed.logs[0].level).toBe('log')
      expect(parsed.logs[0].message).toBe('Hello, world!')
    })

    it('should capture multiple console methods', async () => {
      const mockEvodb = createMockEvodb()
      const handler = createDoHandler(mockEvodb)

      const result = await handler({
        code: `
          console.log("info message")
          console.warn("warning")
          console.error("error")
        `,
      })

      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.logs).toHaveLength(3)
      expect(parsed.logs[0].level).toBe('log')
      expect(parsed.logs[1].level).toBe('warn')
      expect(parsed.logs[2].level).toBe('error')
    })

    it('should allow access to evodb binding', async () => {
      const mockEvodb = createMockEvodb()
      mockEvodb.search = vi.fn().mockResolvedValue([
        { id: '1', title: 'Test', score: 0.9 },
      ])

      const handler = createDoHandler(mockEvodb)

      const result = await handler({
        code: 'return await evodb.search("test")',
      })

      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.success).toBe(true)
      expect(parsed.value).toHaveLength(1)
      expect(parsed.value[0].id).toBe('1')
      expect(mockEvodb.search).toHaveBeenCalledWith('test')
    })

    it('should handle async evodb operations', async () => {
      const mockEvodb = createMockEvodb()
      mockEvodb.get = vi.fn().mockResolvedValue({ _id: 'doc-1', name: 'Test' })

      const handler = createDoHandler(mockEvodb)

      const result = await handler({
        code: `
          const doc = await evodb.get("doc-1")
          return doc.name
        `,
      })

      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.success).toBe(true)
      expect(parsed.value).toBe('Test')
    })

    it('should handle runtime errors', async () => {
      const mockEvodb = createMockEvodb()
      const handler = createDoHandler(mockEvodb)

      const result = await handler({
        code: 'throw new Error("Test error")',
      })

      expect(result.isError).toBe(true)
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.success).toBe(false)
      expect(parsed.error).toBe('Test error')
    })

    it('should handle syntax errors', async () => {
      const mockEvodb = createMockEvodb()
      const handler = createDoHandler(mockEvodb)

      const result = await handler({
        code: 'const x = {',
      })

      expect(result.isError).toBe(true)
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.success).toBe(false)
      expect(parsed.error).toBeDefined()
    })

    it('should timeout long-running code', async () => {
      const mockEvodb = createMockEvodb()
      const handler = createDoHandler(mockEvodb, { timeout: 100 })

      const result = await handler({
        code: `
          await new Promise(r => setTimeout(r, 500))
          return "done"
        `,
      })

      expect(result.isError).toBe(true)
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.success).toBe(false)
      expect(parsed.error).toContain('timeout')
    })

    it('should not allow access to fetch', async () => {
      const mockEvodb = createMockEvodb()
      const handler = createDoHandler(mockEvodb)

      const result = await handler({
        code: 'return typeof fetch',
      })

      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.success).toBe(true)
      expect(parsed.value).toBe('undefined')
    })
  })
})
