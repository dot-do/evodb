/**
 * @evodb/reader - Cache Error Handling Tests
 * TDD RED Phase: Tests for proper error handling in cache operations
 *
 * Issue: pocs-ge9k - Swallowed exceptions in cache ops
 * Problem: Legitimate errors (permission denied, quota exceeded) are
 * indistinguishable from cache-not-available. No logging for debugging.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CacheTier } from '../cache.js';
import type { R2Bucket, R2Object } from '../types.js';

// ============================================================================
// Mock Setup
// ============================================================================

function createMockR2Object(key: string, data: ArrayBuffer): R2Object {
  return {
    key,
    size: data.byteLength,
    etag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
    httpEtag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
    uploaded: new Date(),
    customMetadata: {},
    arrayBuffer: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(new TextDecoder().decode(data)),
    json: vi.fn().mockResolvedValue(JSON.parse(new TextDecoder().decode(data))),
  };
}

function createMockR2Bucket(objects: Map<string, ArrayBuffer>): R2Bucket {
  return {
    get: vi.fn(async (key: string) => {
      const data = objects.get(key);
      if (!data) return null;
      return createMockR2Object(key, data);
    }),
    head: vi.fn(async (key: string) => {
      const data = objects.get(key);
      if (!data) return null;
      return createMockR2Object(key, data);
    }),
    list: vi.fn(async () => ({
      objects: [],
      truncated: false,
      cursor: undefined,
    })),
  };
}

// Mock Cache API
interface MockCacheStorage {
  open: ReturnType<typeof vi.fn>;
}

interface MockCache {
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

// Store reference to mocked global caches
let mockCaches: MockCacheStorage;
let mockCache: MockCache;

function setupCacheMock() {
  mockCache = {
    match: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  mockCaches = {
    open: vi.fn().mockResolvedValue(mockCache),
  };

  // @ts-expect-error - mocking global
  globalThis.caches = mockCaches;
}

function removeCacheMock() {
  // @ts-expect-error - cleaning up mock
  delete globalThis.caches;
}

// ============================================================================
// CacheResult Type Tests
// ============================================================================

describe('CacheResult Type', () => {
  beforeEach(() => {
    setupCacheMock();
  });

  afterEach(() => {
    removeCacheMock();
    vi.clearAllMocks();
  });

  it('should return status "hit" with data on cache hit', async () => {
    const testData = new TextEncoder().encode('test data').buffer;
    const mockResponse = new Response(testData);
    mockCache.match.mockResolvedValue(mockResponse);

    const cache = new CacheTier();
    const result = await cache.getWithStatus('test-key');

    expect(result.status).toBe('hit');
    expect(result).toHaveProperty('data');
    if (result.status === 'hit') {
      expect(result.data).toBeInstanceOf(ArrayBuffer);
    }
  });

  it('should return status "miss" when no cache entry exists', async () => {
    mockCache.match.mockResolvedValue(null);

    const cache = new CacheTier();
    const result = await cache.getWithStatus('test-key');

    expect(result.status).toBe('miss');
    expect(result).not.toHaveProperty('data');
    expect(result).not.toHaveProperty('error');
  });

  it('should return status "error" with error details on cache failure', async () => {
    const permissionError = new Error('Permission denied');
    permissionError.name = 'NotAllowedError';
    mockCaches.open.mockRejectedValue(permissionError);

    const cache = new CacheTier();
    const result = await cache.getWithStatus('test-key');

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Permission denied');
    }
  });

  it('should distinguish between miss and cache-not-available', async () => {
    // First test: Cache API returns null (miss)
    mockCache.match.mockResolvedValue(null);

    const cache = new CacheTier();
    const missResult = await cache.getWithStatus('test-key');
    expect(missResult.status).toBe('miss');

    // Second test: Cache API throws (error/not available)
    mockCaches.open.mockRejectedValue(new Error('Cache API not available'));

    const errorResult = await cache.getWithStatus('another-key');
    expect(errorResult.status).toBe('error');
  });
});

// ============================================================================
// Error Categorization Tests
// ============================================================================

describe('Cache Error Categorization', () => {
  beforeEach(() => {
    setupCacheMock();
  });

  afterEach(() => {
    removeCacheMock();
    vi.clearAllMocks();
  });

  it('should categorize NotAllowedError as permission error', async () => {
    const error = new Error('Permission denied');
    error.name = 'NotAllowedError';
    mockCaches.open.mockRejectedValue(error);

    const cache = new CacheTier();
    const result = await cache.getWithStatus('test-key');

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.errorType).toBe('permission');
    }
  });

  it('should categorize QuotaExceededError as quota error', async () => {
    const error = new Error('Quota exceeded');
    error.name = 'QuotaExceededError';
    mockCache.match.mockResolvedValue(null);
    mockCache.put.mockRejectedValue(error);

    const cache = new CacheTier();
    const putResult = await cache.putWithStatus(
      'test-key',
      new ArrayBuffer(100),
      { etag: '"test"', httpEtag: '"test"' } as R2Object
    );

    expect(putResult.status).toBe('error');
    if (putResult.status === 'error') {
      expect(putResult.errorType).toBe('quota');
    }
  });

  it('should categorize network timeout as network error', async () => {
    const error = new Error('Network timeout');
    error.name = 'TimeoutError';
    mockCaches.open.mockRejectedValue(error);

    const cache = new CacheTier();
    const result = await cache.getWithStatus('test-key');

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.errorType).toBe('network');
    }
  });

  it('should categorize ReferenceError as unavailable', async () => {
    // Simulate Cache API not being available (e.g., in non-worker context)
    const error = new ReferenceError('caches is not defined');
    mockCaches.open.mockRejectedValue(error);

    const cache = new CacheTier();
    const result = await cache.getWithStatus('test-key');

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.errorType).toBe('unavailable');
    }
  });

  it('should categorize unknown errors appropriately', async () => {
    const error = new Error('Unknown error occurred');
    mockCaches.open.mockRejectedValue(error);

    const cache = new CacheTier();
    const result = await cache.getWithStatus('test-key');

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.errorType).toBe('unknown');
    }
  });
});

// ============================================================================
// Logging Tests
// ============================================================================

describe('Cache Error Logging', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setupCacheMock();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    removeCacheMock();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('should log warning when Cache API is not available', async () => {
    const error = new ReferenceError('caches is not defined');
    mockCaches.open.mockRejectedValue(error);

    const cache = new CacheTier();
    await cache.getWithStatus('test-key');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache API'),
      expect.anything()
    );
  });

  it('should log error with details for permission errors', async () => {
    const error = new Error('Permission denied');
    error.name = 'NotAllowedError';
    mockCaches.open.mockRejectedValue(error);

    const cache = new CacheTier();
    await cache.getWithStatus('test-key');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('permission'),
      expect.objectContaining({
        key: expect.any(String),
        error: expect.any(String),
      })
    );
  });

  it('should log error with details for quota exceeded', async () => {
    const error = new Error('Quota exceeded');
    error.name = 'QuotaExceededError';
    mockCache.put.mockRejectedValue(error);

    const cache = new CacheTier();
    await cache.putWithStatus(
      'test-key',
      new ArrayBuffer(100),
      { etag: '"test"', httpEtag: '"test"' } as R2Object
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('quota'),
      expect.objectContaining({
        key: expect.any(String),
        error: expect.any(String),
      })
    );
  });

  it('should not log on cache miss (expected behavior)', async () => {
    mockCache.match.mockResolvedValue(null);

    const cache = new CacheTier();
    await cache.getWithStatus('test-key');

    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should not log on successful cache hit', async () => {
    const testData = new TextEncoder().encode('test data').buffer;
    mockCache.match.mockResolvedValue(new Response(testData));

    const cache = new CacheTier();
    await cache.getWithStatus('test-key');

    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should include operation context in log messages', async () => {
    const error = new Error('Network timeout');
    error.name = 'TimeoutError';
    mockCaches.open.mockRejectedValue(error);

    const cache = new CacheTier();
    await cache.getWithStatus('my-data-key');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        operation: 'get',
        key: expect.stringContaining('my-data-key'),
      })
    );
  });
});

// ============================================================================
// Error Metrics Tests
// ============================================================================

describe('Cache Error Metrics', () => {
  beforeEach(() => {
    setupCacheMock();
  });

  afterEach(() => {
    removeCacheMock();
    vi.clearAllMocks();
  });

  it('should track cache error count', async () => {
    const error = new Error('Cache error');
    mockCaches.open.mockRejectedValue(error);

    const cache = new CacheTier();
    await cache.getWithStatus('key-1');
    await cache.getWithStatus('key-2');

    const stats = cache.getStats();
    expect(stats.errors).toBe(2);
  });

  it('should track errors by type', async () => {
    const permError = new Error('Permission denied');
    permError.name = 'NotAllowedError';

    const quotaError = new Error('Quota exceeded');
    quotaError.name = 'QuotaExceededError';

    const cache = new CacheTier();

    mockCaches.open.mockRejectedValueOnce(permError);
    await cache.getWithStatus('key-1');

    mockCaches.open.mockResolvedValue(mockCache);
    mockCache.put.mockRejectedValueOnce(quotaError);
    await cache.putWithStatus('key-2', new ArrayBuffer(10), { etag: '"test"' } as R2Object);

    const errorStats = cache.getErrorStats();
    expect(errorStats.permission).toBe(1);
    expect(errorStats.quota).toBe(1);
  });

  it('should reset error stats along with other stats', () => {
    const cache = new CacheTier();
    // Manually set some stats for testing reset
    cache.resetStats();

    const stats = cache.getStats();
    expect(stats.errors).toBe(0);

    const errorStats = cache.getErrorStats();
    expect(errorStats.permission).toBe(0);
    expect(errorStats.quota).toBe(0);
    expect(errorStats.network).toBe(0);
    expect(errorStats.unavailable).toBe(0);
    expect(errorStats.unknown).toBe(0);
  });
});

// ============================================================================
// Error Callback Tests
// ============================================================================

describe('Cache Error Callback', () => {
  beforeEach(() => {
    setupCacheMock();
  });

  afterEach(() => {
    removeCacheMock();
    vi.clearAllMocks();
  });

  it('should call error callback on cache error', async () => {
    const onError = vi.fn();
    const error = new Error('Cache error');
    mockCaches.open.mockRejectedValue(error);

    const cache = new CacheTier({ onError });
    await cache.getWithStatus('test-key');

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'get',
        key: expect.any(String),
        error: expect.any(Error),
        errorType: expect.any(String),
      })
    );
  });

  it('should not call error callback on cache miss', async () => {
    const onError = vi.fn();
    mockCache.match.mockResolvedValue(null);

    const cache = new CacheTier({ onError });
    await cache.getWithStatus('test-key');

    expect(onError).not.toHaveBeenCalled();
  });

  it('should not call error callback on cache hit', async () => {
    const onError = vi.fn();
    const testData = new TextEncoder().encode('test data').buffer;
    mockCache.match.mockResolvedValue(new Response(testData));

    const cache = new CacheTier({ onError });
    await cache.getWithStatus('test-key');

    expect(onError).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Backward Compatibility Tests
// ============================================================================

describe('Backward Compatibility', () => {
  beforeEach(() => {
    setupCacheMock();
  });

  afterEach(() => {
    removeCacheMock();
    vi.clearAllMocks();
  });

  it('should maintain existing get() behavior - return data on hit', async () => {
    const testData = new TextEncoder().encode('{"key": "value"}').buffer;
    const bucket = createMockR2Bucket(new Map([['test-key', testData]]));
    mockCache.match.mockResolvedValue(new Response(testData));

    const cache = new CacheTier();
    const result = await cache.get(bucket, 'test-key');

    expect(result.data).toBeInstanceOf(ArrayBuffer);
    expect(result.fromCache).toBe(true);
  });

  it('should maintain existing get() behavior - fallback to R2 on miss', async () => {
    const testData = new TextEncoder().encode('{"key": "value"}').buffer;
    const bucket = createMockR2Bucket(new Map([['test-key', testData]]));
    mockCache.match.mockResolvedValue(null);
    mockCache.put.mockResolvedValue(undefined);

    const cache = new CacheTier();
    const result = await cache.get(bucket, 'test-key');

    expect(result.data).toBeInstanceOf(ArrayBuffer);
    expect(result.fromCache).toBe(false);
  });

  it('should maintain existing get() behavior - fallback to R2 on error', async () => {
    const testData = new TextEncoder().encode('{"key": "value"}').buffer;
    const bucket = createMockR2Bucket(new Map([['test-key', testData]]));
    mockCaches.open.mockRejectedValue(new Error('Cache error'));

    const cache = new CacheTier();
    const result = await cache.get(bucket, 'test-key');

    // Should still return data from R2, despite cache error
    expect(result.data).toBeInstanceOf(ArrayBuffer);
    expect(result.fromCache).toBe(false);
  });

  it('should maintain existing invalidate() behavior - return boolean', async () => {
    mockCache.delete.mockResolvedValue(true);

    const cache = new CacheTier();
    const result = await cache.invalidate('test-key');

    expect(typeof result).toBe('boolean');
    expect(result).toBe(true);
  });
});

// ============================================================================
// putToCache Error Handling Tests
// ============================================================================

describe('putToCache Error Handling', () => {
  beforeEach(() => {
    setupCacheMock();
  });

  afterEach(() => {
    removeCacheMock();
    vi.clearAllMocks();
  });

  it('should return error result for quota exceeded during put', async () => {
    const error = new Error('Quota exceeded');
    error.name = 'QuotaExceededError';
    mockCache.put.mockRejectedValue(error);

    const cache = new CacheTier();
    const result = await cache.putWithStatus(
      'test-key',
      new ArrayBuffer(100),
      { etag: '"test"', httpEtag: '"test"' } as R2Object
    );

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.errorType).toBe('quota');
    }
  });

  it('should return success result on successful put', async () => {
    mockCache.put.mockResolvedValue(undefined);

    const cache = new CacheTier();
    const result = await cache.putWithStatus(
      'test-key',
      new ArrayBuffer(100),
      { etag: '"test"', httpEtag: '"test"' } as R2Object
    );

    expect(result.status).toBe('success');
  });
});

// ============================================================================
// invalidate Error Handling Tests
// ============================================================================

describe('invalidate Error Handling', () => {
  beforeEach(() => {
    setupCacheMock();
  });

  afterEach(() => {
    removeCacheMock();
    vi.clearAllMocks();
  });

  it('should return error result when invalidate fails', async () => {
    const error = new Error('Delete failed');
    mockCache.delete.mockRejectedValue(error);

    const cache = new CacheTier();
    const result = await cache.invalidateWithStatus('test-key');

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toBeDefined();
    }
  });

  it('should return success with deleted=true when entry was deleted', async () => {
    mockCache.delete.mockResolvedValue(true);

    const cache = new CacheTier();
    const result = await cache.invalidateWithStatus('test-key');

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.deleted).toBe(true);
    }
  });

  it('should return success with deleted=false when entry did not exist', async () => {
    mockCache.delete.mockResolvedValue(false);

    const cache = new CacheTier();
    const result = await cache.invalidateWithStatus('test-key');

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.deleted).toBe(false);
    }
  });
});
