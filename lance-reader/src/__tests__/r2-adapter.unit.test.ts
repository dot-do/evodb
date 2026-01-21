/**
 * Tests for R2 Storage Adapter and other storage adapters
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  R2StorageAdapter,
  MemoryStorageAdapter,
  FetchStorageAdapter,
  CachingStorageAdapter,
  createLanceStorageAdapter,
  type R2Bucket,
  type R2ObjectBody,
  type R2Object,
  type R2Objects,
} from '../r2-adapter.js';

// ==========================================
// R2 Storage Adapter Tests
// ==========================================

describe('R2StorageAdapter', () => {
  let mockBucket: R2Bucket;

  beforeEach(() => {
    // Create a mock R2 bucket
    mockBucket = {
      get: vi.fn(),
      head: vi.fn(),
      list: vi.fn(),
    };
  });

  describe('constructor and key prefix', () => {
    it('should create adapter without prefix', () => {
      const adapter = new R2StorageAdapter(mockBucket);
      expect(adapter).toBeDefined();
    });

    it('should create adapter with prefix', () => {
      const adapter = new R2StorageAdapter(mockBucket, 'my-prefix');
      expect(adapter).toBeDefined();
    });

    it('should normalize multiple slashes in prefix', async () => {
      const adapter = new R2StorageAdapter(mockBucket, 'prefix/');
      (mockBucket.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await adapter.get('//file.bin');

      expect(mockBucket.get).toHaveBeenCalledWith('prefix/file.bin');
    });

    // Path traversal validation tests (Issue evodb-409)
    it('should reject path traversal in keyPrefix', () => {
      expect(() => new R2StorageAdapter(mockBucket, '../secrets')).toThrow(/path traversal/i);
      expect(() => new R2StorageAdapter(mockBucket, 'data/../secrets')).toThrow(/path traversal/i);
    });

    it('should reject absolute paths in keyPrefix', () => {
      expect(() => new R2StorageAdapter(mockBucket, '/etc/passwd')).toThrow(/absolute path/i);
      expect(() => new R2StorageAdapter(mockBucket, 'C:\\Windows')).toThrow(/absolute path/i);
    });

    it('should reject URL-encoded path traversal in keyPrefix', () => {
      expect(() => new R2StorageAdapter(mockBucket, '%2e%2e/secrets')).toThrow(/path traversal/i);
      expect(() => new R2StorageAdapter(mockBucket, 'data/%2e%2e/secrets')).toThrow(/path traversal/i);
    });

    it('should allow safe keyPrefix values', () => {
      expect(() => new R2StorageAdapter(mockBucket, 'data')).not.toThrow();
      expect(() => new R2StorageAdapter(mockBucket, 'my-prefix/nested')).not.toThrow();
      expect(() => new R2StorageAdapter(mockBucket, '')).not.toThrow();
    });
  });

  describe('get', () => {
    it('should return null for missing object', async () => {
      const adapter = new R2StorageAdapter(mockBucket);
      (mockBucket.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await adapter.get('missing.bin');
      expect(result).toBeNull();
    });

    it('should return ArrayBuffer for existing object', async () => {
      const adapter = new R2StorageAdapter(mockBucket);
      const testData = new Uint8Array([1, 2, 3, 4, 5]).buffer;

      const mockObject: Partial<R2ObjectBody> = {
        arrayBuffer: vi.fn().mockResolvedValue(testData),
      };
      (mockBucket.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockObject);

      const result = await adapter.get('test.bin');
      expect(result).toBe(testData);
    });

    it('should prepend key prefix when getting', async () => {
      const adapter = new R2StorageAdapter(mockBucket, 'data');
      (mockBucket.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await adapter.get('test.bin');
      expect(mockBucket.get).toHaveBeenCalledWith('data/test.bin');
    });
  });

  describe('getRange', () => {
    it('should read byte range with positive offset', async () => {
      const adapter = new R2StorageAdapter(mockBucket);
      const testData = new Uint8Array([3, 4, 5]).buffer;

      const mockObject: Partial<R2ObjectBody> = {
        arrayBuffer: vi.fn().mockResolvedValue(testData),
      };
      (mockBucket.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockObject);

      const result = await adapter.getRange('test.bin', 2, 3);

      expect(mockBucket.get).toHaveBeenCalledWith('test.bin', {
        range: { offset: 2, length: 3 },
      });
      expect(result).toBe(testData);
    });

    it('should read from end with negative offset (suffix)', async () => {
      const adapter = new R2StorageAdapter(mockBucket);
      const testData = new Uint8Array([8, 9, 10]).buffer;

      const mockObject: Partial<R2ObjectBody> = {
        arrayBuffer: vi.fn().mockResolvedValue(testData),
      };
      (mockBucket.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockObject);

      const result = await adapter.getRange('test.bin', -3, 3);

      expect(mockBucket.get).toHaveBeenCalledWith('test.bin', {
        range: { suffix: 3 },
      });
      expect(result).toBe(testData);
    });

    it('should throw error when object not found', async () => {
      const adapter = new R2StorageAdapter(mockBucket);
      (mockBucket.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(adapter.getRange('missing.bin', 0, 10)).rejects.toThrow(
        /Object not found/
      );
    });
  });

  describe('list', () => {
    it('should list objects with prefix', async () => {
      const adapter = new R2StorageAdapter(mockBucket);

      const mockResult: R2Objects = {
        objects: [
          { key: 'data/file1.bin' } as R2Object,
          { key: 'data/file2.bin' } as R2Object,
        ],
        truncated: false,
        delimitedPrefixes: [],
      };
      (mockBucket.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const result = await adapter.list('data/');

      expect(result).toEqual(['data/file1.bin', 'data/file2.bin']);
    });

    it('should handle pagination for large lists', async () => {
      const adapter = new R2StorageAdapter(mockBucket);

      const mockResult1: R2Objects = {
        objects: [{ key: 'file1.bin' } as R2Object],
        truncated: true,
        cursor: 'cursor1',
        delimitedPrefixes: [],
      };
      const mockResult2: R2Objects = {
        objects: [{ key: 'file2.bin' } as R2Object],
        truncated: false,
        delimitedPrefixes: [],
      };

      (mockBucket.list as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResult1)
        .mockResolvedValueOnce(mockResult2);

      const result = await adapter.list('');

      expect(result).toEqual(['file1.bin', 'file2.bin']);
      expect(mockBucket.list).toHaveBeenCalledTimes(2);
    });

    it('should strip key prefix from results', async () => {
      const adapter = new R2StorageAdapter(mockBucket, 'prefix');

      const mockResult: R2Objects = {
        objects: [
          { key: 'prefix/file1.bin' } as R2Object,
          { key: 'prefix/file2.bin' } as R2Object,
        ],
        truncated: false,
        delimitedPrefixes: [],
      };
      (mockBucket.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const result = await adapter.list('');

      expect(result).toEqual(['file1.bin', 'file2.bin']);
    });
  });

  describe('exists', () => {
    it('should return true when object exists', async () => {
      const adapter = new R2StorageAdapter(mockBucket);
      (mockBucket.head as ReturnType<typeof vi.fn>).mockResolvedValue({} as R2Object);

      const result = await adapter.exists('test.bin');
      expect(result).toBe(true);
    });

    it('should return false when object does not exist', async () => {
      const adapter = new R2StorageAdapter(mockBucket);
      (mockBucket.head as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await adapter.exists('missing.bin');
      expect(result).toBe(false);
    });
  });

  describe('head', () => {
    it('should return metadata for existing object', async () => {
      const adapter = new R2StorageAdapter(mockBucket);
      const uploadDate = new Date('2024-01-15');

      const mockObject: Partial<R2Object> = {
        size: 1024,
        etag: 'abc123',
        uploaded: uploadDate,
      };
      (mockBucket.head as ReturnType<typeof vi.fn>).mockResolvedValue(mockObject);

      const result = await adapter.head('test.bin');

      expect(result).toEqual({
        size: 1024,
        etag: 'abc123',
        lastModified: uploadDate,
      });
    });

    it('should return null for missing object', async () => {
      const adapter = new R2StorageAdapter(mockBucket);
      (mockBucket.head as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await adapter.head('missing.bin');
      expect(result).toBeNull();
    });
  });

  describe('getBatchRanges', () => {
    it('should read multiple ranges in parallel', async () => {
      const adapter = new R2StorageAdapter(mockBucket);

      const mockData1 = new Uint8Array([1, 2]).buffer;
      const mockData2 = new Uint8Array([3, 4]).buffer;

      (mockBucket.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ arrayBuffer: () => Promise.resolve(mockData1) })
        .mockResolvedValueOnce({ arrayBuffer: () => Promise.resolve(mockData2) });

      const ranges = [
        { offset: 0, length: 2 },
        { offset: 10, length: 2 },
      ];

      const results = await adapter.getBatchRanges('test.bin', ranges);

      expect(results).toHaveLength(2);
      expect(results[0]).toBe(mockData1);
      expect(results[1]).toBe(mockData2);
    });
  });

  describe('getBatch', () => {
    it('should read multiple keys in parallel', async () => {
      const adapter = new R2StorageAdapter(mockBucket);

      const mockData1 = new Uint8Array([1, 2]).buffer;
      const mockData2 = new Uint8Array([3, 4]).buffer;

      (mockBucket.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ arrayBuffer: () => Promise.resolve(mockData1) })
        .mockResolvedValueOnce(null);

      const results = await adapter.getBatch(['file1.bin', 'missing.bin']);

      expect(results).toHaveLength(2);
      expect(results[0]).toBe(mockData1);
      expect(results[1]).toBeNull();
    });
  });
});

// ==========================================
// Memory Storage Adapter Tests
// ==========================================

describe('MemoryStorageAdapter', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  describe('putString', () => {
    it('should store string data', async () => {
      storage.putString('test.txt', 'hello world');

      const result = await storage.get('test.txt');
      expect(result).not.toBeNull();
      expect(new TextDecoder().decode(new Uint8Array(result!))).toBe('hello world');
    });
  });

  describe('clear', () => {
    it('should clear all stored data', async () => {
      storage.put('file1.bin', new ArrayBuffer(10));
      storage.put('file2.bin', new ArrayBuffer(20));

      expect(storage.size).toBe(2);

      storage.clear();

      expect(storage.size).toBe(0);
      expect(await storage.get('file1.bin')).toBeNull();
    });
  });

  describe('getRange with edge cases', () => {
    it('should handle negative offset correctly', async () => {
      const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer;
      storage.put('test.bin', data);

      const result = await storage.getRange('test.bin', -5, 3);
      expect(new Uint8Array(result)).toEqual(new Uint8Array([5, 6, 7]));
    });

    it('should throw error for missing file', async () => {
      await expect(storage.getRange('missing.bin', 0, 10)).rejects.toThrow(
        /Object not found/
      );
    });
  });

  describe('list sorting', () => {
    it('should return keys in sorted order', async () => {
      storage.put('c.bin', new ArrayBuffer(1));
      storage.put('a.bin', new ArrayBuffer(1));
      storage.put('b.bin', new ArrayBuffer(1));

      const result = await storage.list('');
      expect(result).toEqual(['a.bin', 'b.bin', 'c.bin']);
    });
  });
});

// ==========================================
// Fetch Storage Adapter Tests
// ==========================================

describe('FetchStorageAdapter', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should strip trailing slashes from base URL', () => {
      const adapter = new FetchStorageAdapter('https://example.com///');
      expect(adapter).toBeDefined();
    });
  });

  describe('get', () => {
    it('should return ArrayBuffer for successful request', async () => {
      const adapter = new FetchStorageAdapter('https://example.com');
      const testData = new Uint8Array([1, 2, 3]).buffer;

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(testData),
      });

      const result = await adapter.get('test.bin');
      expect(result).toBe(testData);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/test.bin', {
        headers: {},
      });
    });

    it('should return null for 404 response', async () => {
      const adapter = new FetchStorageAdapter('https://example.com');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await adapter.get('missing.bin');
      expect(result).toBeNull();
    });

    it('should throw error for other HTTP errors', async () => {
      const adapter = new FetchStorageAdapter('https://example.com');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(adapter.get('test.bin')).rejects.toThrow(/Failed to fetch/);
    });

    it('should include custom headers', async () => {
      const adapter = new FetchStorageAdapter('https://example.com', {
        'Authorization': 'Bearer token123',
      });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      await adapter.get('test.bin');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'Authorization': 'Bearer token123' },
        })
      );
    });
  });

  describe('getRange', () => {
    it('should set Range header for positive offset', async () => {
      const adapter = new FetchStorageAdapter('https://example.com');
      const testData = new Uint8Array([3, 4, 5]).buffer;

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 206,
        arrayBuffer: () => Promise.resolve(testData),
      });

      await adapter.getRange('test.bin', 2, 3);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/test.bin',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Range': 'bytes=2-4',
          }),
        })
      );
    });

    it('should set suffix Range header for negative offset', async () => {
      const adapter = new FetchStorageAdapter('https://example.com');
      const testData = new Uint8Array([8, 9, 10]).buffer;

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 206,
        arrayBuffer: () => Promise.resolve(testData),
      });

      await adapter.getRange('test.bin', -3, 3);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/test.bin',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Range': 'bytes=-3',
          }),
        })
      );
    });

    it('should throw error for 404 response', async () => {
      const adapter = new FetchStorageAdapter('https://example.com');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(adapter.getRange('missing.bin', 0, 10)).rejects.toThrow(
        /Object not found/
      );
    });

    it('should throw error for other HTTP errors', async () => {
      const adapter = new FetchStorageAdapter('https://example.com');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(adapter.getRange('test.bin', 0, 10)).rejects.toThrow(
        /Failed to fetch range/
      );
    });
  });

  describe('list', () => {
    it('should throw not implemented error', async () => {
      const adapter = new FetchStorageAdapter('https://example.com');

      await expect(adapter.list('prefix')).rejects.toThrow(/not implemented/);
    });
  });

  describe('exists', () => {
    it('should return true for OK response', async () => {
      const adapter = new FetchStorageAdapter('https://example.com');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await adapter.exists('test.bin');
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/test.bin',
        expect.objectContaining({ method: 'HEAD' })
      );
    });

    it('should return false for 404 response', async () => {
      const adapter = new FetchStorageAdapter('https://example.com');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await adapter.exists('missing.bin');
      expect(result).toBe(false);
    });
  });
});

// ==========================================
// Caching Storage Adapter Tests
// ==========================================

describe('CachingStorageAdapter', () => {
  describe('getRange from uncached data', () => {
    it('should fetch range directly when not cached', async () => {
      const inner = new MemoryStorageAdapter();
      const data = new Uint8Array([0, 1, 2, 3, 4, 5]).buffer;
      inner.put('test.bin', data);

      const caching = new CachingStorageAdapter(inner, 1024);

      // Don't cache full object first, fetch range directly
      const range = await caching.getRange('test.bin', 2, 3);
      expect(new Uint8Array(range)).toEqual(new Uint8Array([2, 3, 4]));
    });

    it('should handle negative offset in cached data', async () => {
      const inner = new MemoryStorageAdapter();
      const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer;
      inner.put('test.bin', data);

      const caching = new CachingStorageAdapter(inner, 1024);

      // Cache the full object first
      await caching.get('test.bin');

      // Now request from end
      const range = await caching.getRange('test.bin', -3, 3);
      expect(new Uint8Array(range)).toEqual(new Uint8Array([7, 8, 9]));
    });
  });

  describe('list passthrough', () => {
    it('should pass through list to inner storage', async () => {
      const inner = new MemoryStorageAdapter();
      inner.put('prefix/file1.bin', new ArrayBuffer(1));
      inner.put('prefix/file2.bin', new ArrayBuffer(1));

      const caching = new CachingStorageAdapter(inner, 1024);
      const result = await caching.list('prefix/');

      expect(result).toEqual(['prefix/file1.bin', 'prefix/file2.bin']);
    });
  });

  describe('exists with fallback', () => {
    it('should check cache first then storage', async () => {
      const inner = new MemoryStorageAdapter();
      inner.put('test.bin', new ArrayBuffer(10));

      const caching = new CachingStorageAdapter(inner, 1024);

      // First exists check - not in cache, checks inner
      const exists1 = await caching.exists('test.bin');
      expect(exists1).toBe(true);

      // Cache it
      await caching.get('test.bin');

      // Second exists check - in cache
      const exists2 = await caching.exists('test.bin');
      expect(exists2).toBe(true);
    });

    it('should return false when inner storage has no exists method', async () => {
      // Create an adapter without exists method
      const inner: any = {
        get: vi.fn().mockResolvedValue(null),
        getRange: vi.fn(),
        list: vi.fn(),
        // No exists method
      };

      const caching = new CachingStorageAdapter(inner, 1024);
      const exists = await caching.exists('missing.bin');

      expect(exists).toBe(false);
      expect(inner.get).toHaveBeenCalledWith('missing.bin');
    });
  });

  describe('cache eviction', () => {
    it('should skip caching items larger than max cache size', async () => {
      const inner = new MemoryStorageAdapter();
      // Create data larger than cache
      inner.put('large.bin', new ArrayBuffer(100));

      // Cache only holds 50 bytes
      const caching = new CachingStorageAdapter(inner, 50);

      await caching.get('large.bin');

      const stats = caching.getCacheStats();
      expect(stats.entries).toBe(0);
      expect(stats.size).toBe(0);
    });
  });

  describe('clearCache', () => {
    it('should clear cache and reset size', async () => {
      const inner = new MemoryStorageAdapter();
      inner.put('test.bin', new ArrayBuffer(10));

      const caching = new CachingStorageAdapter(inner, 1024);
      await caching.get('test.bin');

      expect(caching.getCacheStats().entries).toBe(1);

      caching.clearCache();

      const stats = caching.getCacheStats();
      expect(stats.entries).toBe(0);
      expect(stats.size).toBe(0);
    });
  });
});

// ==========================================
// Core Storage Adapter Bridge Tests
// ==========================================

describe('createLanceStorageAdapter', () => {
  it('should adapt core Storage interface for get', async () => {
    const coreStorage = {
      read: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      list: vi.fn().mockResolvedValue({ paths: [] }),
    };

    const adapter = createLanceStorageAdapter(coreStorage);
    const result = await adapter.get('test.bin');

    expect(result).not.toBeNull();
    expect(new Uint8Array(result!)).toEqual(new Uint8Array([1, 2, 3]));
    expect(coreStorage.read).toHaveBeenCalledWith('test.bin');
  });

  it('should return null for missing file', async () => {
    const coreStorage = {
      read: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue({ paths: [] }),
    };

    const adapter = createLanceStorageAdapter(coreStorage);
    const result = await adapter.get('missing.bin');

    expect(result).toBeNull();
  });

  it('should adapt core Storage interface for getRange with readRange', async () => {
    const coreStorage = {
      read: vi.fn(),
      readRange: vi.fn().mockResolvedValue(new Uint8Array([3, 4, 5])),
      list: vi.fn().mockResolvedValue({ paths: [] }),
    };

    const adapter = createLanceStorageAdapter(coreStorage);
    const result = await adapter.getRange('test.bin', 2, 3);

    expect(new Uint8Array(result)).toEqual(new Uint8Array([3, 4, 5]));
    expect(coreStorage.readRange).toHaveBeenCalledWith('test.bin', 2, 3);
  });

  it('should fallback to read+slice when readRange not available', async () => {
    const fullData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const coreStorage = {
      read: vi.fn().mockResolvedValue(fullData),
      list: vi.fn().mockResolvedValue({ paths: [] }),
      // No readRange method
    };

    const adapter = createLanceStorageAdapter(coreStorage);
    const result = await adapter.getRange('test.bin', 2, 3);

    expect(new Uint8Array(result)).toEqual(new Uint8Array([2, 3, 4]));
  });

  it('should handle negative offset in fallback mode', async () => {
    const fullData = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const coreStorage = {
      read: vi.fn().mockResolvedValue(fullData),
      list: vi.fn().mockResolvedValue({ paths: [] }),
    };

    const adapter = createLanceStorageAdapter(coreStorage);
    const result = await adapter.getRange('test.bin', -3, 3);

    expect(new Uint8Array(result)).toEqual(new Uint8Array([7, 8, 9]));
  });

  it('should throw error when file not found in getRange fallback', async () => {
    const coreStorage = {
      read: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue({ paths: [] }),
    };

    const adapter = createLanceStorageAdapter(coreStorage);

    await expect(adapter.getRange('missing.bin', 0, 10)).rejects.toThrow(
      /Object not found/
    );
  });

  it('should adapt core Storage interface for list', async () => {
    const coreStorage = {
      read: vi.fn(),
      list: vi.fn().mockResolvedValue({ paths: ['file1.bin', 'file2.bin'] }),
    };

    const adapter = createLanceStorageAdapter(coreStorage);
    const result = await adapter.list('prefix/');

    expect(result).toEqual(['file1.bin', 'file2.bin']);
    expect(coreStorage.list).toHaveBeenCalledWith('prefix/');
  });

  it('should adapt core Storage interface for exists when available', async () => {
    const coreStorage = {
      read: vi.fn(),
      exists: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue({ paths: [] }),
    };

    const adapter = createLanceStorageAdapter(coreStorage);
    const result = await adapter.exists!('test.bin');

    expect(result).toBe(true);
    expect(coreStorage.exists).toHaveBeenCalledWith('test.bin');
  });

  it('should fallback to read for exists when not available', async () => {
    const coreStorage = {
      read: vi.fn().mockResolvedValue(new Uint8Array([1])),
      list: vi.fn().mockResolvedValue({ paths: [] }),
      // No exists method
    };

    const adapter = createLanceStorageAdapter(coreStorage);
    const result = await adapter.exists!('test.bin');

    expect(result).toBe(true);
    expect(coreStorage.read).toHaveBeenCalledWith('test.bin');
  });

  it('should return false from exists when file not found', async () => {
    const coreStorage = {
      read: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue({ paths: [] }),
    };

    const adapter = createLanceStorageAdapter(coreStorage);
    const result = await adapter.exists!('missing.bin');

    expect(result).toBe(false);
  });
});
