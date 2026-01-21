/**
 * @evodb/query - Query Engine Test Suite (RED Phase)
 *
 * Comprehensive failing tests for the EvoDB Query Engine.
 * These tests define the expected behavior for querying R2-stored columnar data.
 *
 * All tests are designed to FAIL until implementation is complete.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  QueryEngine,
  QueryPlanner,
  PartitionScanner,
  ZoneMapOptimizer,
  BloomFilterManager,
  AggregationEngine,
  CacheManager,
  ResultProcessor,
  createQueryEngine,
  createQueryPlanner,
  createZoneMapOptimizer,
  createBloomFilterManager,
  createAggregationEngine,
  createCacheManager,
  createResultProcessor,
} from '../engine.js';

import type {
  Query,
  QueryPlan,
  QueryResult,
  PartitionInfo,
  Predicate,
  Aggregation,
  QueryEngineConfig,
  ZoneMap,
  R2Bucket,
  R2Object,
  PlanOperator,
} from '../types.js';

import {
  generatePartitionInfo,
  generatePartitionedInfo,
} from '@evodb/test-utils';

import { createMockDataSource } from './fixtures/mock-data.js';

// =============================================================================
// Test Fixtures and Helpers
// =============================================================================

/**
 * Create a mock R2 bucket for testing
 */
function createMockBucket(): R2Bucket {
  return {
    get: vi.fn().mockResolvedValue(null),
    head: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
  };
}

/**
 * Create mock partition info using test-utils
 */
function createMockPartition(
  path: string,
  rowCount: number,
  columnStats: Record<string, { min: unknown; max: unknown; nullCount: number }> = {}
): PartitionInfo {
  return generatePartitionInfo(path, rowCount, columnStats) as PartitionInfo;
}

/**
 * Create mock partition with partition values using test-utils
 */
function createPartitionedMock(
  path: string,
  partitionValues: Record<string, unknown>,
  rowCount: number = 100
): PartitionInfo {
  return generatePartitionedInfo(path, partitionValues, rowCount) as PartitionInfo;
}

/**
 * Create test query engine config
 */
function createTestConfig(overrides?: Partial<QueryEngineConfig>): QueryEngineConfig {
  return {
    bucket: createMockBucket(),
    dataSource: createMockDataSource(),
    maxParallelism: 4,
    defaultTimeoutMs: 30000,
    enableStats: true,
    ...overrides,
  };
}

// =============================================================================
// 1. SCAN QUERIES
// =============================================================================

describe('EvoDB Query Engine - Scan Queries', () => {
  let engine: QueryEngine;
  let config: QueryEngineConfig;

  beforeEach(() => {
    config = createTestConfig();
    engine = createQueryEngine(config);
  });

  describe('Basic Scan Operations', () => {
    it('should scan all rows from a table', async () => {
      const query: Query = {
        table: 'com/example/api/users',
      };

      const result = await engine.execute(query);

      expect(result.rows).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return row count in stats', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
      };

      const result = await engine.execute(query);

      expect(result.totalRowCount).toBeDefined();
      expect(typeof result.totalRowCount).toBe('number');
      expect(result.stats.rowsScanned).toBeGreaterThanOrEqual(0);
    });

    it('should scan empty table without error', async () => {
      const query: Query = {
        table: 'com/example/api/empty',
      };

      const result = await engine.execute(query);

      expect(result.rows).toEqual([]);
      expect(result.totalRowCount).toBe(0);
    });
  });

  describe('Column Projection', () => {
    it('should apply column projection', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        projection: {
          columns: ['id', 'name', 'email'],
        },
      };

      const result = await engine.execute(query);

      // Each row should only have projected columns
      for (const row of result.rows) {
        const keys = Object.keys(row);
        expect(keys).toContain('id');
        expect(keys).toContain('name');
        expect(keys).toContain('email');
        // Should not have non-projected columns
        expect(keys).not.toContain('created_at');
        expect(keys).not.toContain('updated_at');
      }
    });

    it('should project nested columns', async () => {
      const query: Query = {
        table: 'com/example/api/profiles',
        projection: {
          columns: ['user.name', 'user.email', 'address.city'],
        },
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row).toHaveProperty('user.name');
        expect(row).toHaveProperty('address.city');
      }
    });

    it('should include metadata when requested', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        projection: {
          columns: ['name'],
          includeMetadata: true,
        },
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row).toHaveProperty('_id');
        expect(row).toHaveProperty('_version');
      }
    });

    it('should handle empty projection (all columns)', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        projection: undefined,
      };

      const result = await engine.execute(query);

      // Should return all columns
      expect(Object.keys(result.rows[0] || {}).length).toBeGreaterThan(0);
    });
  });

  describe('Predicate Filters', () => {
    it('should apply equality predicate filter', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'active' },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.status).toBe('active');
      }
    });

    it('should apply range predicate filters', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        predicates: [
          { column: 'total', operator: 'gte', value: 100 },
          { column: 'total', operator: 'lte', value: 500 },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        const total = row.total as number;
        expect(total).toBeGreaterThanOrEqual(100);
        expect(total).toBeLessThanOrEqual(500);
      }
    });

    it('should apply IN predicate filter', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        predicates: [
          { column: 'status', operator: 'in', value: ['pending', 'processing'] },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(['pending', 'processing']).toContain(row.status);
      }
    });

    it('should apply BETWEEN predicate filter', async () => {
      const query: Query = {
        table: 'com/example/api/events',
        predicates: [
          { column: 'timestamp', operator: 'between', value: [1000, 2000] },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        const ts = row.timestamp as number;
        expect(ts).toBeGreaterThanOrEqual(1000);
        expect(ts).toBeLessThanOrEqual(2000);
      }
    });

    it('should apply LIKE predicate filter', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'email', operator: 'like', value: '%@example.com' },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect((row.email as string).endsWith('@example.com')).toBe(true);
      }
    });

    it('should apply IS NULL predicate filter', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'deleted_at', operator: 'isNull', value: null },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.deleted_at).toBeNull();
      }
    });

    it('should apply IS NOT NULL predicate filter', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'email', operator: 'isNotNull', value: null },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.email).not.toBeNull();
      }
    });

    it('should apply negated predicates', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'banned', not: true },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.status).not.toBe('banned');
      }
    });

    it('should combine multiple predicates with AND', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'active' },
          { column: 'age', operator: 'gte', value: 18 },
          { column: 'country', operator: 'eq', value: 'USA' },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.status).toBe('active');
        expect(row.age as number).toBeGreaterThanOrEqual(18);
        expect(row.country).toBe('USA');
      }
    });
  });

  describe('Multiple Partitions', () => {
    it('should handle multiple partitions', async () => {
      const query: Query = {
        table: 'com/example/api/events',
      };

      const result = await engine.execute(query);

      // Stats should show multiple partitions
      expect(result.stats.partitionsScanned).toBeGreaterThan(0);
    });

    it('should merge results from multiple partitions', async () => {
      const query: Query = {
        table: 'com/example/api/events',
        orderBy: [{ column: 'timestamp', direction: 'asc' }],
      };

      const result = await engine.execute(query);

      // Results should be properly merged and sorted
      for (let i = 1; i < result.rows.length; i++) {
        const prev = result.rows[i - 1].timestamp as number;
        const curr = result.rows[i].timestamp as number;
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });

    it('should track bytes read from partitions', async () => {
      const query: Query = {
        table: 'com/example/api/large_table',
      };

      const result = await engine.execute(query);

      expect(result.stats.bytesRead).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// 2. AGGREGATION QUERIES
// =============================================================================

describe('EvoDB Query Engine - Aggregation Queries', () => {
  let engine: QueryEngine;
  let aggregator: AggregationEngine;

  beforeEach(() => {
    const config = createTestConfig();
    engine = createQueryEngine(config);
    aggregator = createAggregationEngine();
  });

  describe('COUNT Aggregation', () => {
    it('should compute COUNT(*)', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        aggregations: [
          { function: 'count', column: null, alias: 'total_count' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].total_count).toBeDefined();
      expect(typeof result.rows[0].total_count).toBe('number');
    });

    it('should compute COUNT(column)', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        aggregations: [
          { function: 'count', column: 'email', alias: 'email_count' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows[0].email_count).toBeDefined();
      // COUNT(column) excludes nulls
    });

    it('should compute COUNT(DISTINCT column)', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        aggregations: [
          { function: 'countDistinct', column: 'customer_id', alias: 'unique_customers' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows[0].unique_customers).toBeDefined();
    });
  });

  describe('SUM/AVG/MIN/MAX Aggregations', () => {
    it('should compute SUM', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        aggregations: [
          { function: 'sum', column: 'total', alias: 'total_revenue' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows[0].total_revenue).toBeDefined();
      expect(typeof result.rows[0].total_revenue).toBe('number');
    });

    it('should compute AVG', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        aggregations: [
          { function: 'avg', column: 'age', alias: 'average_age' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows[0].average_age).toBeDefined();
      expect(typeof result.rows[0].average_age).toBe('number');
    });

    it('should compute MIN', async () => {
      const query: Query = {
        table: 'com/example/api/products',
        aggregations: [
          { function: 'min', column: 'price', alias: 'min_price' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows[0].min_price).toBeDefined();
    });

    it('should compute MAX', async () => {
      const query: Query = {
        table: 'com/example/api/products',
        aggregations: [
          { function: 'max', column: 'price', alias: 'max_price' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows[0].max_price).toBeDefined();
    });

    it('should compute multiple aggregations together', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        aggregations: [
          { function: 'count', column: null, alias: 'order_count' },
          { function: 'sum', column: 'total', alias: 'total_revenue' },
          { function: 'avg', column: 'total', alias: 'avg_order' },
          { function: 'min', column: 'total', alias: 'min_order' },
          { function: 'max', column: 'total', alias: 'max_order' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].order_count).toBeDefined();
      expect(result.rows[0].total_revenue).toBeDefined();
      expect(result.rows[0].avg_order).toBeDefined();
      expect(result.rows[0].min_order).toBeDefined();
      expect(result.rows[0].max_order).toBeDefined();
    });

    it('should handle aggregation with filter', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        predicates: [
          { column: 'status', operator: 'eq', value: 'completed' },
        ],
        aggregations: [
          { function: 'sum', column: 'total', alias: 'completed_revenue' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows[0].completed_revenue).toBeDefined();
    });
  });

  describe('GROUP BY', () => {
    it('should compute GROUP BY with single column', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        groupBy: ['status'],
        aggregations: [
          { function: 'count', column: null, alias: 'count' },
        ],
      };

      const result = await engine.execute(query);

      // Should have one row per distinct status
      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(row.status).toBeDefined();
        expect(row.count).toBeDefined();
      }
    });

    it('should compute GROUP BY with multiple columns', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        groupBy: ['customer_id', 'status'],
        aggregations: [
          { function: 'count', column: null, alias: 'order_count' },
          { function: 'sum', column: 'total', alias: 'total_spent' },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.customer_id).toBeDefined();
        expect(row.status).toBeDefined();
        expect(row.order_count).toBeDefined();
        expect(row.total_spent).toBeDefined();
      }
    });

    it('should handle GROUP BY with HAVING equivalent filter', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        groupBy: ['customer_id'],
        aggregations: [
          { function: 'sum', column: 'total', alias: 'total_spent' },
        ],
        predicates: [
          // This acts as HAVING total_spent > 1000
          { column: 'total_spent', operator: 'gt', value: 1000 },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.total_spent as number).toBeGreaterThan(1000);
      }
    });

    it('should compute GROUP BY with date truncation', async () => {
      const query: Query = {
        table: 'com/example/api/events',
        groupBy: ['day'], // Assumes day is a partition column
        aggregations: [
          { function: 'count', column: null, alias: 'event_count' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(row.day).toBeDefined();
        expect(row.event_count).toBeDefined();
      }
    });
  });

  describe('DISTINCT', () => {
    it('should compute DISTINCT values for single column', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        projection: { columns: ['status'] },
        // Note: DISTINCT is implied when only selecting one column with no aggregations
      };

      // Alternatively, use the aggregation engine directly
      const partitions = [createMockPartition('data/orders.bin', 1000)];
      const distinctValues = await aggregator.distinct(partitions, 'status');

      expect(Array.isArray(distinctValues)).toBe(true);
      // All values should be unique
      const uniqueSet = new Set(distinctValues);
      expect(uniqueSet.size).toBe(distinctValues.length);
    });

    it('should compute COUNT DISTINCT efficiently', async () => {
      const query: Query = {
        table: 'com/example/api/events',
        aggregations: [
          { function: 'countDistinct', column: 'user_id', alias: 'unique_users' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows[0].unique_users).toBeDefined();
      expect(typeof result.rows[0].unique_users).toBe('number');
    });
  });
});

// =============================================================================
// 3. ZONE MAP OPTIMIZATION
// =============================================================================

describe('EvoDB Query Engine - Zone Map Optimization', () => {
  let optimizer: ZoneMapOptimizer;

  beforeEach(() => {
    optimizer = createZoneMapOptimizer();
  });

  describe('Partition Pruning with Zone Maps', () => {
    it('should skip partitions using zone maps (min/max)', () => {
      const partitions: PartitionInfo[] = [
        createMockPartition('data/p1.bin', 1000, { age: { min: 10, max: 30, nullCount: 0 } }),
        createMockPartition('data/p2.bin', 1000, { age: { min: 40, max: 60, nullCount: 0 } }),
        createMockPartition('data/p3.bin', 1000, { age: { min: 70, max: 90, nullCount: 0 } }),
      ];

      const predicates: Predicate[] = [
        { column: 'age', operator: 'gte', value: 50 },
      ];

      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      // Only p2 and p3 could possibly have age >= 50
      expect(selected).toHaveLength(2);
      expect(pruned).toHaveLength(1);
      expect(pruned[0].path).toBe('data/p1.bin');
    });

    it('should prune partitions where max < predicate value', () => {
      const partitions: PartitionInfo[] = [
        createMockPartition('data/p1.bin', 1000, { price: { min: 10, max: 50, nullCount: 0 } }),
        createMockPartition('data/p2.bin', 1000, { price: { min: 100, max: 200, nullCount: 0 } }),
      ];

      const predicates: Predicate[] = [
        { column: 'price', operator: 'gte', value: 75 },
      ];

      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      expect(selected).toHaveLength(1);
      expect(selected[0].path).toBe('data/p2.bin');
      expect(pruned).toHaveLength(1);
    });

    it('should prune partitions where min > predicate value', () => {
      const partitions: PartitionInfo[] = [
        createMockPartition('data/p1.bin', 1000, { score: { min: 0, max: 50, nullCount: 0 } }),
        createMockPartition('data/p2.bin', 1000, { score: { min: 60, max: 100, nullCount: 0 } }),
      ];

      const predicates: Predicate[] = [
        { column: 'score', operator: 'lte', value: 40 },
      ];

      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      expect(selected).toHaveLength(1);
      expect(selected[0].path).toBe('data/p1.bin');
    });

    it('should handle equality predicates with zone maps', () => {
      const partitions: PartitionInfo[] = [
        createMockPartition('data/p1.bin', 1000, { id: { min: 1, max: 1000, nullCount: 0 } }),
        createMockPartition('data/p2.bin', 1000, { id: { min: 1001, max: 2000, nullCount: 0 } }),
        createMockPartition('data/p3.bin', 1000, { id: { min: 2001, max: 3000, nullCount: 0 } }),
      ];

      const predicates: Predicate[] = [
        { column: 'id', operator: 'eq', value: 1500 },
      ];

      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      expect(selected).toHaveLength(1);
      expect(selected[0].path).toBe('data/p2.bin');
      expect(pruned).toHaveLength(2);
    });

    it('should handle BETWEEN predicates with zone maps', () => {
      const partitions: PartitionInfo[] = [
        createMockPartition('data/p1.bin', 1000, { ts: { min: 100, max: 200, nullCount: 0 } }),
        createMockPartition('data/p2.bin', 1000, { ts: { min: 300, max: 400, nullCount: 0 } }),
        createMockPartition('data/p3.bin', 1000, { ts: { min: 500, max: 600, nullCount: 0 } }),
      ];

      const predicates: Predicate[] = [
        { column: 'ts', operator: 'between', value: [250, 350] },
      ];

      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      expect(selected).toHaveLength(1);
      expect(selected[0].path).toBe('data/p2.bin');
    });

    it('should handle null statistics for filtering', () => {
      const partitions: PartitionInfo[] = [
        createMockPartition('data/p1.bin', 1000, { name: { min: 'A', max: 'Z', nullCount: 0 } }),
        createMockPartition('data/p2.bin', 1000, { name: { min: 'A', max: 'Z', nullCount: 500 } }),
        createMockPartition('data/p3.bin', 1000, { name: { min: 'A', max: 'Z', nullCount: 1000 } }), // All null
      ];

      const predicates: Predicate[] = [
        { column: 'name', operator: 'isNull', value: null },
      ];

      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      // Only p2 and p3 have nulls
      expect(selected).toHaveLength(2);
      expect(pruned).toHaveLength(1);
      expect(pruned[0].path).toBe('data/p1.bin');
    });

    it('should combine multiple predicates for pruning', () => {
      const partitions: PartitionInfo[] = [
        createMockPartition('data/p1.bin', 1000, {
          age: { min: 20, max: 40, nullCount: 0 },
          score: { min: 0, max: 50, nullCount: 0 },
        }),
        createMockPartition('data/p2.bin', 1000, {
          age: { min: 20, max: 40, nullCount: 0 },
          score: { min: 60, max: 100, nullCount: 0 },
        }),
        createMockPartition('data/p3.bin', 1000, {
          age: { min: 50, max: 70, nullCount: 0 },
          score: { min: 60, max: 100, nullCount: 0 },
        }),
      ];

      const predicates: Predicate[] = [
        { column: 'age', operator: 'lte', value: 45 },
        { column: 'score', operator: 'gte', value: 55 },
      ];

      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      // Only p2 matches both predicates
      expect(selected).toHaveLength(1);
      expect(selected[0].path).toBe('data/p2.bin');
    });

    it('should estimate selectivity based on zone maps', () => {
      const partition = createMockPartition('data/p1.bin', 1000, {
        value: { min: 0, max: 100, nullCount: 0 },
      });

      const predicate: Predicate = { column: 'value', operator: 'gte', value: 75 };

      const selectivity = optimizer.estimateSelectivity(partition, predicate);

      // Value >= 75 should be ~25% of range [0, 100]
      expect(selectivity).toBeGreaterThan(0);
      expect(selectivity).toBeLessThanOrEqual(1);
      expect(selectivity).toBeCloseTo(0.25, 1);
    });
  });
});

// =============================================================================
// 4. BLOOM FILTER OPTIMIZATION
// =============================================================================

describe('EvoDB Query Engine - Bloom Filter Optimization', () => {
  let bloomManager: BloomFilterManager;

  beforeEach(() => {
    bloomManager = createBloomFilterManager();
  });

  describe('Point Lookups with Bloom Filters', () => {
    it('should use bloom filters for point lookups', () => {
      const partition: PartitionInfo = {
        ...createMockPartition('data/p1.bin', 1000),
        bloomFilter: {
          column: 'user_id',
          sizeBits: 10000,
          numHashFunctions: 7,
          falsePositiveRate: 0.01,
        },
      };

      // Check if a specific value might exist
      const mightExist = bloomManager.mightContain(partition, 'user_id', 'user-12345');

      expect(typeof mightExist).toBe('boolean');
    });

    it('should definitively return false when bloom filter says no', () => {
      const partition: PartitionInfo = {
        ...createMockPartition('data/p1.bin', 1000),
        bloomFilter: {
          column: 'email',
          sizeBits: 10000,
          numHashFunctions: 7,
          falsePositiveRate: 0.01,
        },
      };

      // If bloom filter says no, value definitely doesn't exist
      const predicate: Predicate = { column: 'email', operator: 'eq', value: 'nonexistent@test.com' };
      const mightMatch = bloomManager.checkPredicate(partition, predicate);

      // If false, we can skip this partition entirely
      expect(typeof mightMatch).toBe('boolean');
    });

    it('should track bloom filter statistics', () => {
      const stats = bloomManager.getStats();

      expect(stats.checks).toBeDefined();
      expect(stats.hits).toBeDefined();
      expect(stats.falsePositiveRate).toBeDefined();
    });

    it('should skip partition when bloom filter returns false', async () => {
      const config = createTestConfig();
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'user_id', operator: 'eq', value: 'specific-user-id' },
        ],
      };

      const result = await engine.execute(query);

      // Stats should show bloom filter was used
      expect(result.stats.bloomFilterChecks).toBeGreaterThan(0);
    });
  });

  describe('Bloom Filter Accuracy', () => {
    it('should correctly identify present values (no false negatives)', () => {
      const partition: PartitionInfo = {
        ...createMockPartition('data/p1.bin', 1000),
        bloomFilter: {
          column: 'user_id',
          sizeBits: 10000,
          numHashFunctions: 7,
          falsePositiveRate: 0.01,
        },
      };

      // Register bloom filter with known values
      const values = new Set<string>();
      for (let i = 0; i < 100; i++) {
        values.add(`user-${i}`);
      }
      bloomManager.registerFilter('data/p1.bin', 'user_id', values);

      // All present values MUST return true (no false negatives)
      for (let i = 0; i < 100; i++) {
        const result = bloomManager.mightContain(partition, 'user_id', `user-${i}`);
        expect(result).toBe(true);
      }
    });

    it('should correctly identify absent values with acceptable false positive rate', () => {
      const partition: PartitionInfo = {
        ...createMockPartition('data/p1.bin', 1000),
        bloomFilter: {
          column: 'user_id',
          sizeBits: 10000,
          numHashFunctions: 7,
          falsePositiveRate: 0.01,
        },
      };

      // Register bloom filter with known values (0-999)
      const values = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        values.add(`user-${i}`);
      }
      bloomManager.registerFilter('data/p1.bin', 'user_id', values);

      // Test with values NOT in the filter (1000-1999)
      let falsePositives = 0;
      const testCount = 1000;
      for (let i = 1000; i < 1000 + testCount; i++) {
        const result = bloomManager.mightContain(partition, 'user_id', `user-${i}`);
        if (result) {
          falsePositives++;
        }
      }

      // False positive rate should be reasonable (< 5% for well-sized filter)
      const observedFpr = falsePositives / testCount;
      expect(observedFpr).toBeLessThan(0.05);
    });

    it('should support serialization and deserialization of bloom filters', () => {
      const partition: PartitionInfo = {
        ...createMockPartition('data/p1.bin', 1000),
        bloomFilter: {
          column: 'email',
          sizeBits: 10000,
          numHashFunctions: 7,
          falsePositiveRate: 0.01,
        },
      };

      // Create and register a bloom filter
      const values = new Set<string>(['alice@test.com', 'bob@test.com', 'charlie@test.com']);
      bloomManager.registerFilter('data/p1.bin', 'email', values);

      // Get the raw bytes
      const bytes = bloomManager.getFilterBytes('data/p1.bin', 'email');
      expect(bytes).not.toBeNull();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes!.length).toBeGreaterThan(0);

      // Create a new manager and load from bytes
      const newManager = createBloomFilterManager();
      newManager.registerFilterFromBytes('data/p1.bin', 'email', bytes!);

      // Verify the deserialized filter works correctly
      expect(newManager.mightContain(partition, 'email', 'alice@test.com')).toBe(true);
      expect(newManager.mightContain(partition, 'email', 'bob@test.com')).toBe(true);
      expect(newManager.mightContain(partition, 'email', 'charlie@test.com')).toBe(true);
    });

    it('should track false positive and true negative statistics', () => {
      const partition: PartitionInfo = {
        ...createMockPartition('data/p1.bin', 100),
        bloomFilter: {
          column: 'id',
          sizeBits: 1000,
          numHashFunctions: 7,
          falsePositiveRate: 0.01,
        },
      };

      // Register bloom filter with values
      const values = new Set<string>(['1', '2', '3', '4', '5']);
      bloomManager.registerFilter('data/p1.bin', 'id', values);

      // Query some values
      bloomManager.mightContain(partition, 'id', '1'); // Present
      bloomManager.mightContain(partition, 'id', '6'); // Absent

      // Simulate recording accuracy metrics
      bloomManager.recordTrueNegative(); // When we verify '6' is truly absent

      const stats = bloomManager.getStats();
      expect(stats.checks).toBe(2);
      expect(stats.trueNegatives).toBe(1);
      expect(stats.targetFpr).toBeDefined();
    });

    it('should handle numeric values correctly', () => {
      const partition: PartitionInfo = {
        ...createMockPartition('data/p1.bin', 1000),
        bloomFilter: {
          column: 'order_id',
          sizeBits: 10000,
          numHashFunctions: 7,
          falsePositiveRate: 0.01,
        },
      };

      // Register with numeric values (as strings since bloom filter API takes strings)
      const values = new Set<string>();
      for (let i = 0; i < 100; i++) {
        values.add(String(i));
      }
      bloomManager.registerFilter('data/p1.bin', 'order_id', values);

      // Query with numeric values - should work correctly
      expect(bloomManager.mightContain(partition, 'order_id', 50)).toBe(true);
      expect(bloomManager.mightContain(partition, 'order_id', '50')).toBe(true);
    });

    it('should clear all filters and reset statistics', () => {
      const partition: PartitionInfo = {
        ...createMockPartition('data/p1.bin', 100),
        bloomFilter: {
          column: 'id',
          sizeBits: 1000,
          numHashFunctions: 7,
          falsePositiveRate: 0.01,
        },
      };

      // Register filter and perform checks
      bloomManager.registerFilter('data/p1.bin', 'id', new Set(['1', '2', '3']));
      bloomManager.mightContain(partition, 'id', '1');
      bloomManager.mightContain(partition, 'id', '2');

      // Clear everything
      bloomManager.clear();

      const stats = bloomManager.getStats();
      expect(stats.checks).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.falsePositiveRate).toBe(0);
      expect(bloomManager.hasFilter('data/p1.bin', 'id')).toBe(false);
    });

    it('should report if a filter exists for a partition/column', () => {
      bloomManager.registerFilter('data/p1.bin', 'user_id', new Set(['user-1']));

      expect(bloomManager.hasFilter('data/p1.bin', 'user_id')).toBe(true);
      expect(bloomManager.hasFilter('data/p1.bin', 'email')).toBe(false);
      expect(bloomManager.hasFilter('data/p2.bin', 'user_id')).toBe(false);
    });
  });
});

// =============================================================================
// 5. EDGE CACHE INTEGRATION
// =============================================================================

describe('EvoDB Query Engine - Edge Cache Integration', () => {
  let cacheManager: CacheManager;
  let engine: QueryEngine;

  beforeEach(() => {
    const config = createTestConfig({
      cache: {
        enabled: true,
        ttlSeconds: 3600,
        maxSizeBytes: 100 * 1024 * 1024, // 100MB
        keyPrefix: 'evodb:test:',
      },
    });
    engine = createQueryEngine(config);
    cacheManager = createCacheManager(config);
  });

  describe('Cache Hit/Miss Tracking', () => {
    it('should prefer cached partitions', async () => {
      const partition = createMockPartition('data/cached.bin', 1000);
      partition.isCached = true;
      partition.cacheKey = 'evodb:test:data/cached.bin';

      const { data, fromCache } = await cacheManager.getPartitionData(partition);

      expect(fromCache).toBe(true);
    });

    it('should track cache hits/misses', async () => {
      const query: Query = {
        table: 'com/example/api/users',
      };

      await engine.execute(query);
      const stats = engine.getCacheStats();

      expect(stats.hits).toBeDefined();
      expect(stats.misses).toBeDefined();
      expect(stats.hitRatio).toBeDefined();
    });

    it('should report bytes served from cache', async () => {
      const query: Query = {
        table: 'com/example/api/users',
      };

      const result = await engine.execute(query);

      expect(result.stats.bytesFromCache).toBeDefined();
      expect(result.stats.cacheHitRatio).toBeDefined();
    });

    it('should check if partition is cached', async () => {
      const partition = createMockPartition('data/test.bin', 100);

      const isCached = await cacheManager.isCached(partition);

      expect(typeof isCached).toBe('boolean');
    });

    it('should prefetch partitions into cache', async () => {
      const partitions = [
        createMockPartition('data/p1.bin', 100),
        createMockPartition('data/p2.bin', 100),
      ];

      await cacheManager.prefetch(partitions);

      // After prefetch, partitions should be cached
      for (const p of partitions) {
        const isCached = await cacheManager.isCached(p);
        expect(isCached).toBe(true);
      }
    });
  });

  describe('Cache Management', () => {
    it('should clear entire cache', async () => {
      await cacheManager.clear();

      const stats = cacheManager.getStats();
      expect(stats.bytesFromCache).toBe(0);
    });

    it('should invalidate specific cache entries', async () => {
      const paths = ['data/p1.bin', 'data/p2.bin'];

      await cacheManager.invalidate(paths);

      // Entries should no longer be cached
      for (const path of paths) {
        const partition = createMockPartition(path, 100);
        const isCached = await cacheManager.isCached(partition);
        expect(isCached).toBe(false);
      }
    });

    it('should invalidate cache via engine', async () => {
      await engine.invalidateCache(['data/stale.bin']);

      // Cache should be invalidated
    });
  });
});

// =============================================================================
// 6. RESULT HANDLING
// =============================================================================

describe('EvoDB Query Engine - Result Handling', () => {
  let engine: QueryEngine;
  let processor: ResultProcessor;

  beforeEach(() => {
    const config = createTestConfig();
    engine = createQueryEngine(config);
    processor = createResultProcessor();
  });

  describe('Streaming Results', () => {
    it('should stream results for large queries', async () => {
      const query: Query = {
        table: 'com/example/api/large_events',
        limit: 100000,
      };

      const stream = await engine.executeStream(query);

      let rowCount = 0;
      for await (const row of stream.rows) {
        rowCount++;
        expect(row).toBeDefined();
        if (rowCount >= 100) break; // Don't iterate entire stream
      }

      expect(rowCount).toBeGreaterThan(0);
    });

    it('should allow cancellation of streaming query', async () => {
      const query: Query = {
        table: 'com/example/api/large_events',
      };

      const stream = await engine.executeStream(query);

      // Start consuming
      let count = 0;
      for await (const row of stream.rows) {
        count++;
        if (count >= 10) {
          await stream.cancel();
          break;
        }
      }

      expect(stream.isRunning()).toBe(false);
    });

    it('should provide stats after streaming completes', async () => {
      const query: Query = {
        table: 'com/example/api/events',
        limit: 100,
      };

      const stream = await engine.executeStream(query);

      // Consume all rows
      for await (const _ of stream.rows) {
        // consume
      }

      const stats = await stream.getStats();
      expect(stats.executionTimeMs).toBeDefined();
      expect(stats.rowsScanned).toBeGreaterThan(0);
    });
  });

  describe('Result Limiting', () => {
    it('should limit results', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        limit: 10,
      };

      const result = await engine.execute(query);

      expect(result.rows.length).toBeLessThanOrEqual(10);
    });

    it('should apply offset', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        limit: 10,
        offset: 5,
      };

      const result = await engine.execute(query);

      expect(result.rows.length).toBeLessThanOrEqual(10);
    });

    it('should indicate hasMore when more rows available', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        limit: 5,
      };

      const result = await engine.execute(query);

      if (result.totalRowCount > 5) {
        expect(result.hasMore).toBe(true);
      }
    });

    it('should provide continuation token for pagination', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        limit: 10,
      };

      const result = await engine.execute(query);

      if (result.hasMore) {
        expect(result.continuationToken).toBeDefined();
      }
    });
  });

  describe('Result Sorting', () => {
    it('should sort results ascending', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        orderBy: [{ column: 'name', direction: 'asc' }],
      };

      const result = await engine.execute(query);

      for (let i = 1; i < result.rows.length; i++) {
        const prev = result.rows[i - 1].name as string;
        const curr = result.rows[i].name as string;
        expect(curr.localeCompare(prev)).toBeGreaterThanOrEqual(0);
      }
    });

    it('should sort results descending', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        orderBy: [{ column: 'total', direction: 'desc' }],
      };

      const result = await engine.execute(query);

      for (let i = 1; i < result.rows.length; i++) {
        const prev = result.rows[i - 1].total as number;
        const curr = result.rows[i].total as number;
        expect(curr).toBeLessThanOrEqual(prev);
      }
    });

    it('should sort by multiple columns', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        orderBy: [
          { column: 'country', direction: 'asc' },
          { column: 'name', direction: 'asc' },
        ],
      };

      const result = await engine.execute(query);

      for (let i = 1; i < result.rows.length; i++) {
        const prevCountry = result.rows[i - 1].country as string;
        const currCountry = result.rows[i].country as string;

        if (prevCountry === currCountry) {
          const prevName = result.rows[i - 1].name as string;
          const currName = result.rows[i].name as string;
          expect(currName.localeCompare(prevName)).toBeGreaterThanOrEqual(0);
        } else {
          expect(currCountry.localeCompare(prevCountry)).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should handle nulls in sorting', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        orderBy: [{ column: 'deleted_at', direction: 'asc', nulls: 'last' }],
      };

      const result = await engine.execute(query);

      // Nulls should be at the end
      let seenNull = false;
      for (const row of result.rows) {
        if (row.deleted_at === null) {
          seenNull = true;
        } else if (seenNull) {
          // Non-null after null - this is wrong
          expect(row.deleted_at).toBeNull();
        }
      }
    });
  });

  describe('Result Processing Utilities', () => {
    it('should sort rows using processor', () => {
      const rows = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];

      const sorted = processor.sort(rows, [{ column: 'name', direction: 'asc' }]);

      expect(sorted[0].name).toBe('Alice');
      expect(sorted[1].name).toBe('Bob');
      expect(sorted[2].name).toBe('Charlie');
    });

    it('should apply limit and offset using processor', () => {
      const rows = [
        { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 },
      ];

      const limited = processor.limit(rows, 2, 1);

      expect(limited).toEqual([{ id: 2 }, { id: 3 }]);
    });
  });
});

// =============================================================================
// 7. QUERY PLANNING
// =============================================================================

describe('EvoDB Query Engine - Query Planning', () => {
  let planner: QueryPlanner;

  beforeEach(() => {
    const config = createTestConfig();
    planner = createQueryPlanner(config);
  });

  describe('Plan Creation', () => {
    it('should create execution plan for simple scan', async () => {
      const query: Query = {
        table: 'com/example/api/users',
      };

      const plan = await planner.createPlan(query);

      expect(plan.planId).toBeDefined();
      expect(plan.query).toBe(query);
      expect(plan.rootOperator).toBeDefined();
      expect(plan.rootOperator.type).toBe('scan');
    });

    it('should create plan with filter operator', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'active' },
        ],
      };

      const plan = await planner.createPlan(query);

      // Should have filter operator
      expect(plan.rootOperator.type).toBe('filter');
      if (plan.rootOperator.type === 'filter') {
        expect(plan.rootOperator.predicates).toHaveLength(1);
      }
    });

    it('should create plan with aggregation operator', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        aggregations: [
          { function: 'count', column: null, alias: 'total' },
        ],
      };

      const plan = await planner.createPlan(query);

      // Should have aggregate operator
      const findAggregateOp = (op: PlanOperator): PlanOperator | null => {
        if (op.type === 'aggregate') return op;
        if ('input' in op) return findAggregateOp(op.input);
        return null;
      };

      const aggOp = findAggregateOp(plan.rootOperator);
      expect(aggOp).not.toBeNull();
    });

    it('should show selected partitions in plan', async () => {
      const query: Query = {
        table: 'com/example/api/events',
      };

      const plan = await planner.createPlan(query);

      expect(plan.selectedPartitions).toBeDefined();
      expect(Array.isArray(plan.selectedPartitions)).toBe(true);
    });

    it('should show pruned partitions in plan', async () => {
      const query: Query = {
        table: 'com/example/api/events',
        predicates: [
          { column: 'timestamp', operator: 'gte', value: Date.now() - 86400000 },
        ],
      };

      const plan = await planner.createPlan(query);

      expect(plan.prunedPartitions).toBeDefined();
      expect(Array.isArray(plan.prunedPartitions)).toBe(true);
      // If partitions were pruned, should indicate reason
      for (const pruned of plan.prunedPartitions) {
        expect(pruned.reason).toBeDefined();
      }
    });

    it('should indicate zone map usage in plan', async () => {
      const query: Query = {
        table: 'com/example/api/events',
        predicates: [
          { column: 'value', operator: 'gt', value: 100 },
        ],
      };

      const plan = await planner.createPlan(query);

      expect(plan.usesZoneMaps).toBeDefined();
      expect(typeof plan.usesZoneMaps).toBe('boolean');
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate query cost', async () => {
      const query: Query = {
        table: 'com/example/api/large_table',
      };

      const cost = await planner.estimateCost(query);

      expect(cost).toBeGreaterThan(0);
    });

    it('should provide detailed cost breakdown in plan', async () => {
      const query: Query = {
        table: 'com/example/api/users',
      };

      const plan = await planner.createPlan(query);

      expect(plan.estimatedCost).toBeDefined();
      expect(plan.estimatedCost.rowsToScan).toBeDefined();
      expect(plan.estimatedCost.bytesToRead).toBeDefined();
      expect(plan.estimatedCost.memoryBytes).toBeDefined();
      expect(plan.estimatedCost.totalCost).toBeDefined();
    });

    it('should estimate lower cost for filtered queries', async () => {
      const fullScanQuery: Query = {
        table: 'com/example/api/events',
      };

      const filteredQuery: Query = {
        table: 'com/example/api/events',
        predicates: [
          { column: 'event_type', operator: 'eq', value: 'click' },
        ],
      };

      const fullCost = await planner.estimateCost(fullScanQuery);
      const filteredCost = await planner.estimateCost(filteredQuery);

      expect(filteredCost).toBeLessThan(fullCost);
    });
  });

  describe('Plan Optimization', () => {
    it('should optimize plan with predicate pushdown', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'active' },
        ],
        projection: { columns: ['id', 'name'] },
      };

      const plan = await planner.createPlan(query);
      const optimized = await planner.optimize(plan);

      // Optimized plan should push predicates down to scan
      expect(optimized.estimatedCost.totalCost).toBeLessThanOrEqual(plan.estimatedCost.totalCost);
    });

    it('should optimize plan with projection pushdown', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        projection: { columns: ['id', 'name'] },
      };

      const plan = await planner.createPlan(query);

      // Scan operator should only read required columns
      if (plan.rootOperator.type === 'scan') {
        expect(plan.rootOperator.columns).toContain('id');
        expect(plan.rootOperator.columns).toContain('name');
        expect(plan.rootOperator.columns.length).toBeLessThanOrEqual(2);
      }
    });
  });
});

// =============================================================================
// 8. TIME TRAVEL QUERIES
// =============================================================================

describe('EvoDB Query Engine - Time Travel', () => {
  let engine: QueryEngine;

  beforeEach(() => {
    const config = createTestConfig();
    engine = createQueryEngine(config);
  });

  describe('Snapshot Queries', () => {
    it('should query specific snapshot by ID', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        snapshotId: 'snap-20260101-001',
      };

      const result = await engine.execute(query);

      // Result should be from the specific snapshot
      expect(result.rows).toBeDefined();
    });

    it('should query as-of specific timestamp', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        asOfTimestamp: Date.now() - 86400000, // 1 day ago
      };

      const result = await engine.execute(query);

      expect(result.rows).toBeDefined();
    });
  });
});

// =============================================================================
// 9. ERROR HANDLING AND EDGE CASES
// =============================================================================

describe('EvoDB Query Engine - Error Handling', () => {
  let engine: QueryEngine;

  beforeEach(() => {
    const config = createTestConfig();
    engine = createQueryEngine(config);
  });

  describe('Timeout Handling', () => {
    it('should respect query timeout', async () => {
      const query: Query = {
        table: 'com/example/api/huge_table',
        hints: { timeoutMs: 100 },
      };

      await expect(engine.execute(query)).rejects.toThrow(/timeout/i);
    });
  });

  describe('Memory Limits', () => {
    it('should respect memory limits', async () => {
      const query: Query = {
        table: 'com/example/api/huge_table',
        hints: { memoryLimitBytes: 1024 }, // Very small limit
      };

      await expect(engine.execute(query)).rejects.toThrow(/memory/i);
    });
  });

  describe('Invalid Queries', () => {
    it('should reject query with non-existent table', async () => {
      const query: Query = {
        table: 'com/example/api/nonexistent',
      };

      await expect(engine.execute(query)).rejects.toThrow(/not found|does not exist/i);
    });

    it('should reject query with invalid column reference', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'nonexistent_column', operator: 'eq', value: 'test' },
        ],
      };

      await expect(engine.execute(query)).rejects.toThrow(/column|not found/i);
    });
  });
});

// =============================================================================
// 10. PARTITION SCANNER TESTS
// =============================================================================

describe('EvoDB Query Engine - Partition Scanner', () => {
  let scanner: PartitionScanner;

  beforeEach(() => {
    const config = createTestConfig();
    scanner = new PartitionScanner(config.bucket, config);
  });

  describe('Partition Scanning', () => {
    it('should scan all rows from partition', async () => {
      const partition = createMockPartition('data/test.bin', 100);

      const rows = await scanner.scan(partition);

      expect(Array.isArray(rows)).toBe(true);
    });

    it('should scan with column projection', async () => {
      const partition = createMockPartition('data/test.bin', 100);

      const rows = await scanner.scanWithProjection(partition, ['id', 'name']);

      for (const row of rows) {
        const keys = Object.keys(row);
        expect(keys).toContain('id');
        expect(keys).toContain('name');
      }
    });

    it('should scan with predicate filtering', async () => {
      const partition = createMockPartition('data/test.bin', 100, {
        status: { min: 'active', max: 'pending', nullCount: 0 },
      });

      const predicates: Predicate[] = [
        { column: 'status', operator: 'eq', value: 'active' },
      ];

      const rows = await scanner.scanWithFilter(partition, predicates);

      for (const row of rows) {
        expect(row.status).toBe('active');
      }
    });

    it('should stream rows from partition', async () => {
      const partition = createMockPartition('data/test.bin', 100);

      let count = 0;
      for await (const row of scanner.scanStream(partition)) {
        count++;
        expect(row).toBeDefined();
      }

      expect(count).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// 11. STATISTICS AND METRICS
// =============================================================================

describe('EvoDB Query Engine - Statistics', () => {
  let engine: QueryEngine;

  beforeEach(() => {
    const config = createTestConfig({ enableStats: true });
    engine = createQueryEngine(config);
  });

  describe('Query Statistics', () => {
    it('should track execution time', async () => {
      const query: Query = {
        table: 'com/example/api/users',
      };

      const result = await engine.execute(query);

      expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.stats.planningTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.stats.ioTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track partitions scanned vs pruned', async () => {
      const query: Query = {
        table: 'com/example/api/events',
        predicates: [
          { column: 'timestamp', operator: 'gte', value: Date.now() - 3600000 },
        ],
      };

      const result = await engine.execute(query);

      expect(result.stats.partitionsScanned).toBeGreaterThanOrEqual(0);
      expect(result.stats.partitionsPruned).toBeGreaterThanOrEqual(0);
    });

    it('should track rows scanned vs matched', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'active' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.stats.rowsScanned).toBeGreaterThanOrEqual(result.stats.rowsMatched);
    });

    it('should track zone map effectiveness', async () => {
      const query: Query = {
        table: 'com/example/api/events',
        predicates: [
          { column: 'value', operator: 'gt', value: 100 },
        ],
      };

      const result = await engine.execute(query);

      expect(result.stats.zoneMapEffectiveness).toBeGreaterThanOrEqual(0);
      expect(result.stats.zoneMapEffectiveness).toBeLessThanOrEqual(1);
    });

    it('should track peak memory usage', async () => {
      const query: Query = {
        table: 'com/example/api/users',
      };

      const result = await engine.execute(query);

      expect(result.stats.peakMemoryBytes).toBeGreaterThan(0);
    });
  });
});
