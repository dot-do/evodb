/**
 * Fetch Tool Unit Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { createFetchHandler, fetchTool } from '../tools/fetch.js'
import type { EvoDBBinding } from '../types.js'

describe('Fetch Tool', () => {
  describe('fetchTool definition', () => {
    it('should have correct name and description', () => {
      expect(fetchTool.name).toBe('fetch')
      expect(fetchTool.description).toContain('Retrieve a document')
    })

    it('should require resource parameter', () => {
      expect(fetchTool.inputSchema.required).toContain('resource')
    })
  })

  describe('createFetchHandler', () => {
    it('should return document for valid ID', async () => {
      const mockDoc = {
        _id: 'user-123',
        name: 'Alice',
        email: 'alice@example.com',
      }

      const mockEvodb: EvoDBBinding = {
        search: vi.fn(),
        vectorSearch: vi.fn(),
        query: vi.fn(),
        get: vi.fn().mockResolvedValue(mockDoc),
      }

      const handler = createFetchHandler(mockEvodb)
      const result = await handler({ resource: 'users/user-123' })

      expect(result.isError).toBeUndefined()
      expect(result.content).toHaveLength(2)

      const docContent = JSON.parse(result.content[0].text)
      expect(docContent._id).toBe('user-123')
      expect(docContent.name).toBe('Alice')

      const metadata = JSON.parse(result.content[1].text)
      expect(metadata.metadata.table).toBe('users')
      expect(metadata.metadata.id).toBe('user-123')
    })

    it('should handle resource ID without table prefix', async () => {
      const mockDoc = { _id: 'doc-abc', content: 'test' }

      const mockEvodb: EvoDBBinding = {
        search: vi.fn(),
        vectorSearch: vi.fn(),
        query: vi.fn(),
        get: vi.fn().mockResolvedValue(mockDoc),
      }

      const handler = createFetchHandler(mockEvodb)
      const result = await handler({ resource: 'doc-abc' })

      expect(result.isError).toBeUndefined()
      expect(mockEvodb.get).toHaveBeenCalledWith('doc-abc')
    })

    it('should return error for non-existent document', async () => {
      const mockEvodb: EvoDBBinding = {
        search: vi.fn(),
        vectorSearch: vi.fn(),
        query: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
      }

      const handler = createFetchHandler(mockEvodb)
      const result = await handler({ resource: 'users/nonexistent' })

      expect(result.isError).toBe(true)
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.error).toBe('NOT_FOUND')
    })

    it('should handle errors gracefully', async () => {
      const mockEvodb: EvoDBBinding = {
        search: vi.fn(),
        vectorSearch: vi.fn(),
        query: vi.fn(),
        get: vi.fn().mockRejectedValue(new Error('Database error')),
      }

      const handler = createFetchHandler(mockEvodb)
      const result = await handler({ resource: 'users/user-123' })

      expect(result.isError).toBe(true)
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.error).toBe('Database error')
    })
  })
})
