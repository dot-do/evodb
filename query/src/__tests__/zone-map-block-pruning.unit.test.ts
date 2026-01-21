/**
 * @evodb/query - Zone Map Block Pruning Tests
 *
 * TDD RED Phase: Tests for integrating zone maps into the query planner
 * to skip blocks based on min/max statistics.
 *
 * Issue: evodb-3vb
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  QueryEngine,
  createQueryEngine,
  createZoneMapOptimizer,
  ZoneMapOptimizer,
} from '../engine.js';

import type {
  Query,
  QueryResult,
  PartitionInfo,
  Predicate,
  QueryEngineConfig,
  QueryStats,
} from '../types.js';

import {
  MockDataSource,
  createMockDataSource,
  type MockTableDefinition,
} from './fixtures/mock-data.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockBucket() {
  return {
    get: async () => null,
    head: async () => null,
    list: async () => ({ objects: [], truncated: false }),
  };
}

function createTestConfig(overrides?: Partial<QueryEngineConfig>): QueryEngineConfig {
  return {
    bucket: createMockBucket() as any,
    dataSource: createMockDataSource(),
    maxParallelism: 4,
    defaultTimeoutMs: 30000,
    enableStats: true,
    ...overrides,
  };
}

/**
 * Create a table with multiple partitions having distinct zone maps
 * to test block pruning effectiveness.
 */
function createBlockPruningTestTable(): MockTableDefinition {
  // Create partitions with non-overlapping value ranges
  // This setup allows for effective zone map pruning
  const partitions: PartitionInfo[] = [
    {
      path: 'data/zonetest/p1.bin',
      partitionValues: {},
      sizeBytes: 10000,
      rowCount: 100,
      zoneMap: {
        columns: {
          id: { min: 1, max: 100, nullCount: 0, allNull: false },
          value: { min: 0, max: 99, nullCount: 0, allNull: false },
          category: { min: 'A', max: 'C', nullCount: 0, allNull: false },
        },
      },
      isCached: false,
    },
    {
      path: 'data/zonetest/p2.bin',
      partitionValues: {},
      sizeBytes: 10000,
      rowCount: 100,
      zoneMap: {
        columns: {
          id: { min: 101, max: 200, nullCount: 0, allNull: false },
          value: { min: 100, max: 199, nullCount: 0, allNull: false },
          category: { min: 'D', max: 'F', nullCount: 0, allNull: false },
        },
      },
      isCached: false,
    },
    {
      path: 'data/zonetest/p3.bin',
      partitionValues: {},
      sizeBytes: 10000,
      rowCount: 100,
      zoneMap: {
        columns: {
          id: { min: 201, max: 300, nullCount: 0, allNull: false },
          value: { min: 200, max: 299, nullCount: 0, allNull: false },
          category: { min: 'G', max: 'I', nullCount: 0, allNull: false },
        },
      },
      isCached: false,
    },
    {
      path: 'data/zonetest/p4.bin',
      partitionValues: {},
      sizeBytes: 10000,
      rowCount: 100,
      zoneMap: {
        columns: {
          id: { min: 301, max: 400, nullCount: 0, allNull: false },
          value: { min: 300, max: 399, nullCount: 0, allNull: false },
          category: { min: 'J', max: 'L', nullCount: 0, allNull: false },
        },
      },
      isCached: false,
    },
    {
      path: 'data/zonetest/p5.bin',
      partitionValues: {},
      sizeBytes: 10000,
      rowCount: 100,
      zoneMap: {
        columns: {
          id: { min: 401, max: 500, nullCount: 0, allNull: false },
          value: { min: 400, max: 499, nullCount: 0, allNull: false },
          category: { min: 'M', max: 'O', nullCount: 0, allNull: false },
        },
      },
      isCached: false,
    },
  ];

  // Generate rows matching the partition zone maps
  const rows: Record<string, unknown>[] = [];
  const categories = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];

  for (let i = 1; i <= 500; i++) {
    rows.push({
      id: i,
      value: i - 1, // 0-499
      category: categories[Math.floor((i - 1) / 34) % categories.length],
    });
  }

  return {
    partitions,
    rows,
    schema: {
      id: 'number',
      value: 'number',
      category: 'string',
    },
  };
}

// =============================================================================
// Zone Map Block Pruning Tests
// =============================================================================

describe('Zone Map Block Pruning Integration', () => {
  let engine: QueryEngine;
  let dataSource: MockDataSource;

  beforeEach(() => {
    dataSource = createMockDataSource();
    dataSource.addTable('test/zonetest', createBlockPruningTestTable());

    const config = createTestConfig({ dataSource });
    engine = createQueryEngine(config);
  });

  describe('Block Pruning Statistics', () => {
    it('should report blocksPruned in query stats when zone maps eliminate blocks', async () => {
      // Query that should prune 4 out of 5 partitions (blocks)
      // Only partition p5 has values >= 400
      const query: Query = {
        table: 'test/zonetest',
        predicates: [
          { column: 'value', operator: 'gte', value: 400 },
        ],
      };

      const result = await engine.execute(query);

      // Should have blocksPruned in stats
      expect(result.stats).toHaveProperty('blocksPruned');
      expect(result.stats.blocksPruned).toBe(4); // 4 out of 5 blocks should be pruned
    });

    it('should report blocksScanned in query stats', async () => {
      const query: Query = {
        table: 'test/zonetest',
        predicates: [
          { column: 'value', operator: 'gte', value: 400 },
        ],
      };

      const result = await engine.execute(query);

      // Should have blocksScanned in stats
      expect(result.stats).toHaveProperty('blocksScanned');
      expect(result.stats.blocksScanned).toBe(1); // Only 1 block should be scanned
    });

    it('should report totalBlocks in query stats', async () => {
      const query: Query = {
        table: 'test/zonetest',
      };

      const result = await engine.execute(query);

      // Should have totalBlocks in stats
      expect(result.stats).toHaveProperty('totalBlocks');
      expect(result.stats.totalBlocks).toBe(5); // 5 total blocks
    });

    it('should calculate blockPruneRatio correctly', async () => {
      // Query that should prune 3 out of 5 blocks
      // Partitions p1, p2 have values 0-199, so value >= 200 prunes them
      const query: Query = {
        table: 'test/zonetest',
        predicates: [
          { column: 'value', operator: 'gte', value: 200 },
        ],
      };

      const result = await engine.execute(query);

      // Should have blockPruneRatio in stats
      expect(result.stats).toHaveProperty('blockPruneRatio');
      // 2 blocks pruned out of 5 total = 0.4 (40%)
      expect(result.stats.blockPruneRatio).toBeCloseTo(0.4, 1);
    });
  });

  describe('Block Pruning Effectiveness', () => {
    it('should prune most blocks when query targets small value range', async () => {
      // Query for value = 450, only in partition p5
      const query: Query = {
        table: 'test/zonetest',
        predicates: [
          { column: 'value', operator: 'eq', value: 450 },
        ],
      };

      const result = await engine.execute(query);

      // Should prune 4 out of 5 blocks
      expect(result.stats.blocksPruned).toBeGreaterThanOrEqual(4);
      expect(result.stats.blocksScanned).toBeLessThanOrEqual(1);
    });

    it('should prune no blocks when query spans all value ranges', async () => {
      // Query for all values (no predicate on value column)
      const query: Query = {
        table: 'test/zonetest',
      };

      const result = await engine.execute(query);

      // Should prune 0 blocks - all must be scanned
      expect(result.stats.blocksPruned).toBe(0);
      expect(result.stats.blocksScanned).toBe(5);
    });

    it('should prune blocks based on BETWEEN predicate', async () => {
      // Query for value between 150 and 250
      // Should hit partitions p2 (100-199) and p3 (200-299)
      const query: Query = {
        table: 'test/zonetest',
        predicates: [
          { column: 'value', operator: 'between', value: [150, 250] },
        ],
      };

      const result = await engine.execute(query);

      // Should prune 3 blocks (p1, p4, p5)
      expect(result.stats.blocksPruned).toBe(3);
      expect(result.stats.blocksScanned).toBe(2);
    });

    it('should prune blocks based on equality predicate', async () => {
      // Query for id = 150, only in partition p2 (101-200)
      const query: Query = {
        table: 'test/zonetest',
        predicates: [
          { column: 'id', operator: 'eq', value: 150 },
        ],
      };

      const result = await engine.execute(query);

      // Should prune 4 blocks
      expect(result.stats.blocksPruned).toBe(4);
      expect(result.stats.blocksScanned).toBe(1);
    });

    it('should prune blocks based on less-than predicate', async () => {
      // Query for value < 100, only in partition p1 (0-99)
      const query: Query = {
        table: 'test/zonetest',
        predicates: [
          { column: 'value', operator: 'lt', value: 100 },
        ],
      };

      const result = await engine.execute(query);

      // Should prune 4 blocks (p2, p3, p4, p5 all have min >= 100)
      expect(result.stats.blocksPruned).toBe(4);
      expect(result.stats.blocksScanned).toBe(1);
    });

    it('should combine multiple predicates for block pruning', async () => {
      // Query for value >= 100 AND value < 200
      // Should only hit partition p2 (100-199)
      const query: Query = {
        table: 'test/zonetest',
        predicates: [
          { column: 'value', operator: 'gte', value: 100 },
          { column: 'value', operator: 'lt', value: 200 },
        ],
      };

      const result = await engine.execute(query);

      // Should prune 4 blocks (p1, p3, p4, p5)
      expect(result.stats.blocksPruned).toBe(4);
      expect(result.stats.blocksScanned).toBe(1);
    });
  });

  describe('Block Pruning with Multiple Columns', () => {
    it('should prune blocks using predicates on different columns', async () => {
      // Query with predicates on both id and value columns
      // id >= 201 (p3, p4, p5) AND value < 300 (p1, p2, p3)
      // Intersection should be p3 only
      const query: Query = {
        table: 'test/zonetest',
        predicates: [
          { column: 'id', operator: 'gte', value: 201 },
          { column: 'value', operator: 'lt', value: 300 },
        ],
      };

      const result = await engine.execute(query);

      // Should prune 4 blocks, scan only p3
      expect(result.stats.blocksPruned).toBe(4);
      expect(result.stats.blocksScanned).toBe(1);
    });
  });

  describe('Zone Map Effectiveness Metric', () => {
    it('should update zoneMapEffectiveness to reflect block pruning', async () => {
      // Query that prunes 4 out of 5 blocks
      const query: Query = {
        table: 'test/zonetest',
        predicates: [
          { column: 'value', operator: 'gte', value: 400 },
        ],
      };

      const result = await engine.execute(query);

      // zoneMapEffectiveness should be 0.8 (4/5 = 80% pruned)
      expect(result.stats.zoneMapEffectiveness).toBeCloseTo(0.8, 1);
    });

    it('should report 0 effectiveness when no blocks can be pruned', async () => {
      // Query with no predicates - cannot prune any blocks
      const query: Query = {
        table: 'test/zonetest',
      };

      const result = await engine.execute(query);

      // No blocks pruned means 0% effectiveness
      expect(result.stats.zoneMapEffectiveness).toBe(0);
    });
  });
});

describe('ZoneMapOptimizer Block-Level Pruning', () => {
  let optimizer: ZoneMapOptimizer;

  beforeEach(() => {
    optimizer = createZoneMapOptimizer();
  });

  describe('prunePartitions returns pruning details', () => {
    it('should return detailed pruning info with block counts', () => {
      const partitions: PartitionInfo[] = [
        {
          path: 'data/p1.bin',
          partitionValues: {},
          sizeBytes: 10000,
          rowCount: 100,
          zoneMap: {
            columns: {
              value: { min: 0, max: 100, nullCount: 0, allNull: false },
            },
          },
          isCached: false,
        },
        {
          path: 'data/p2.bin',
          partitionValues: {},
          sizeBytes: 10000,
          rowCount: 100,
          zoneMap: {
            columns: {
              value: { min: 200, max: 300, nullCount: 0, allNull: false },
            },
          },
          isCached: false,
        },
      ];

      const predicates: Predicate[] = [
        { column: 'value', operator: 'gte', value: 150 },
      ];

      const result = optimizer.prunePartitions(partitions, predicates);

      expect(result.selected).toHaveLength(1);
      expect(result.pruned).toHaveLength(1);
      expect(result.selected[0].path).toBe('data/p2.bin');
      expect(result.pruned[0].path).toBe('data/p1.bin');
    });
  });
});
