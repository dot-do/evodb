/**
 * @evodb/query - Unified Query Engine Unit Tests
 *
 * Unit tests for the UnifiedQueryEngine that merges SimpleQueryEngine
 * functionality into the main QueryEngine class.
 *
 * The UnifiedQueryEngine provides two modes:
 * - 'simple': Lightweight mode using Cache API, suitable for basic queries
 * - 'full': Full-featured mode with zone maps, bloom filters, query planning
 *
 * Following TDD Red-Green-Refactor approach.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  UnifiedQueryEngine,
  createUnifiedQueryEngine,
  createSimpleUnifiedEngine,
  createFullUnifiedEngine,
} from '../unified-engine.js';

import type {
  UnifiedQueryEngineConfig,
  QueryEngineMode,
} from '../unified-engine.js';

import type {
  Query,
  R2Bucket,
  QueryEngineConfig,
} from '../types.js';

import type {
  SimpleQueryRequest,
  SimpleR2Bucket,
} from '../simple-engine.js';

import { createMockDataSource } from './fixtures/mock-data.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create mock R2 bucket for testing
 */
function createMockBucket(): R2Bucket & SimpleR2Bucket {
  const mockObjects: Record<string, { arrayBuffer: () => Promise<ArrayBuffer>; json: <T>() => Promise<T>; etag: string; size: number }> = {
    'manifest.json': {
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(JSON.stringify({
        version: 1,
        tables: {
          users: {
            name: 'users',
            schema: [
              { name: 'id', type: 'int64', nullable: false },
              { name: 'name', type: 'string', nullable: false },
              { name: 'status', type: 'string', nullable: false },
              { name: 'age', type: 'int32', nullable: true },
            ],
            blockPaths: ['data/users/block-0.json'],
            rowCount: 3,
            lastUpdated: Date.now(),
          },
        },
      })).buffer),
      json: vi.fn().mockResolvedValue({
        version: 1,
        tables: {
          users: {
            name: 'users',
            schema: [
              { name: 'id', type: 'int64', nullable: false },
              { name: 'name', type: 'string', nullable: false },
              { name: 'status', type: 'string', nullable: false },
              { name: 'age', type: 'int32', nullable: true },
            ],
            blockPaths: ['data/users/block-0.json'],
            rowCount: 3,
            lastUpdated: Date.now(),
          },
        },
      }),
      etag: 'manifest-etag',
      size: 500,
    },
    'data/users/block-0.json': {
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(JSON.stringify({
        id: [1, 2, 3],
        name: ['Alice', 'Bob', 'Charlie'],
        status: ['active', 'inactive', 'active'],
        age: [25, 30, 35],
      })).buffer),
      json: vi.fn().mockResolvedValue({
        id: [1, 2, 3],
        name: ['Alice', 'Bob', 'Charlie'],
        status: ['active', 'inactive', 'active'],
        age: [25, 30, 35],
      }),
      etag: 'block-0-etag',
      size: 200,
    },
  };

  return {
    get: vi.fn().mockImplementation(async (key: string) => {
      return mockObjects[key] ?? null;
    }),
    head: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
  };
}

/**
 * Create test config for unified engine
 */
function createUnifiedTestConfig(mode: QueryEngineMode = 'full'): UnifiedQueryEngineConfig {
  const bucket = createMockBucket();
  return {
    mode,
    bucket,
    dataSource: createMockDataSource(),
    maxParallelism: 4,
    defaultTimeoutMs: 30000,
    enableStats: true,
    simpleCache: {
      enableCacheApi: false, // Disable for testing
    },
  };
}

// =============================================================================
// 1. UnifiedQueryEngine Mode Selection
// =============================================================================

describe('UnifiedQueryEngine - Mode Selection', () => {
  describe('Mode Configuration', () => {
    it('should default to full mode when no mode specified', () => {
      const config = createUnifiedTestConfig();
      delete (config as { mode?: QueryEngineMode }).mode;
      const engine = new UnifiedQueryEngine(config);

      expect(engine.getMode()).toBe('full');
    });

    it('should accept simple mode configuration', () => {
      const config = createUnifiedTestConfig('simple');
      const engine = new UnifiedQueryEngine(config);

      expect(engine.getMode()).toBe('simple');
    });

    it('should accept full mode configuration', () => {
      const config = createUnifiedTestConfig('full');
      const engine = new UnifiedQueryEngine(config);

      expect(engine.getMode()).toBe('full');
    });
  });

  describe('Factory Functions', () => {
    it('should create engine via createUnifiedQueryEngine factory', () => {
      const config = createUnifiedTestConfig('simple');
      const engine = createUnifiedQueryEngine(config);

      expect(engine).toBeInstanceOf(UnifiedQueryEngine);
      expect(engine.getMode()).toBe('simple');
    });

    it('should create simple engine via createSimpleUnifiedEngine factory', () => {
      const bucket = createMockBucket();
      const engine = createSimpleUnifiedEngine({
        bucket,
        simpleCache: { enableCacheApi: false },
      });

      expect(engine).toBeInstanceOf(UnifiedQueryEngine);
      expect(engine.getMode()).toBe('simple');
    });

    it('should create full engine via createFullUnifiedEngine factory', () => {
      const config = createUnifiedTestConfig('full');
      const engine = createFullUnifiedEngine(config);

      expect(engine).toBeInstanceOf(UnifiedQueryEngine);
      expect(engine.getMode()).toBe('full');
    });
  });
});

// =============================================================================
// 2. Simple Mode Query Execution
// =============================================================================

describe('UnifiedQueryEngine - Simple Mode', () => {
  let engine: UnifiedQueryEngine;

  beforeEach(() => {
    const config = createUnifiedTestConfig('simple');
    engine = new UnifiedQueryEngine(config);
  });

  describe('Simple Query API (query method)', () => {
    it('should execute simple query with table and filters', async () => {
      const request: SimpleQueryRequest = {
        table: 'users',
        filters: [{ column: 'status', operator: 'eq', value: 'active' }],
      };

      const result = await engine.query(request);

      expect(result.columns).toBeDefined();
      expect(result.rows).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should execute simple query with column projection', async () => {
      const request: SimpleQueryRequest = {
        table: 'users',
        columns: ['id', 'name'],
      };

      const result = await engine.query(request);

      expect(result.columns).toContain('id');
      expect(result.columns).toContain('name');
      expect(result.columns).not.toContain('status');
    });

    it('should execute simple query with limit and offset', async () => {
      const request: SimpleQueryRequest = {
        table: 'users',
        limit: 2,
        offset: 1,
      };

      const result = await engine.query(request);

      expect(result.rows.length).toBeLessThanOrEqual(2);
    });

    it('should execute simple query with ordering', async () => {
      const request: SimpleQueryRequest = {
        table: 'users',
        orderBy: [{ column: 'name', direction: 'asc' }],
      };

      const result = await engine.query(request);

      expect(result.rows).toBeDefined();
    });

    it('should execute simple query with aggregations', async () => {
      const request: SimpleQueryRequest = {
        table: 'users',
        aggregates: [{ function: 'count', alias: 'total' }],
      };

      const result = await engine.query(request);

      expect(result.columns).toContain('total');
    });
  });

  describe('Unified Execute API (execute method)', () => {
    it('should execute query using unified interface in simple mode', async () => {
      const result = await engine.execute({
        table: 'users',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
      });

      expect(result.rows).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Table Operations', () => {
    it('should list available tables', async () => {
      const tables = await engine.listTables();

      expect(Array.isArray(tables)).toBe(true);
    });

    it('should get table metadata', async () => {
      const metadata = await engine.getTableMetadata('users');

      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('users');
    });
  });

  describe('Cache Operations', () => {
    it('should get cache stats', () => {
      const stats = engine.getCacheStats();

      expect(stats).toBeDefined();
      expect(typeof stats.hits).toBe('number');
      expect(typeof stats.misses).toBe('number');
    });

    it('should clear cache', async () => {
      await expect(engine.clearCache()).resolves.not.toThrow();
    });
  });
});

// =============================================================================
// 3. Full Mode Query Execution
// =============================================================================

describe('UnifiedQueryEngine - Full Mode', () => {
  let engine: UnifiedQueryEngine;

  beforeEach(() => {
    const config = createUnifiedTestConfig('full');
    engine = new UnifiedQueryEngine(config);
  });

  describe('Full Query API (execute method)', () => {
    it('should execute query with full engine features', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
      };

      const result = await engine.execute(query);

      expect(result.rows).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.totalRowCount).toBeDefined();
    });

    it('should execute query with projection', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        projection: { columns: ['id', 'name'] },
      };

      const result = await engine.execute(query);

      expect(result.rows).toBeDefined();
    });

    it('should execute query with aggregation', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        aggregations: [{ function: 'count', column: null, alias: 'total' }],
      };

      const result = await engine.execute(query);

      expect(result.rows).toBeDefined();
    });

    it('should execute query with order by and limit', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        orderBy: [{ column: 'name', direction: 'asc' }],
        limit: 10,
      };

      const result = await engine.execute(query);

      expect(result.rows.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Query Planning', () => {
    it('should generate query plan via plan method', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
      };

      const plan = await engine.plan(query);

      expect(plan).toBeDefined();
      expect(plan.planId).toBeDefined();
      expect(plan.estimatedCost).toBeDefined();
    });

    it('should generate explain output via explain method', async () => {
      const explainResult = await engine.explain({
        table: 'com/example/api/users',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
      });

      expect(explainResult).toBeDefined();
      expect(explainResult.planId).toBeDefined();
    });
  });

  describe('Streaming Execution', () => {
    it('should support streaming query execution', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        limit: 100,
      };

      const streamResult = await engine.executeStream(query);

      expect(streamResult.rows).toBeDefined();
      expect(typeof streamResult.cancel).toBe('function');
      expect(typeof streamResult.isRunning).toBe('function');
    });
  });

  describe('Cache Operations', () => {
    it('should get cache stats', () => {
      const stats = engine.getCacheStats();

      expect(stats).toBeDefined();
      expect(typeof stats.hits).toBe('number');
      expect(typeof stats.misses).toBe('number');
    });

    it('should clear cache', async () => {
      await expect(engine.clearCache()).resolves.not.toThrow();
    });

    it('should invalidate specific cache entries', async () => {
      await expect(engine.invalidateCache(['path/to/file'])).resolves.not.toThrow();
    });
  });
});

// =============================================================================
// 4. Mode-Specific API Availability
// =============================================================================

describe('UnifiedQueryEngine - Mode-Specific API', () => {
  describe('Simple Mode API Restrictions', () => {
    let engine: UnifiedQueryEngine;

    beforeEach(() => {
      const config = createUnifiedTestConfig('simple');
      engine = new UnifiedQueryEngine(config);
    });

    it('should support query() method in simple mode', async () => {
      const result = await engine.query({ table: 'users' });
      expect(result).toBeDefined();
    });

    it('should support execute() method in simple mode', async () => {
      const result = await engine.execute({ table: 'users' });
      expect(result).toBeDefined();
    });

    it('should support explain() method in simple mode', async () => {
      const result = await engine.explain({ table: 'users' });
      expect(result).toBeDefined();
    });
  });

  describe('Full Mode API Availability', () => {
    let engine: UnifiedQueryEngine;

    beforeEach(() => {
      const config = createUnifiedTestConfig('full');
      engine = new UnifiedQueryEngine(config);
    });

    it('should support execute() method in full mode', async () => {
      const result = await engine.execute({ table: 'com/example/api/users' });
      expect(result).toBeDefined();
    });

    it('should support plan() method in full mode', async () => {
      const result = await engine.plan({ table: 'com/example/api/users' });
      expect(result).toBeDefined();
    });

    it('should support executeStream() method in full mode', async () => {
      const result = await engine.executeStream({ table: 'com/example/api/users' });
      expect(result).toBeDefined();
    });

    it('should support query() method in full mode (compatibility)', async () => {
      // query() should work in full mode by converting to execute()
      const result = await engine.query({ table: 'com/example/api/users' });
      expect(result).toBeDefined();
    });
  });
});

// =============================================================================
// 5. CacheableQueryExecutor Interface
// =============================================================================

describe('UnifiedQueryEngine - CacheableQueryExecutor Interface', () => {
  describe('Simple Mode implements interface', () => {
    let engine: UnifiedQueryEngine;

    beforeEach(() => {
      const config = createUnifiedTestConfig('simple');
      engine = new UnifiedQueryEngine(config);
    });

    it('should implement execute()', async () => {
      const result = await engine.execute({
        table: 'users',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
      });

      expect(result.rows).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    it('should implement explain()', async () => {
      const result = await engine.explain({ table: 'users' });

      expect(result.planId).toBeDefined();
      expect(result.estimatedCost).toBeDefined();
    });

    it('should implement getCacheStats()', () => {
      const stats = engine.getCacheStats();

      expect(stats.hits).toBeDefined();
      expect(stats.misses).toBeDefined();
      expect(stats.hitRatio).toBeDefined();
    });

    it('should implement clearCache()', async () => {
      await expect(engine.clearCache()).resolves.not.toThrow();
    });

    it('should implement invalidateCache()', async () => {
      await expect(engine.invalidateCache(['path'])).resolves.not.toThrow();
    });
  });

  describe('Full Mode implements interface', () => {
    let engine: UnifiedQueryEngine;

    beforeEach(() => {
      const config = createUnifiedTestConfig('full');
      engine = new UnifiedQueryEngine(config);
    });

    it('should implement execute()', async () => {
      const result = await engine.execute({
        table: 'com/example/api/users',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
      });

      expect(result.rows).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    it('should implement explain()', async () => {
      const result = await engine.explain({ table: 'com/example/api/users' });

      expect(result.planId).toBeDefined();
      expect(result.estimatedCost).toBeDefined();
    });

    it('should implement getCacheStats()', () => {
      const stats = engine.getCacheStats();

      expect(stats.hits).toBeDefined();
      expect(stats.misses).toBeDefined();
      expect(stats.hitRatio).toBeDefined();
    });

    it('should implement clearCache()', async () => {
      await expect(engine.clearCache()).resolves.not.toThrow();
    });

    it('should implement invalidateCache()', async () => {
      await expect(engine.invalidateCache(['path'])).resolves.not.toThrow();
    });
  });
});

// =============================================================================
// 6. Error Handling
// =============================================================================

describe('UnifiedQueryEngine - Error Handling', () => {
  describe('Simple Mode Errors', () => {
    let engine: UnifiedQueryEngine;

    beforeEach(() => {
      const config = createUnifiedTestConfig('simple');
      engine = new UnifiedQueryEngine(config);
    });

    it('should throw error for non-existent table', async () => {
      await expect(engine.query({ table: 'nonexistent' }))
        .rejects.toThrow(/not found/i);
    });
  });

  describe('Full Mode Errors', () => {
    let engine: UnifiedQueryEngine;

    beforeEach(() => {
      const config = createUnifiedTestConfig('full');
      engine = new UnifiedQueryEngine(config);
    });

    it('should throw error for non-existent table', async () => {
      await expect(engine.execute({ table: 'nonexistent' }))
        .rejects.toThrow(/not found/i);
    });

    it('should throw error for invalid column in predicate', async () => {
      await expect(engine.execute({
        table: 'com/example/api/users',
        predicates: [{ column: 'nonexistent_column', operator: 'eq', value: 'test' }],
      })).rejects.toThrow(/column|not found/i);
    });
  });
});

// =============================================================================
// 7. Backward Compatibility
// =============================================================================

describe('UnifiedQueryEngine - Backward Compatibility', () => {
  describe('SimpleQueryEngine compatibility', () => {
    it('should accept SimpleQueryConfig-style configuration', () => {
      const bucket = createMockBucket();
      const engine = createSimpleUnifiedEngine({
        bucket,
        simpleCache: { enableCacheApi: false },
        maxConcurrentReads: 4,
      });

      expect(engine.getMode()).toBe('simple');
    });
  });

  describe('QueryEngine compatibility', () => {
    it('should accept QueryEngineConfig-style configuration', () => {
      const config = createUnifiedTestConfig('full');
      const engine = createFullUnifiedEngine(config);

      expect(engine.getMode()).toBe('full');
    });
  });
});
