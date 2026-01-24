/**
 * Search Tool Unit Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { createSearchHandler, searchTool } from '../tools/search.js'
import type { EvoDBBinding } from '../types.js'

describe('Search Tool', () => {
  describe('searchTool definition', () => {
    it('should have correct name and description', () => {
      expect(searchTool.name).toBe('search')
      expect(searchTool.description).toContain('Search EvoDB')
    })

    it('should require query parameter', () => {
      expect(searchTool.inputSchema.required).toContain('query')
    })

    it('should have optional limit, table, and type parameters', () => {
      const props = searchTool.inputSchema.properties
      expect(props.limit).toBeDefined()
      expect(props.table).toBeDefined()
      expect(props.type).toBeDefined()
    })
  })

  describe('createSearchHandler', () => {
    it('should return search results', async () => {
      const mockEvodb: EvoDBBinding = {
        search: vi.fn().mockResolvedValue([
          { id: '1', title: 'Test Doc', snippet: 'This is a test', score: 0.95 },
          { id: '2', title: 'Another Doc', score: 0.85 },
        ]),
        vectorSearch: vi.fn(),
        query: vi.fn(),
        get: vi.fn(),
      }

      const handler = createSearchHandler(mockEvodb)
      const result = await handler({ query: 'test query' })

      expect(result.isError).toBeUndefined()
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')

      const parsed = JSON.parse(result.content[0].text)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].id).toBe('1')
      expect(parsed[0].title).toBe('Test Doc')
    })

    it('should pass options to evodb.search', async () => {
      const mockEvodb: EvoDBBinding = {
        search: vi.fn().mockResolvedValue([]),
        vectorSearch: vi.fn(),
        query: vi.fn(),
        get: vi.fn(),
      }

      const handler = createSearchHandler(mockEvodb)
      await handler({
        query: 'test',
        limit: 5,
        table: 'users',
        type: 'semantic',
      })

      expect(mockEvodb.search).toHaveBeenCalledWith('test', {
        limit: 5,
        table: 'users',
        type: 'semantic',
      })
    })

    it('should handle errors gracefully', async () => {
      const mockEvodb: EvoDBBinding = {
        search: vi.fn().mockRejectedValue(new Error('Search failed')),
        vectorSearch: vi.fn(),
        query: vi.fn(),
        get: vi.fn(),
      }

      const handler = createSearchHandler(mockEvodb)
      const result = await handler({ query: 'test' })

      expect(result.isError).toBe(true)
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.error).toBe('Search failed')
    })

    it('should handle empty results', async () => {
      const mockEvodb: EvoDBBinding = {
        search: vi.fn().mockResolvedValue([]),
        vectorSearch: vi.fn(),
        query: vi.fn(),
        get: vi.fn(),
      }

      const handler = createSearchHandler(mockEvodb)
      const result = await handler({ query: 'nonexistent' })

      expect(result.isError).toBeUndefined()
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed).toHaveLength(0)
    })
  })
})
