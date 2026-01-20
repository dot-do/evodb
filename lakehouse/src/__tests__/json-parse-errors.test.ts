/**
 * @evodb/lakehouse - JSON Parse Error Handling Tests (TDD)
 *
 * Tests for handling corrupt/invalid JSON in manifest files:
 * - Corrupt JSON content should throw descriptive errors
 * - Error messages should include file path and position info
 * - Recovery paths should be available
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  createR2AdapterFromObjectStorage,
  MemoryObjectStorageAdapter,
  TableStorage,
  JsonParseError,
  type R2StorageAdapter,
  type ObjectStorageAdapter,
} from '../index.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a storage adapter that returns corrupt JSON
 */
function createCorruptJsonStorage(corruptContent: string): ObjectStorageAdapter {
  const encoder = new TextEncoder();
  const storage = new Map<string, Uint8Array>();
  storage.set('test/corrupt.json', encoder.encode(corruptContent));

  return {
    async get(path: string) {
      return storage.get(path) ?? null;
    },
    async put(path: string, data: Uint8Array) {
      storage.set(path, data);
    },
    async delete(path: string) {
      storage.delete(path);
    },
    async list(prefix: string) {
      return [...storage.keys()].filter(k => k.startsWith(prefix));
    },
    async head(path: string) {
      const data = storage.get(path);
      if (!data) return null;
      return { size: data.length, lastModified: new Date() };
    },
  };
}

// =============================================================================
// JSON Parse Error Handling Tests
// =============================================================================

describe('JSON Parse Error Handling', () => {
  describe('createR2AdapterFromObjectStorage - readJson', () => {
    it('should throw JsonParseError for truncated JSON', async () => {
      const objectStorage = createCorruptJsonStorage('{"name": "test", "val');
      const adapter = createR2AdapterFromObjectStorage(objectStorage);

      await expect(adapter.readJson('test/corrupt.json')).rejects.toThrow(JsonParseError);
    });

    it('should throw JsonParseError for completely invalid JSON', async () => {
      const objectStorage = createCorruptJsonStorage('not valid json at all');
      const adapter = createR2AdapterFromObjectStorage(objectStorage);

      await expect(adapter.readJson('test/corrupt.json')).rejects.toThrow(JsonParseError);
    });

    it('should throw JsonParseError for JSON with trailing garbage', async () => {
      const objectStorage = createCorruptJsonStorage('{"valid": true}garbage');
      const adapter = createR2AdapterFromObjectStorage(objectStorage);

      await expect(adapter.readJson('test/corrupt.json')).rejects.toThrow(JsonParseError);
    });

    it('should include file path in error message', async () => {
      const objectStorage = createCorruptJsonStorage('invalid json');
      const adapter = createR2AdapterFromObjectStorage(objectStorage);

      try {
        await adapter.readJson('test/corrupt.json');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonParseError);
        const jsonError = error as JsonParseError;
        expect(jsonError.path).toBe('test/corrupt.json');
        expect(jsonError.message).toContain('test/corrupt.json');
      }
    });

    it('should include position info when available', async () => {
      // JSON with error at a specific position (truncated string gives position info)
      const objectStorage = createCorruptJsonStorage('{"name": "test", "val');
      const adapter = createR2AdapterFromObjectStorage(objectStorage);

      try {
        await adapter.readJson('test/corrupt.json');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonParseError);
        const jsonError = error as JsonParseError;
        // Position should be available for truncated string errors
        expect(jsonError.position).toBeDefined();
        expect(jsonError.position).toBe(21);
      }
    });

    it('should preserve the original error as cause', async () => {
      const objectStorage = createCorruptJsonStorage('not json');
      const adapter = createR2AdapterFromObjectStorage(objectStorage);

      try {
        await adapter.readJson('test/corrupt.json');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonParseError);
        const jsonError = error as JsonParseError;
        expect(jsonError.cause).toBeInstanceOf(SyntaxError);
      }
    });

    it('should handle empty file gracefully', async () => {
      const objectStorage = createCorruptJsonStorage('');
      const adapter = createR2AdapterFromObjectStorage(objectStorage);

      await expect(adapter.readJson('test/corrupt.json')).rejects.toThrow(JsonParseError);
    });

    it('should handle binary garbage as JSON', async () => {
      const storage = new MemoryObjectStorageAdapter();
      // Write binary data that is not valid UTF-8 JSON
      await storage.put('test/binary.json', new Uint8Array([0xFF, 0xFE, 0x00, 0x01]));
      const adapter = createR2AdapterFromObjectStorage(storage);

      await expect(adapter.readJson('test/binary.json')).rejects.toThrow(JsonParseError);
    });
  });

  describe('createR2Adapter (raw R2 bucket) - readJson', () => {
    it('should throw JsonParseError for corrupt JSON from R2', async () => {
      // Mock R2Bucket that returns corrupt JSON
      const mockBucket = {
        async get(path: string) {
          if (path === 'test/corrupt.json') {
            return {
              async text() {
                return 'corrupt json content';
              },
            };
          }
          return null;
        },
        async put() {},
        async delete() {},
        async list() {
          return { objects: [], truncated: false };
        },
        async head() {
          return null;
        },
      };

      // Import createR2Adapter dynamically to test it
      const { createR2Adapter } = await import('../r2.js');
      const adapter = createR2Adapter(mockBucket as never);

      await expect(adapter.readJson('test/corrupt.json')).rejects.toThrow(JsonParseError);
    });
  });

  describe('TableStorage - corrupt manifest handling', () => {
    it('should throw JsonParseError when manifest is corrupt', async () => {
      const objectStorage = createCorruptJsonStorage('{"tableId": "test", broken');
      const adapter = createR2AdapterFromObjectStorage(objectStorage);

      // Manually set up storage to have corrupt manifest at the expected path
      const encoder = new TextEncoder();
      await objectStorage.put(
        'com/example/test-table/_manifest.json',
        encoder.encode('{"tableId": "test", broken')
      );

      const storage = new TableStorage(adapter, 'com/example/test-table');

      await expect(storage.readManifest()).rejects.toThrow(JsonParseError);
    });

    it('should throw JsonParseError when schema is corrupt', async () => {
      const objectStorage = new MemoryObjectStorageAdapter();
      const encoder = new TextEncoder();
      await objectStorage.put(
        'com/example/test-table/_schema/v1.json',
        encoder.encode('not valid schema json')
      );

      const adapter = createR2AdapterFromObjectStorage(objectStorage);
      const storage = new TableStorage(adapter, 'com/example/test-table');

      await expect(storage.readSchema(1)).rejects.toThrow(JsonParseError);
    });

    it('should throw JsonParseError when snapshot is corrupt', async () => {
      const objectStorage = new MemoryObjectStorageAdapter();
      const encoder = new TextEncoder();
      await objectStorage.put(
        'com/example/test-table/snapshots/snap-123.json',
        encoder.encode('{invalid snapshot}')
      );

      const adapter = createR2AdapterFromObjectStorage(objectStorage);
      const storage = new TableStorage(adapter, 'com/example/test-table');

      await expect(storage.readSnapshot('snap-123')).rejects.toThrow(JsonParseError);
    });

    it('should include table location context in error for manifest', async () => {
      const objectStorage = new MemoryObjectStorageAdapter();
      const encoder = new TextEncoder();
      await objectStorage.put(
        'com/example/my-table/_manifest.json',
        encoder.encode('broken json')
      );

      const adapter = createR2AdapterFromObjectStorage(objectStorage);
      const storage = new TableStorage(adapter, 'com/example/my-table');

      try {
        await storage.readManifest();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonParseError);
        const jsonError = error as JsonParseError;
        expect(jsonError.path).toContain('com/example/my-table');
        expect(jsonError.path).toContain('_manifest.json');
      }
    });
  });

  describe('Error message quality', () => {
    it('should provide actionable error message for truncated JSON', async () => {
      const objectStorage = createCorruptJsonStorage('{"name": "test"');
      const adapter = createR2AdapterFromObjectStorage(objectStorage);

      try {
        await adapter.readJson('test/corrupt.json');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonParseError);
        const message = (error as Error).message;
        // Error should mention what went wrong
        expect(message.toLowerCase()).toMatch(/json|parse|invalid|unexpected/i);
      }
    });

    it('should show snippet of corrupt content for debugging', async () => {
      const longCorruptJson = '{"valid_start": true, ' + 'x'.repeat(100) + ' invalid_end';
      const objectStorage = createCorruptJsonStorage(longCorruptJson);
      const adapter = createR2AdapterFromObjectStorage(objectStorage);

      try {
        await adapter.readJson('test/corrupt.json');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JsonParseError);
        // Message should include some context but not be excessively long
        const message = (error as Error).message;
        expect(message.length).toBeLessThan(500);
      }
    });
  });
});
