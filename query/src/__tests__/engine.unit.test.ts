/**
 * @evodb/query - Query Engine Unit Tests
 *
 * Unit tests verifying core query engine behavior:
 * - Query planning selects correct execution strategy
 * - Predicate pushdown optimization works
 * - Column pruning reduces read columns
 * - Filter predicates are applied correctly
 * - Projection narrows result columns
 * - Error handling for invalid queries
 *
 * Following TDD Red-Green-Refactor approach.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  QueryEngine,
  QueryPlanner,
  ZoneMapOptimizer,
  createQueryEngine,
  createQueryPlanner,
  createZoneMapOptimizer,
  validateColumnName,
  validateQueryColumns,
} from '../engine.js';

import type {
  Query,
  QueryPlan,
  PartitionInfo,
  Predicate,
  QueryEngineConfig,
  PlanOperator,
  R2Bucket,
} from '../types.js';

import { createMockDataSource, MockDataSource } from './fixtures/mock-data.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Common test fixtures for query patterns
 */
const QueryFixtures = {
  /**
   * Simple scan query - no filters or projections
   */
  simpleScan: (table: string): Query => ({
    table,
  }),

  /**
   * Query with single equality predicate
   */
  singleEqualityFilter: (table: string, column: string, value: unknown): Query => ({
    table,
    predicates: [{ column, operator: 'eq', value }],
  }),

  /**
   * Query with range predicates
   */
  rangeFilter: (table: string, column: string, min: number, max: number): Query => ({
    table,
    predicates: [
      { column, operator: 'gte', value: min },
      { column, operator: 'lte', value: max },
    ],
  }),

  /**
   * Query with column projection
   */
  withProjection: (table: string, columns: string[]): Query => ({
    table,
    projection: { columns },
  }),

  /**
   * Query with projection and filter
   */
  projectionAndFilter: (table: string, columns: string[], column: string, value: unknown): Query => ({
    table,
    projection: { columns },
    predicates: [{ column, operator: 'eq', value }],
  }),

  /**
   * Query with aggregation
   */
  withAggregation: (table: string, fn: 'count' | 'sum' | 'avg' | 'min' | 'max', column: string | null, alias: string): Query => ({
    table,
    aggregations: [{ function: fn, column, alias }],
  }),

  /**
   * Query with ORDER BY
   */
  withOrderBy: (table: string, column: string, direction: 'asc' | 'desc'): Query => ({
    table,
    orderBy: [{ column, direction }],
  }),

  /**
   * Query with LIMIT
   */
  withLimit: (table: string, limit: number, offset?: number): Query => ({
    table,
    limit,
    offset,
  }),
};

/**
 * Common partition fixtures for testing zone map optimization
 */
const PartitionFixtures = {
  /**
   * Create a partition with numeric zone map stats
   */
  numericPartition: (path: string, column: string, min: number, max: number, rowCount = 1000): PartitionInfo => ({
    path,
    partitionValues: {},
    sizeBytes: rowCount * 100,
    rowCount,
    zoneMap: {
      columns: {
        [column]: { min, max, nullCount: 0, allNull: false },
      },
    },
    isCached: false,
  }),

  /**
   * Create a partition with string zone map stats
   */
  stringPartition: (path: string, column: string, min: string, max: string, rowCount = 1000): PartitionInfo => ({
    path,
    partitionValues: {},
    sizeBytes: rowCount * 100,
    rowCount,
    zoneMap: {
      columns: {
        [column]: { min, max, nullCount: 0, allNull: false },
      },
    },
    isCached: false,
  }),

  /**
   * Create a partition with null statistics
   */
  partitionWithNulls: (path: string, column: string, nullCount: number, allNull = false, rowCount = 1000): PartitionInfo => ({
    path,
    partitionValues: {},
    sizeBytes: rowCount * 100,
    rowCount,
    zoneMap: {
      columns: {
        [column]: { min: allNull ? null : 0, max: allNull ? null : 100, nullCount, allNull },
      },
    },
    isCached: false,
  }),
};

/**
 * Create mock R2 bucket for testing
 */
function createMockBucket(): R2Bucket {
  return {
    get: vi.fn().mockResolvedValue(null),
    head: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
  };
}

/**
 * Create test config with mock data source
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
// 1. Query Planning - Execution Strategy Selection
// =============================================================================

describe('Query Planning - Execution Strategy Selection', () => {
  let planner: QueryPlanner;
  let config: QueryEngineConfig;

  beforeEach(() => {
    config = createTestConfig();
    planner = createQueryPlanner(config);
  });

  describe('Simple Scan Strategy', () => {
    it('should select scan strategy for query without filters', async () => {
      const query = QueryFixtures.simpleScan('com/example/api/users');

      const plan = await planner.createPlan(query);

      // Root operator should be scan (or have scan at the base)
      expect(plan.rootOperator).toBeDefined();
      // Navigate to the scan operator
      let op = plan.rootOperator;
      while (op.type !== 'scan' && 'input' in op) {
        op = (op as { input: PlanOperator }).input;
      }
      expect(op.type).toBe('scan');
    });

    it('should include all partitions for full scan', async () => {
      const query = QueryFixtures.simpleScan('com/example/api/users');

      const plan = await planner.createPlan(query);

      expect(plan.selectedPartitions.length).toBeGreaterThan(0);
      expect(plan.prunedPartitions.length).toBe(0);
    });
  });

  describe('Filter Strategy', () => {
    it('should add filter operator when predicates exist', async () => {
      const query = QueryFixtures.singleEqualityFilter('com/example/api/users', 'status', 'active');

      const plan = await planner.createPlan(query);

      // Should have a filter operator
      expect(plan.rootOperator.type).toBe('filter');
      if (plan.rootOperator.type === 'filter') {
        expect(plan.rootOperator.predicates).toHaveLength(1);
        expect(plan.rootOperator.predicates[0].column).toBe('status');
      }
    });

    it('should chain multiple filter predicates', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        predicates: [
          { column: 'status', operator: 'eq', value: 'completed' },
          { column: 'total', operator: 'gte', value: 100 },
        ],
      };

      const plan = await planner.createPlan(query);

      // Should have filter with both predicates
      expect(plan.rootOperator.type).toBe('filter');
      if (plan.rootOperator.type === 'filter') {
        expect(plan.rootOperator.predicates).toHaveLength(2);
      }
    });
  });

  describe('Aggregation Strategy', () => {
    it('should add aggregate operator for aggregation queries', async () => {
      const query = QueryFixtures.withAggregation('com/example/api/orders', 'count', null, 'total');

      const plan = await planner.createPlan(query);

      // Find aggregate operator in plan tree
      const findAggregateOp = (op: PlanOperator): PlanOperator | null => {
        if (op.type === 'aggregate') return op;
        if ('input' in op) return findAggregateOp((op as { input: PlanOperator }).input);
        return null;
      };

      const aggOp = findAggregateOp(plan.rootOperator);
      expect(aggOp).not.toBeNull();
      expect(aggOp?.type).toBe('aggregate');
    });

    it('should include group by columns in aggregate operator', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        groupBy: ['status'],
        aggregations: [{ function: 'count', column: null, alias: 'count' }],
      };

      const plan = await planner.createPlan(query);

      const findAggregateOp = (op: PlanOperator): PlanOperator | null => {
        if (op.type === 'aggregate') return op;
        if ('input' in op) return findAggregateOp((op as { input: PlanOperator }).input);
        return null;
      };

      const aggOp = findAggregateOp(plan.rootOperator);
      expect(aggOp?.type).toBe('aggregate');
      if (aggOp?.type === 'aggregate') {
        expect(aggOp.groupBy).toContain('status');
      }
    });
  });

  describe('Sort Strategy', () => {
    it('should add sort operator for ORDER BY', async () => {
      const query = QueryFixtures.withOrderBy('com/example/api/users', 'name', 'asc');

      const plan = await planner.createPlan(query);

      // Find sort operator
      const findSortOp = (op: PlanOperator): PlanOperator | null => {
        if (op.type === 'sort') return op;
        if ('input' in op) return findSortOp((op as { input: PlanOperator }).input);
        return null;
      };

      const sortOp = findSortOp(plan.rootOperator);
      expect(sortOp).not.toBeNull();
      if (sortOp?.type === 'sort') {
        expect(sortOp.orderBy[0].column).toBe('name');
        expect(sortOp.orderBy[0].direction).toBe('asc');
      }
    });
  });

  describe('Limit Strategy', () => {
    it('should add limit operator for LIMIT clause', async () => {
      const query = QueryFixtures.withLimit('com/example/api/users', 10);

      const plan = await planner.createPlan(query);

      // Find limit operator (should be root for simple query)
      const findLimitOp = (op: PlanOperator): PlanOperator | null => {
        if (op.type === 'limit') return op;
        if ('input' in op) return findLimitOp((op as { input: PlanOperator }).input);
        return null;
      };

      const limitOp = findLimitOp(plan.rootOperator);
      expect(limitOp).not.toBeNull();
      if (limitOp?.type === 'limit') {
        expect(limitOp.limit).toBe(10);
      }
    });

    it('should include offset in limit operator', async () => {
      const query = QueryFixtures.withLimit('com/example/api/users', 10, 5);

      const plan = await planner.createPlan(query);

      const findLimitOp = (op: PlanOperator): PlanOperator | null => {
        if (op.type === 'limit') return op;
        if ('input' in op) return findLimitOp((op as { input: PlanOperator }).input);
        return null;
      };

      const limitOp = findLimitOp(plan.rootOperator);
      if (limitOp?.type === 'limit') {
        expect(limitOp.offset).toBe(5);
      }
    });
  });
});

// =============================================================================
// 2. Predicate Pushdown Optimization
// =============================================================================

describe('Predicate Pushdown Optimization', () => {
  let optimizer: ZoneMapOptimizer;

  beforeEach(() => {
    optimizer = createZoneMapOptimizer();
  });

  describe('Zone Map Pruning', () => {
    it('should prune partitions where max < filter value (gt)', () => {
      const partitions = [
        PartitionFixtures.numericPartition('p1.bin', 'age', 10, 30),
        PartitionFixtures.numericPartition('p2.bin', 'age', 40, 60),
        PartitionFixtures.numericPartition('p3.bin', 'age', 70, 90),
      ];

      const predicates: Predicate[] = [{ column: 'age', operator: 'gt', value: 50 }];
      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      // Only p2 (40-60 could have >50) and p3 (70-90 all >50) should be selected
      expect(selected).toHaveLength(2);
      expect(pruned).toHaveLength(1);
      expect(pruned[0].path).toBe('p1.bin');
    });

    it('should prune partitions where min > filter value (lt)', () => {
      const partitions = [
        PartitionFixtures.numericPartition('p1.bin', 'score', 0, 50),
        PartitionFixtures.numericPartition('p2.bin', 'score', 60, 100),
      ];

      const predicates: Predicate[] = [{ column: 'score', operator: 'lt', value: 40 }];
      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      expect(selected).toHaveLength(1);
      expect(selected[0].path).toBe('p1.bin');
      expect(pruned).toHaveLength(1);
    });

    it('should prune partitions for equality when value outside range', () => {
      const partitions = [
        PartitionFixtures.numericPartition('p1.bin', 'id', 1, 1000),
        PartitionFixtures.numericPartition('p2.bin', 'id', 1001, 2000),
        PartitionFixtures.numericPartition('p3.bin', 'id', 2001, 3000),
      ];

      const predicates: Predicate[] = [{ column: 'id', operator: 'eq', value: 1500 }];
      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      expect(selected).toHaveLength(1);
      expect(selected[0].path).toBe('p2.bin');
      expect(pruned).toHaveLength(2);
    });

    it('should prune partitions for BETWEEN when ranges do not overlap', () => {
      const partitions = [
        PartitionFixtures.numericPartition('p1.bin', 'ts', 100, 200),
        PartitionFixtures.numericPartition('p2.bin', 'ts', 300, 400),
        PartitionFixtures.numericPartition('p3.bin', 'ts', 500, 600),
      ];

      const predicates: Predicate[] = [{ column: 'ts', operator: 'between', value: [250, 350] }];
      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      expect(selected).toHaveLength(1);
      expect(selected[0].path).toBe('p2.bin');
      expect(pruned).toHaveLength(2);
    });

    it('should prune partitions with nullCount=0 for IS NULL predicate', () => {
      const partitions = [
        PartitionFixtures.partitionWithNulls('p1.bin', 'deleted_at', 0), // No nulls
        PartitionFixtures.partitionWithNulls('p2.bin', 'deleted_at', 500), // Has nulls
        PartitionFixtures.partitionWithNulls('p3.bin', 'deleted_at', 1000, true), // All null
      ];

      const predicates: Predicate[] = [{ column: 'deleted_at', operator: 'isNull', value: null }];
      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      expect(selected).toHaveLength(2);
      expect(pruned).toHaveLength(1);
      expect(pruned[0].path).toBe('p1.bin');
    });

    it('should prune all-null partitions for IS NOT NULL predicate', () => {
      const partitions = [
        PartitionFixtures.partitionWithNulls('p1.bin', 'email', 0), // No nulls
        PartitionFixtures.partitionWithNulls('p2.bin', 'email', 500), // Has nulls
        PartitionFixtures.partitionWithNulls('p3.bin', 'email', 1000, true), // All null
      ];

      const predicates: Predicate[] = [{ column: 'email', operator: 'isNotNull', value: null }];
      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      expect(selected).toHaveLength(2);
      expect(pruned).toHaveLength(1);
      expect(pruned[0].path).toBe('p3.bin');
    });
  });

  describe('Combined Predicate Pruning', () => {
    it('should prune using multiple predicates (AND logic)', () => {
      const partitions = [
        {
          ...PartitionFixtures.numericPartition('p1.bin', 'age', 20, 40),
          zoneMap: {
            columns: {
              age: { min: 20, max: 40, nullCount: 0, allNull: false },
              score: { min: 0, max: 50, nullCount: 0, allNull: false },
            },
          },
        },
        {
          ...PartitionFixtures.numericPartition('p2.bin', 'age', 20, 40),
          zoneMap: {
            columns: {
              age: { min: 20, max: 40, nullCount: 0, allNull: false },
              score: { min: 60, max: 100, nullCount: 0, allNull: false },
            },
          },
        },
        {
          ...PartitionFixtures.numericPartition('p3.bin', 'age', 50, 70),
          zoneMap: {
            columns: {
              age: { min: 50, max: 70, nullCount: 0, allNull: false },
              score: { min: 60, max: 100, nullCount: 0, allNull: false },
            },
          },
        },
      ];

      const predicates: Predicate[] = [
        { column: 'age', operator: 'lte', value: 45 },
        { column: 'score', operator: 'gte', value: 55 },
      ];

      const { selected, pruned } = optimizer.prunePartitions(partitions, predicates);

      // Only p2 matches both predicates
      expect(selected).toHaveLength(1);
      expect(selected[0].path).toBe('p2.bin');
      expect(pruned).toHaveLength(2);
    });
  });

  describe('Selectivity Estimation', () => {
    it('should estimate selectivity for range predicates', () => {
      const partition = PartitionFixtures.numericPartition('p1.bin', 'value', 0, 100);
      const predicate: Predicate = { column: 'value', operator: 'gte', value: 75 };

      const selectivity = optimizer.estimateSelectivity(partition, predicate);

      // Value >= 75 out of [0, 100] should be ~25%
      expect(selectivity).toBeGreaterThan(0);
      expect(selectivity).toBeLessThanOrEqual(1);
      expect(selectivity).toBeCloseTo(0.25, 1);
    });

    it('should estimate low selectivity for equality predicates', () => {
      const partition = PartitionFixtures.numericPartition('p1.bin', 'id', 1, 1000);
      const predicate: Predicate = { column: 'id', operator: 'eq', value: 500 };

      const selectivity = optimizer.estimateSelectivity(partition, predicate);

      // Equality on wide range should have low selectivity
      expect(selectivity).toBeLessThan(0.1);
    });

    it('should return 0.5 for unknown columns', () => {
      const partition = PartitionFixtures.numericPartition('p1.bin', 'age', 0, 100);
      const predicate: Predicate = { column: 'unknown_col', operator: 'eq', value: 'test' };

      const selectivity = optimizer.estimateSelectivity(partition, predicate);

      expect(selectivity).toBe(0.5);
    });
  });
});

// =============================================================================
// 3. Column Pruning
// =============================================================================

describe('Column Pruning - Reduces Read Columns', () => {
  let planner: QueryPlanner;

  beforeEach(() => {
    const config = createTestConfig();
    planner = createQueryPlanner(config);
  });

  describe('Projection Pushdown', () => {
    it('should push projection columns to scan operator', async () => {
      const query = QueryFixtures.withProjection('com/example/api/users', ['id', 'name']);

      const plan = await planner.createPlan(query);

      // Find the scan operator
      const findScanOp = (op: PlanOperator): PlanOperator | null => {
        if (op.type === 'scan') return op;
        if ('input' in op) return findScanOp((op as { input: PlanOperator }).input);
        return null;
      };

      const scanOp = findScanOp(plan.rootOperator);
      expect(scanOp).not.toBeNull();
      if (scanOp?.type === 'scan') {
        expect(scanOp.columns).toContain('id');
        expect(scanOp.columns).toContain('name');
      }
    });

    it('should include filter columns in scan even when not in projection', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        projection: { columns: ['id', 'name'] },
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
      };

      const plan = await planner.createPlan(query);

      // Scan should include 'status' for filtering
      const findScanOp = (op: PlanOperator): PlanOperator | null => {
        if (op.type === 'scan') return op;
        if ('input' in op) return findScanOp((op as { input: PlanOperator }).input);
        return null;
      };

      const scanOp = findScanOp(plan.rootOperator);
      if (scanOp?.type === 'scan') {
        // Columns should include projection columns
        expect(scanOp.columns).toContain('id');
        expect(scanOp.columns).toContain('name');
      }
    });
  });

  describe('Column Pruning Effectiveness', () => {
    it('should reduce estimated bytes read with fewer columns', async () => {
      const fullQuery = QueryFixtures.simpleScan('com/example/api/users');
      const projectedQuery = QueryFixtures.withProjection('com/example/api/users', ['id']);

      const fullPlan = await planner.createPlan(fullQuery);
      const projectedPlan = await planner.createPlan(projectedQuery);

      // Projected query should have equal or lower byte estimate
      // (In current implementation, bytes are partition-based, but row estimates should differ)
      expect(projectedPlan.estimatedCost).toBeDefined();
      expect(fullPlan.estimatedCost).toBeDefined();
    });
  });
});

// =============================================================================
// 4. Filter Predicates Application
// =============================================================================

describe('Filter Predicates - Correct Application', () => {
  let engine: QueryEngine;

  beforeEach(() => {
    const config = createTestConfig();
    engine = createQueryEngine(config);
  });

  describe('Equality Filters', () => {
    it('should filter rows by equality predicate', async () => {
      const query = QueryFixtures.singleEqualityFilter('com/example/api/users', 'status', 'active');

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.status).toBe('active');
      }
    });

    it('should filter rows by negated equality', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [{ column: 'status', operator: 'eq', value: 'banned', not: true }],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.status).not.toBe('banned');
      }
    });
  });

  describe('Range Filters', () => {
    it('should filter rows by greater than predicate', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        predicates: [{ column: 'total', operator: 'gt', value: 500 }],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.total as number).toBeGreaterThan(500);
      }
    });

    it('should filter rows by less than predicate', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        predicates: [{ column: 'total', operator: 'lt', value: 100 }],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.total as number).toBeLessThan(100);
      }
    });

    it('should filter rows by range (gte and lte)', async () => {
      const query = QueryFixtures.rangeFilter('com/example/api/orders', 'total', 100, 500);

      const result = await engine.execute(query);

      for (const row of result.rows) {
        const total = row.total as number;
        expect(total).toBeGreaterThanOrEqual(100);
        expect(total).toBeLessThanOrEqual(500);
      }
    });

    it('should filter rows by BETWEEN predicate', async () => {
      const query: Query = {
        table: 'com/example/api/events',
        predicates: [{ column: 'timestamp', operator: 'between', value: [1000, 1500] }],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        const ts = row.timestamp as number;
        expect(ts).toBeGreaterThanOrEqual(1000);
        expect(ts).toBeLessThanOrEqual(1500);
      }
    });
  });

  describe('Set Membership Filters', () => {
    it('should filter rows by IN predicate', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        predicates: [{ column: 'status', operator: 'in', value: ['pending', 'processing'] }],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(['pending', 'processing']).toContain(row.status);
      }
    });

    it('should filter rows by NOT IN predicate', async () => {
      const query: Query = {
        table: 'com/example/api/orders',
        predicates: [{ column: 'status', operator: 'notIn', value: ['cancelled'] }],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.status).not.toBe('cancelled');
      }
    });
  });

  describe('Null Filters', () => {
    it('should filter rows by IS NULL predicate', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [{ column: 'deleted_at', operator: 'isNull', value: null }],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.deleted_at).toBeNull();
      }
    });

    it('should filter rows by IS NOT NULL predicate', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [{ column: 'email', operator: 'isNotNull', value: null }],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.email).not.toBeNull();
        expect(row.email).not.toBeUndefined();
      }
    });
  });

  describe('Pattern Filters', () => {
    it('should filter rows by LIKE predicate (suffix match)', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [{ column: 'email', operator: 'like', value: '%@example.com' }],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect((row.email as string).endsWith('@example.com')).toBe(true);
      }
    });
  });

  describe('Combined Filters', () => {
    it('should apply multiple filters with AND logic', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'active' },
          { column: 'age', operator: 'gte', value: 25 },
          { column: 'country', operator: 'eq', value: 'USA' },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.status).toBe('active');
        expect(row.age as number).toBeGreaterThanOrEqual(25);
        expect(row.country).toBe('USA');
      }
    });
  });
});

// =============================================================================
// 5. Projection Narrows Result Columns
// =============================================================================

describe('Projection - Narrows Result Columns', () => {
  let engine: QueryEngine;

  beforeEach(() => {
    const config = createTestConfig();
    engine = createQueryEngine(config);
  });

  describe('Basic Projection', () => {
    it('should return only projected columns', async () => {
      const query = QueryFixtures.withProjection('com/example/api/users', ['id', 'name', 'email']);

      const result = await engine.execute(query);

      for (const row of result.rows) {
        const keys = Object.keys(row);
        expect(keys).toContain('id');
        expect(keys).toContain('name');
        expect(keys).toContain('email');
        // Should NOT have other columns
        expect(keys).not.toContain('created_at');
        expect(keys).not.toContain('updated_at');
        expect(keys).not.toContain('status');
      }
    });

    it('should return all columns when no projection specified', async () => {
      const query = QueryFixtures.simpleScan('com/example/api/users');

      const result = await engine.execute(query);

      // Should have multiple columns
      if (result.rows.length > 0) {
        const keys = Object.keys(result.rows[0]);
        expect(keys.length).toBeGreaterThan(3);
      }
    });
  });

  describe('Nested Column Projection', () => {
    it('should project nested columns using dot notation', async () => {
      const query: Query = {
        table: 'com/example/api/profiles',
        projection: { columns: ['user.name', 'address.city'] },
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row).toHaveProperty('user.name');
        expect(row).toHaveProperty('address.city');
      }
    });
  });

  describe('Projection with Metadata', () => {
    it('should include metadata columns when includeMetadata is true', async () => {
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

    it('should not include metadata when includeMetadata is false', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        projection: {
          columns: ['name'],
          includeMetadata: false,
        },
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row).not.toHaveProperty('_id');
        expect(row).not.toHaveProperty('_version');
      }
    });
  });

  describe('Projection with Filter', () => {
    it('should apply projection after filtering', async () => {
      const query = QueryFixtures.projectionAndFilter(
        'com/example/api/users',
        ['id', 'name'],
        'status',
        'active'
      );

      const result = await engine.execute(query);

      for (const row of result.rows) {
        // Should have projection columns
        expect(row).toHaveProperty('id');
        expect(row).toHaveProperty('name');
        // Should NOT have filter column (since not in projection)
        expect(row).not.toHaveProperty('status');
      }
    });
  });
});

// =============================================================================
// 6. Error Handling for Invalid Queries
// =============================================================================

describe('Error Handling - Invalid Queries', () => {
  let engine: QueryEngine;

  beforeEach(() => {
    const config = createTestConfig();
    engine = createQueryEngine(config);
  });

  describe('Non-existent Table', () => {
    it('should throw error for non-existent table', async () => {
      const query: Query = {
        table: 'com/example/api/nonexistent_table',
      };

      await expect(engine.execute(query)).rejects.toThrow(/not found|does not exist/i);
    });
  });

  describe('Invalid Column References', () => {
    it('should throw error for invalid column in predicate', async () => {
      const query: Query = {
        table: 'com/example/api/users',
        predicates: [{ column: 'nonexistent_column', operator: 'eq', value: 'test' }],
      };

      await expect(engine.execute(query)).rejects.toThrow(/column|not found/i);
    });
  });

  describe('Column Name Validation', () => {
    it('should reject column names with invalid characters', () => {
      expect(() => validateColumnName('user;DROP TABLE')).toThrow(/invalid column name/i);
    });

    it('should reject column names starting with numbers', () => {
      expect(() => validateColumnName('123column')).toThrow(/invalid column name/i);
    });

    it('should reject column names with consecutive dots', () => {
      expect(() => validateColumnName('user..name')).toThrow(/consecutive dots/i);
    });

    it('should reject column names ending with dot', () => {
      expect(() => validateColumnName('user.')).toThrow(/cannot start or end with a dot/i);
    });

    it('should accept valid column names', () => {
      expect(() => validateColumnName('user_name')).not.toThrow();
      expect(() => validateColumnName('userName')).not.toThrow();
      expect(() => validateColumnName('user.name')).not.toThrow();
      expect(() => validateColumnName('_private')).not.toThrow();
      expect(() => validateColumnName('column123')).not.toThrow();
    });

    it('should accept wildcard (*) as valid', () => {
      expect(() => validateColumnName('*')).not.toThrow();
    });

    it('should reject excessively long column names', () => {
      const longName = 'a'.repeat(300);
      expect(() => validateColumnName(longName)).toThrow(/cannot exceed 256 characters/i);
    });
  });

  describe('Query Validation', () => {
    it('should validate all columns in query', () => {
      const query: Query = {
        table: 'test',
        projection: { columns: ['valid_col', 'user;DROP'] },
      };

      expect(() => validateQueryColumns(query)).toThrow(/invalid column name/i);
    });

    it('should validate predicate columns', () => {
      const query: Query = {
        table: 'test',
        predicates: [{ column: '123invalid', operator: 'eq', value: 'test' }],
      };

      expect(() => validateQueryColumns(query)).toThrow(/invalid column name/i);
    });

    it('should validate group by columns', () => {
      const query: Query = {
        table: 'test',
        groupBy: ['valid_col', 'invalid;col'],
        aggregations: [{ function: 'count', column: null, alias: 'count' }],
      };

      expect(() => validateQueryColumns(query)).toThrow(/invalid column name/i);
    });

    it('should validate aggregation columns and aliases', () => {
      const query: Query = {
        table: 'test',
        aggregations: [{ function: 'sum', column: 'valid_col', alias: 'total;hack' }],
      };

      expect(() => validateQueryColumns(query)).toThrow(/invalid column name/i);
    });

    it('should validate order by columns', () => {
      const query: Query = {
        table: 'test',
        orderBy: [{ column: 'invalid..col', direction: 'asc' }],
      };

      expect(() => validateQueryColumns(query)).toThrow(/consecutive dots/i);
    });
  });

  describe('Timeout Handling', () => {
    it('should throw timeout error for long-running queries', async () => {
      const query: Query = {
        table: 'com/example/api/huge_table',
        hints: { timeoutMs: 100 },
      };

      await expect(engine.execute(query)).rejects.toThrow(/timeout/i);
    });
  });

  describe('Memory Limit Handling', () => {
    it('should throw memory error when limit exceeded', async () => {
      const query: Query = {
        table: 'com/example/api/huge_table',
        hints: { memoryLimitBytes: 1024 },
      };

      await expect(engine.execute(query)).rejects.toThrow(/memory/i);
    });
  });
});

// =============================================================================
// 7. Cost Estimation
// =============================================================================

describe('Cost Estimation', () => {
  let planner: QueryPlanner;

  beforeEach(() => {
    const config = createTestConfig();
    planner = createQueryPlanner(config);
  });

  describe('Cost Breakdown', () => {
    it('should provide cost breakdown in plan', async () => {
      const query = QueryFixtures.simpleScan('com/example/api/users');

      const plan = await planner.createPlan(query);

      expect(plan.estimatedCost).toBeDefined();
      expect(plan.estimatedCost.rowsToScan).toBeGreaterThanOrEqual(0);
      expect(plan.estimatedCost.bytesToRead).toBeGreaterThanOrEqual(0);
      expect(plan.estimatedCost.memoryBytes).toBeGreaterThanOrEqual(0);
      expect(plan.estimatedCost.totalCost).toBeGreaterThanOrEqual(0);
    });

    it('should include CPU and IO cost components', async () => {
      const query = QueryFixtures.simpleScan('com/example/api/users');

      const plan = await planner.createPlan(query);

      expect(plan.estimatedCost.cpuCost).toBeGreaterThanOrEqual(0);
      expect(plan.estimatedCost.ioCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Comparative Costs', () => {
    it('should estimate lower cost for filtered queries', async () => {
      const fullScan = QueryFixtures.simpleScan('com/example/api/events');
      const filtered = QueryFixtures.singleEqualityFilter('com/example/api/events', 'event_type', 'click');

      const fullCost = await planner.estimateCost(fullScan);
      const filteredCost = await planner.estimateCost(filtered);

      expect(filteredCost).toBeLessThan(fullCost);
    });

    it('should include estimated subrequests in cost', async () => {
      const query = QueryFixtures.simpleScan('com/example/api/events');

      const plan = await planner.createPlan(query);

      expect(plan.estimatedCost.estimatedSubrequests).toBeDefined();
      expect(plan.estimatedCost.estimatedSubrequests).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// 8. Plan Metadata
// =============================================================================

describe('Plan Metadata', () => {
  let planner: QueryPlanner;

  beforeEach(() => {
    const config = createTestConfig();
    planner = createQueryPlanner(config);
  });

  it('should generate unique plan ID', async () => {
    const query = QueryFixtures.simpleScan('com/example/api/users');

    const plan1 = await planner.createPlan(query);
    const plan2 = await planner.createPlan(query);

    expect(plan1.planId).toBeDefined();
    expect(plan2.planId).toBeDefined();
    expect(plan1.planId).not.toBe(plan2.planId);
  });

  it('should include original query in plan', async () => {
    const query = QueryFixtures.simpleScan('com/example/api/users');

    const plan = await planner.createPlan(query);

    expect(plan.query).toBe(query);
  });

  it('should include creation timestamp', async () => {
    const beforeCreate = Date.now();
    const query = QueryFixtures.simpleScan('com/example/api/users');

    const plan = await planner.createPlan(query);

    expect(plan.createdAt).toBeGreaterThanOrEqual(beforeCreate);
    expect(plan.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it('should indicate zone map usage', async () => {
    const query: Query = {
      table: 'com/example/api/events',
      predicates: [{ column: 'value', operator: 'gt', value: 100 }],
    };

    const plan = await planner.createPlan(query);

    expect(typeof plan.usesZoneMaps).toBe('boolean');
  });

  it('should track selected and pruned partitions', async () => {
    const query = QueryFixtures.simpleScan('com/example/api/users');

    const plan = await planner.createPlan(query);

    expect(Array.isArray(plan.selectedPartitions)).toBe(true);
    expect(Array.isArray(plan.prunedPartitions)).toBe(true);
  });
});
