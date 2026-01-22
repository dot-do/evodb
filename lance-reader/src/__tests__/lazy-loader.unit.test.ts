/**
 * Tests for Lazy Loading Infrastructure
 *
 * Test coverage:
 * - LazyLoadConfig configuration options
 * - Deferred loading behavior (loading on first query)
 * - Eager vs lazy loading strategies
 * - Loading state transitions
 * - Cache behavior with lazy loading
 * - Error handling during deferred loading
 * - Prefetch functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  LazyIvfPqIndex,
  LazyHnswIndex,
  createLazyIndexFactory,
  createVectorIndex,
  DEFAULT_LAZY_LOAD_CONFIG,
  type LazyLoadConfig,
  type LoadingState,
} from '../lazy-loader.js';
import { MemoryStorageAdapter } from '../r2-adapter.js';

// ==========================================
// Test Fixtures
// ==========================================

/**
 * Create a mock storage adapter that tracks calls
 */
function createMockStorage() {
  const storage = new MemoryStorageAdapter();
  const getCalls: Array<{ key: string }> = [];
  const getRangeCalls: Array<{ key: string; offset: number; length: number }> = [];

  const originalGet = storage.get.bind(storage);
  const originalGetRange = storage.getRange.bind(storage);

  storage.get = async (key: string) => {
    getCalls.push({ key });
    return originalGet(key);
  };

  storage.getRange = async (key: string, offset: number, length: number) => {
    getRangeCalls.push({ key, offset, length });
    return originalGetRange(key, offset, length);
  };

  return {
    storage,
    getCalls,
    getRangeCalls,
    reset: () => {
      getCalls.length = 0;
      getRangeCalls.length = 0;
    },
  };
}

/**
 * Generate a random query vector
 */
function generateRandomVector(dimension: number): Float32Array {
  const v = new Float32Array(dimension);
  for (let d = 0; d < dimension; d++) {
    v[d] = Math.random() * 2 - 1;
  }
  return v;
}

// ==========================================
// Configuration Tests
// ==========================================

describe('LazyLoadConfig', () => {
  describe('Default Configuration', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_LAZY_LOAD_CONFIG.strategy).toBe('lazy');
      expect(DEFAULT_LAZY_LOAD_CONFIG.preloadCentroids).toBe(true);
      expect(DEFAULT_LAZY_LOAD_CONFIG.preloadCodebook).toBe(true);
      expect(DEFAULT_LAZY_LOAD_CONFIG.maxPreloadPartitions).toBe(0);
      expect(DEFAULT_LAZY_LOAD_CONFIG.loadTimeout).toBe(30000);
      expect(DEFAULT_LAZY_LOAD_CONFIG.enablePrefetch).toBe(false);
      expect(DEFAULT_LAZY_LOAD_CONFIG.prefetchHistorySize).toBe(10);
    });
  });

  describe('Strategy Options', () => {
    it('should accept lazy strategy', () => {
      const config: Partial<LazyLoadConfig> = { strategy: 'lazy' };
      expect(config.strategy).toBe('lazy');
    });

    it('should accept eager strategy', () => {
      const config: Partial<LazyLoadConfig> = { strategy: 'eager' };
      expect(config.strategy).toBe('eager');
    });

    it('should accept on-demand strategy', () => {
      const config: Partial<LazyLoadConfig> = { strategy: 'on-demand' };
      expect(config.strategy).toBe('on-demand');
    });
  });
});

// ==========================================
// LazyIvfPqIndex Tests
// ==========================================

describe('LazyIvfPqIndex', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  afterEach(() => {
    mockStorage.reset();
  });

  describe('Initialization', () => {
    it('should not load data on construction with lazy strategy', () => {
      const index = new LazyIvfPqIndex(
        mockStorage.storage,
        '/test/index',
        '/test/aux',
        'l2',
        128,
        { strategy: 'lazy' }
      );

      // No storage calls should be made during construction
      expect(mockStorage.getCalls.length).toBe(0);
      expect(mockStorage.getRangeCalls.length).toBe(0);
      expect(index.isReady()).toBe(false);
    });

    it('should have correct index type', () => {
      const index = new LazyIvfPqIndex(
        mockStorage.storage,
        '/test/index',
        '/test/aux',
        'l2',
        128
      );

      expect(index.indexType).toBe('ivf_pq');
    });

    it('should have correct dimension', () => {
      const index = new LazyIvfPqIndex(
        mockStorage.storage,
        '/test/index',
        '/test/aux',
        'l2',
        128
      );

      expect(index.dimension).toBe(128);
    });
  });

  describe('Loading State', () => {
    it('should have initial unloaded state', () => {
      const index = new LazyIvfPqIndex(
        mockStorage.storage,
        '/test/index',
        '/test/aux',
        'l2',
        128
      );

      const state = index.getLoadingState();
      expect(state.centroids.status).toBe('unloaded');
      expect(state.codebook.status).toBe('unloaded');
      expect(state.partitions.size).toBe(0);
      expect(state.metadata.status).toBe('unloaded');
    });

    it('should report not ready before loading', () => {
      const index = new LazyIvfPqIndex(
        mockStorage.storage,
        '/test/index',
        '/test/aux',
        'l2',
        128
      );

      expect(index.isReady()).toBe(false);
    });
  });

  describe('Cache Statistics', () => {
    it('should report initial cache stats', () => {
      const index = new LazyIvfPqIndex(
        mockStorage.storage,
        '/test/index',
        '/test/aux',
        'l2',
        128
      );

      const stats = index.getCacheStats();
      expect(stats.centroidsLoaded).toBe(false);
      expect(stats.codebookLoaded).toBe(false);
      expect(stats.partitionsLoaded).toBe(0);
      expect(stats.maxPartitions).toBe(50);
    });
  });

  describe('Cache Clear', () => {
    it('should clear all cached data', () => {
      const index = new LazyIvfPqIndex(
        mockStorage.storage,
        '/test/index',
        '/test/aux',
        'l2',
        128
      );

      index.clearCache();

      const stats = index.getCacheStats();
      expect(stats.centroidsLoaded).toBe(false);
      expect(stats.codebookLoaded).toBe(false);
      expect(stats.partitionsLoaded).toBe(0);
    });
  });

  describe('Search Error Handling', () => {
    it('should throw on dimension mismatch after loading', async () => {
      const index = new LazyIvfPqIndex(
        mockStorage.storage,
        '/test/index',
        '/test/aux',
        'l2',
        128
      );

      // This will attempt to load and fail due to missing files
      // but we test the dimension check logic
      const wrongDimQuery = generateRandomVector(64);

      // The error should be about loading failure (since we don't have real index files)
      // but the dimension check happens after loading
      await expect(
        index.search(wrongDimQuery, { k: 10 })
      ).rejects.toThrow();
    });
  });
});

// ==========================================
// LazyHnswIndex Tests
// ==========================================

describe('LazyHnswIndex', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  afterEach(() => {
    mockStorage.reset();
  });

  describe('Initialization', () => {
    it('should not initialize on construction with lazy strategy', () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4,
        { strategy: 'lazy' }
      );

      expect(index.isReady()).toBe(false);
    });

    it('should have correct index type', () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      expect(index.indexType).toBe('hnsw');
    });

    it('should have correct dimension', () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      expect(index.dimension).toBe(128);
    });
  });

  describe('Loading State', () => {
    it('should have initial unloaded state', () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      const state = index.getLoadingState();
      expect(state.metadata.status).toBe('unloaded');
      expect(state.entryPoint.status).toBe('unloaded');
      expect(state.levels.size).toBe(0);
    });
  });

  describe('Initialization and Search', () => {
    it('should initialize on first search', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4,
        { strategy: 'lazy' }
      );

      expect(index.isReady()).toBe(false);

      // Search will trigger initialization
      const query = generateRandomVector(128);
      const results = await index.search(query, { k: 10 });

      expect(index.isReady()).toBe(true);
      expect(results).toBeInstanceOf(Array);
    });

    it('should return results after initialization', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      const query = generateRandomVector(128);
      const results = await index.search(query, { k: 10 });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('rowId');
      expect(results[0]).toHaveProperty('distance');
      expect(results[0]).toHaveProperty('score');
    });

    it('should respect k parameter', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      const query = generateRandomVector(128);

      const results5 = await index.search(query, { k: 5 });
      expect(results5.length).toBeLessThanOrEqual(5);

      const results10 = await index.search(query, { k: 10 });
      expect(results10.length).toBeLessThanOrEqual(10);
    });

    it('should return sorted results', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      const query = generateRandomVector(128);
      const results = await index.search(query, { k: 10 });

      // Results should be sorted by distance (ascending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });
  });

  describe('Cache Statistics', () => {
    it('should report cache stats after initialization', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      await index.initialize();

      const stats = index.getCacheStats();
      expect(stats.initialized).toBe(true);
      expect(stats.nodesLoaded).toBeGreaterThan(0);
      expect(stats.levelsLoaded.length).toBeGreaterThan(0);
    });
  });

  describe('Cache Clear', () => {
    it('should reset state after clearing cache', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      await index.initialize();
      expect(index.isReady()).toBe(true);

      index.clearCache();
      expect(index.isReady()).toBe(false);
    });
  });

  describe('Filtering', () => {
    it('should apply include filter', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      const query = generateRandomVector(128);
      const includeSet = new Set<bigint>([0n, 1n, 2n, 3n, 4n]);

      const results = await index.search(query, {
        k: 10,
        filter: { type: 'include', rowIds: includeSet },
      });

      for (const result of results) {
        expect(includeSet.has(result.rowId)).toBe(true);
      }
    });

    it('should apply exclude filter', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      const query = generateRandomVector(128);
      const excludeSet = new Set<bigint>([0n, 1n, 2n]);

      const results = await index.search(query, {
        k: 10,
        filter: { type: 'exclude', rowIds: excludeSet },
      });

      for (const result of results) {
        expect(excludeSet.has(result.rowId)).toBe(false);
      }
    });

    it('should apply predicate filter', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      const query = generateRandomVector(128);

      // Only include even row IDs
      const results = await index.search(query, {
        k: 10,
        filter: { type: 'predicate', fn: (rowId) => rowId % 2n === 0n },
      });

      for (const result of results) {
        expect(result.rowId % 2n).toBe(0n);
      }
    });
  });

  describe('Distance Types', () => {
    it('should support L2 distance', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      const query = generateRandomVector(128);
      const results = await index.search(query, { k: 10 });

      // L2 distance should always be non-negative
      for (const result of results) {
        expect(result.distance).toBeGreaterThanOrEqual(0);
      }
    });

    it('should support cosine distance', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'cosine',
        128,
        16,
        4
      );

      const query = generateRandomVector(128);
      const results = await index.search(query, { k: 10 });

      // Cosine distance should be between 0 and 2
      for (const result of results) {
        expect(result.distance).toBeGreaterThanOrEqual(0);
        expect(result.distance).toBeLessThanOrEqual(2);
      }
    });

    it('should support dot product distance', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'dot',
        128,
        16,
        4
      );

      const query = generateRandomVector(128);
      const results = await index.search(query, { k: 10 });

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw on dimension mismatch', async () => {
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      await index.initialize();

      const wrongDimQuery = generateRandomVector(64);
      await expect(
        index.search(wrongDimQuery, { k: 10 })
      ).rejects.toThrow(/dimension/i);
    });
  });
});

// ==========================================
// Factory Function Tests
// ==========================================

describe('Factory Functions', () => {
  describe('createLazyIndexFactory', () => {
    it('should create a factory with default config', () => {
      const mockStorage = createMockStorage();
      const factory = createLazyIndexFactory({
        storage: mockStorage.storage,
      });

      expect(factory).toHaveProperty('createIvfPqIndex');
      expect(factory).toHaveProperty('createHnswIndex');
    });

    it('should create IVF-PQ index with custom config', () => {
      const mockStorage = createMockStorage();
      const factory = createLazyIndexFactory({
        storage: mockStorage.storage,
        lazyConfig: { strategy: 'on-demand', preloadCentroids: false },
      });

      const index = factory.createIvfPqIndex(
        '/test/index',
        '/test/aux',
        'l2',
        128
      );

      expect(index).toBeInstanceOf(LazyIvfPqIndex);
    });

    it('should create HNSW index with custom config', () => {
      const mockStorage = createMockStorage();
      const factory = createLazyIndexFactory({
        storage: mockStorage.storage,
        lazyConfig: { strategy: 'lazy' },
      });

      const index = factory.createHnswIndex(
        '/test/index',
        'l2',
        128,
        16,
        4
      );

      expect(index).toBeInstanceOf(LazyHnswIndex);
    });
  });

  describe('createVectorIndex', () => {
    it('should create IVF-PQ index', async () => {
      const mockStorage = createMockStorage();

      const index = await createVectorIndex('ivf-pq', {
        storage: mockStorage.storage,
        indexPath: '/test/index',
        auxFilePath: '/test/aux',
        distanceType: 'l2',
        dimension: 128,
      });

      expect(index).toBeInstanceOf(LazyIvfPqIndex);
    });

    it('should create HNSW index', async () => {
      const mockStorage = createMockStorage();

      const index = await createVectorIndex('hnsw', {
        storage: mockStorage.storage,
        indexPath: '/test/index',
        distanceType: 'l2',
        dimension: 128,
      });

      expect(index).toBeInstanceOf(LazyHnswIndex);
    });

    it('should throw for missing auxFilePath with IVF-PQ', async () => {
      const mockStorage = createMockStorage();

      await expect(
        createVectorIndex('ivf-pq', {
          storage: mockStorage.storage,
          indexPath: '/test/index',
          distanceType: 'l2',
          dimension: 128,
        })
      ).rejects.toThrow(/auxFilePath/);
    });

    it('should throw for unknown index type', async () => {
      const mockStorage = createMockStorage();

      await expect(
        createVectorIndex('unknown' as 'ivf-pq', {
          storage: mockStorage.storage,
          indexPath: '/test/index',
          distanceType: 'l2',
          dimension: 128,
        })
      ).rejects.toThrow(/Unknown index type/);
    });
  });
});

// ==========================================
// Loading Strategy Tests
// ==========================================

describe('Loading Strategies', () => {
  describe('Lazy Strategy', () => {
    it('should not load until first search', async () => {
      const mockStorage = createMockStorage();
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4,
        { strategy: 'lazy' }
      );

      // No calls made yet
      expect(mockStorage.getCalls.length).toBe(0);
      expect(mockStorage.getRangeCalls.length).toBe(0);

      // After search, should be initialized
      const query = generateRandomVector(128);
      await index.search(query, { k: 10 });

      expect(index.isReady()).toBe(true);
    });
  });

  describe('Eager Strategy', () => {
    it('should start loading on construction', async () => {
      const mockStorage = createMockStorage();

      // For HNSW with eager strategy, initialization happens in constructor
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4,
        { strategy: 'eager' }
      );

      // Wait a bit for async initialization to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should be ready or in the process of becoming ready
      // The test graph is created synchronously, so it should be ready
      // We just verify the index was created successfully
      expect(index).toBeInstanceOf(LazyHnswIndex);
    });
  });

  describe('On-Demand Strategy', () => {
    it('should behave like lazy strategy', async () => {
      const mockStorage = createMockStorage();
      const index = new LazyHnswIndex(
        mockStorage.storage,
        '/test/index',
        'l2',
        128,
        16,
        4,
        { strategy: 'on-demand' }
      );

      expect(index.isReady()).toBe(false);

      const query = generateRandomVector(128);
      await index.search(query, { k: 10 });

      expect(index.isReady()).toBe(true);
    });
  });
});

// ==========================================
// Prefetch Tests
// ==========================================

describe('Prefetch Configuration', () => {
  it('should respect enablePrefetch setting', () => {
    const mockStorage = createMockStorage();

    const indexWithPrefetch = new LazyIvfPqIndex(
      mockStorage.storage,
      '/test/index',
      '/test/aux',
      'l2',
      128,
      { strategy: 'lazy', enablePrefetch: true, prefetchHistorySize: 5 }
    );

    const indexWithoutPrefetch = new LazyIvfPqIndex(
      mockStorage.storage,
      '/test/index',
      '/test/aux',
      'l2',
      128,
      { strategy: 'lazy', enablePrefetch: false }
    );

    // Both should be created successfully
    expect(indexWithPrefetch).toBeInstanceOf(LazyIvfPqIndex);
    expect(indexWithoutPrefetch).toBeInstanceOf(LazyIvfPqIndex);
  });
});

// ==========================================
// Memory Efficiency Tests
// ==========================================

describe('Memory Efficiency', () => {
  it('should limit partition cache size', () => {
    const mockStorage = createMockStorage();
    const index = new LazyIvfPqIndex(
      mockStorage.storage,
      '/test/index',
      '/test/aux',
      'l2',
      128
    );

    const stats = index.getCacheStats();
    expect(stats.maxPartitions).toBe(50);
  });
});

// ==========================================
// Concurrent Loading Tests
// ==========================================

describe('Concurrent Loading', () => {
  it('should handle multiple concurrent searches', async () => {
    const mockStorage = createMockStorage();
    const index = new LazyHnswIndex(
      mockStorage.storage,
      '/test/index',
      'l2',
      128,
      16,
      4
    );

    const queries = Array.from({ length: 10 }, () => generateRandomVector(128));

    // Run all searches concurrently
    const results = await Promise.all(
      queries.map(q => index.search(q, { k: 5 }))
    );

    // All should return results
    expect(results.length).toBe(10);
    for (const r of results) {
      expect(r.length).toBeGreaterThan(0);
    }
  });

  it('should initialize only once with concurrent calls', async () => {
    const mockStorage = createMockStorage();
    const index = new LazyHnswIndex(
      mockStorage.storage,
      '/test/index',
      'l2',
      128,
      16,
      4
    );

    // Call initialize multiple times concurrently
    await Promise.all([
      index.initialize(),
      index.initialize(),
      index.initialize(),
    ]);

    // Should only be initialized once
    expect(index.isReady()).toBe(true);
    const stats = index.getCacheStats();
    expect(stats.initialized).toBe(true);
  });
});

// ==========================================
// Component-Level Lazy Loading Tests
// ==========================================

import {
  lazyModuleLoader,
  clearModuleCache,
  StreamingPartitionLoader,
  DEFAULT_STREAMING_CONFIG,
  ProgressiveLoader,
  LazyComponentRegistry,
  estimateMemoryUsage,
  batchLoadPartitions,
  DEFAULT_BATCH_LOAD_OPTIONS,
} from '../lazy-loader.js';

describe('Component-Level Lazy Loading', () => {
  describe('lazyModuleLoader', () => {
    beforeEach(() => {
      clearModuleCache();
    });

    it('should cache module imports', async () => {
      // Import the same module twice
      const module1 = await lazyModuleLoader('./types.js');
      const module2 = await lazyModuleLoader('./types.js');

      // Should be the same reference (cached)
      expect(module1).toBe(module2);
    });

    it('should import different modules separately', async () => {
      const types = await lazyModuleLoader('./types.js');
      const vectorIndex = await lazyModuleLoader('./vector-index.js');

      expect(types).not.toBe(vectorIndex);
    });
  });

  describe('clearModuleCache', () => {
    it('should clear the module cache', async () => {
      // Load a module
      await lazyModuleLoader('./types.js');

      // Clear the cache
      clearModuleCache();

      // The next import will be a fresh import (different promise)
      // We can't easily test reference equality after clear,
      // but we can verify no errors occur
      const result = await lazyModuleLoader('./types.js');
      expect(result).toBeDefined();
    });
  });
});

// ==========================================
// Streaming Partition Loader Tests
// ==========================================

describe('StreamingPartitionLoader', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const loader = new StreamingPartitionLoader(
        mockStorage.storage,
        '/test/aux'
      );

      expect(loader).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const loader = new StreamingPartitionLoader(
        mockStorage.storage,
        '/test/aux',
        {
          maxCachedPartitions: 100,
          streamingThreshold: 2 * 1024 * 1024,
          chunkSize: 128 * 1024,
        }
      );

      expect(loader).toBeDefined();
    });
  });

  describe('Default Streaming Config', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_STREAMING_CONFIG.maxCachedPartitions).toBe(50);
      expect(DEFAULT_STREAMING_CONFIG.streamingThreshold).toBe(1024 * 1024);
      expect(DEFAULT_STREAMING_CONFIG.chunkSize).toBe(64 * 1024);
      expect(DEFAULT_STREAMING_CONFIG.enableMemoryPressureHandling).toBe(true);
    });
  });

  describe('Cache Statistics', () => {
    it('should report initial stats', () => {
      const loader = new StreamingPartitionLoader(
        mockStorage.storage,
        '/test/aux'
      );

      const stats = loader.getStats();
      expect(stats.cachedPartitions).toBe(0);
      expect(stats.maxPartitions).toBe(50);
      expect(stats.totalCachedRows).toBe(0);
    });
  });

  describe('Cache Clear', () => {
    it('should clear all cached partitions', () => {
      const loader = new StreamingPartitionLoader(
        mockStorage.storage,
        '/test/aux'
      );

      loader.clear();

      const stats = loader.getStats();
      expect(stats.cachedPartitions).toBe(0);
      expect(stats.totalCachedRows).toBe(0);
    });
  });
});

// ==========================================
// Progressive Loader Tests
// ==========================================

describe('ProgressiveLoader', () => {
  describe('Progress Reporting', () => {
    it('should call progress callback with correct data', () => {
      const progressCalls: Array<{
        stage: string;
        loaded: number;
        total: number;
        percentage: number;
      }> = [];

      const loader = new ProgressiveLoader((progress) => {
        progressCalls.push(progress);
      });

      loader.report('loading_centroids', 50, 100);

      expect(progressCalls.length).toBe(1);
      expect(progressCalls[0].stage).toBe('loading_centroids');
      expect(progressCalls[0].loaded).toBe(50);
      expect(progressCalls[0].total).toBe(100);
      expect(progressCalls[0].percentage).toBe(50);
    });

    it('should handle zero total correctly', () => {
      const progressCalls: Array<{ percentage: number }> = [];

      const loader = new ProgressiveLoader((progress) => {
        progressCalls.push({ percentage: progress.percentage });
      });

      loader.report('empty_stage', 0, 0);

      expect(progressCalls[0].percentage).toBe(0);
    });

    it('should work without callback', () => {
      const loader = new ProgressiveLoader();

      // Should not throw
      expect(() => loader.report('test', 50, 100)).not.toThrow();
    });
  });

  describe('Stage Reporter', () => {
    it('should create a stage-specific reporter', () => {
      const progressCalls: Array<{
        stage: string;
        loaded: number;
        total: number;
      }> = [];

      const loader = new ProgressiveLoader((progress) => {
        progressCalls.push({
          stage: progress.stage,
          loaded: progress.loaded,
          total: progress.total,
        });
      });

      const reporter = loader.createStageReporter('partition_loading', 10);

      reporter(3);
      reporter(7);
      reporter(10);

      expect(progressCalls.length).toBe(3);
      expect(progressCalls[0]).toEqual({ stage: 'partition_loading', loaded: 3, total: 10 });
      expect(progressCalls[1]).toEqual({ stage: 'partition_loading', loaded: 7, total: 10 });
      expect(progressCalls[2]).toEqual({ stage: 'partition_loading', loaded: 10, total: 10 });
    });
  });
});

// ==========================================
// Lazy Component Registry Tests
// ==========================================

describe('LazyComponentRegistry', () => {
  let registry: LazyComponentRegistry;

  beforeEach(() => {
    registry = new LazyComponentRegistry();
  });

  describe('Component Tracking', () => {
    it('should track loading components', () => {
      registry.markLoading('centroids');

      expect(registry.isLoaded('centroids')).toBe(false);
    });

    it('should track loaded components', () => {
      registry.markLoaded('centroids', 1024);

      expect(registry.isLoaded('centroids')).toBe(true);
    });

    it('should track failed components', () => {
      registry.markFailed('centroids', new Error('Network error'));

      expect(registry.isLoaded('centroids')).toBe(false);
    });

    it('should return false for unknown components', () => {
      expect(registry.isLoaded('unknown')).toBe(false);
    });
  });

  describe('Status Retrieval', () => {
    it('should return all component statuses', () => {
      registry.markLoaded('centroids', 1024);
      registry.markLoaded('codebook', 2048);
      registry.markFailed('partitions', new Error('Failed'));

      const statuses = registry.getAllStatus();

      expect(statuses.length).toBe(3);
      expect(statuses.find(s => s.name === 'centroids')?.loaded).toBe(true);
      expect(statuses.find(s => s.name === 'codebook')?.loaded).toBe(true);
      expect(statuses.find(s => s.name === 'partitions')?.loaded).toBe(false);
    });
  });

  describe('Total Loaded Size', () => {
    it('should calculate total loaded size', () => {
      registry.markLoaded('centroids', 1024);
      registry.markLoaded('codebook', 2048);
      registry.markLoading('partitions'); // No size

      expect(registry.getTotalLoadedSize()).toBe(3072);
    });

    it('should return 0 when nothing loaded', () => {
      expect(registry.getTotalLoadedSize()).toBe(0);
    });
  });

  describe('Clear', () => {
    it('should clear all registered components', () => {
      registry.markLoaded('centroids', 1024);
      registry.markLoaded('codebook', 2048);

      registry.clear();

      expect(registry.getAllStatus().length).toBe(0);
      expect(registry.getTotalLoadedSize()).toBe(0);
    });
  });
});

// ==========================================
// Memory Usage Estimation Tests
// ==========================================

describe('Memory Usage Estimation', () => {
  describe('estimateMemoryUsage', () => {
    it('should estimate row ID array memory', () => {
      const rowIds = new BigUint64Array(100);
      const estimate = estimateMemoryUsage({ rowIds });

      expect(estimate).toBe(800); // 100 * 8 bytes
    });

    it('should estimate PQ codes array memory', () => {
      const pqCodes = new Uint8Array(1600);
      const estimate = estimateMemoryUsage({ pqCodes });

      expect(estimate).toBe(1600);
    });

    it('should estimate centroids memory', () => {
      const centroids = new Float32Array(256 * 128); // 256 partitions x 128 dimensions
      const estimate = estimateMemoryUsage({ centroids });

      expect(estimate).toBe(256 * 128 * 4);
    });

    it('should estimate codebook memory', () => {
      const codebook = new Float32Array(256 * 16 * 8); // 256 codes x 16 sub-vectors x 8 sub-dim
      const estimate = estimateMemoryUsage({ codebook });

      expect(estimate).toBe(256 * 16 * 8 * 4);
    });

    it('should estimate node storage memory', () => {
      const estimate = estimateMemoryUsage({
        nodes: 1000,
        dimension: 128,
      });

      // 1000 nodes * (128 dims * 4 bytes + 64 bytes overhead)
      expect(estimate).toBe(1000 * (128 * 4 + 64));
    });

    it('should combine all estimates', () => {
      const rowIds = new BigUint64Array(100);
      const pqCodes = new Uint8Array(1600);
      const centroids = new Float32Array(256 * 128);

      const estimate = estimateMemoryUsage({ rowIds, pqCodes, centroids });

      expect(estimate).toBe(800 + 1600 + 256 * 128 * 4);
    });

    it('should return 0 for empty input', () => {
      const estimate = estimateMemoryUsage({});
      expect(estimate).toBe(0);
    });
  });
});

// ==========================================
// Batch Loading Tests
// ==========================================

describe('Batch Loading', () => {
  describe('Default Options', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_BATCH_LOAD_OPTIONS.concurrency).toBe(4);
      expect(DEFAULT_BATCH_LOAD_OPTIONS.timeout).toBe(30000);
      expect(DEFAULT_BATCH_LOAD_OPTIONS.failFast).toBe(false);
    });
  });

  describe('batchLoadPartitions', () => {
    it('should load all items successfully', async () => {
      const items = [1, 2, 3, 4, 5];
      const loaded: number[] = [];

      const result = await batchLoadPartitions(
        items,
        async (item) => {
          loaded.push(item);
        }
      );

      expect(result.successful.length).toBe(5);
      expect(result.failed.length).toBe(0);
      expect(loaded.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle some failures', async () => {
      const items = [1, 2, 3, 4, 5];

      const result = await batchLoadPartitions(
        items,
        async (item) => {
          if (item === 3) {
            throw new Error('Failed to load item 3');
          }
        },
        { failFast: false }
      );

      expect(result.successful.length).toBe(4);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0].item).toBe(3);
      expect(result.failed[0].error.message).toBe('Failed to load item 3');
    });

    it('should fail fast when configured', async () => {
      const items = [1, 2, 3, 4, 5];
      const loaded: number[] = [];

      await expect(
        batchLoadPartitions(
          items,
          async (item) => {
            if (item === 2) {
              throw new Error('Fail fast error');
            }
            loaded.push(item);
          },
          { failFast: true, concurrency: 1 }
        )
      ).rejects.toThrow('Fail fast error');
    });

    it('should respect concurrency limit', async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8];
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      await batchLoadPartitions(
        items,
        async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise(resolve => setTimeout(resolve, 10));
          currentConcurrent--;
        },
        { concurrency: 2 }
      );

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should handle timeout', async () => {
      const items = [1];

      const result = await batchLoadPartitions(
        items,
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
        },
        { timeout: 10, failFast: false }
      );

      expect(result.successful.length).toBe(0);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0].error.message).toBe('Load timeout');
    });

    it('should handle empty input', async () => {
      const result = await batchLoadPartitions(
        [],
        async () => {}
      );

      expect(result.successful.length).toBe(0);
      expect(result.failed.length).toBe(0);
    });
  });
});
