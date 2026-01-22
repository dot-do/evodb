/**
 * @evodb/query - Granular Memory Tracking Tests
 *
 * Tests for the GranularMemoryTracker class and per-phase memory tracking.
 * Validates:
 * - Per-phase memory tracking (parse, plan, execute, result)
 * - Peak memory usage tracking
 * - Result set memory estimation
 * - Integration with QueryEngine stats
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createQueryEngine,
  GranularMemoryTracker,
  type QueryPhase,
  type PhaseMemoryMetrics,
  type GranularMemoryMetrics,
} from '../engine.js';
import type { QueryEngineConfig, Query, R2Bucket, R2Object, R2Objects, TableDataSource, PartitionInfo, TableDataSourceMetadata } from '../types.js';

// =============================================================================
// Test Helpers
// =============================================================================

/** Create a minimal mock R2 bucket for tests */
function createMockBucket(): R2Bucket {
  return {
    async get(_key: string): Promise<R2Object | null> {
      return null;
    },
    async head(_key: string): Promise<R2Object | null> {
      return null;
    },
    async list(_options?: { prefix?: string }): Promise<R2Objects> {
      return { objects: [], truncated: false };
    },
  };
}

/**
 * Create a data source with predictable row sizes for testing.
 */
function createTestDataSource(rowCount: number, bytesPerRow: number = 200): TableDataSource {
  const generateRow = (i: number): Record<string, unknown> => {
    // Create a row with approximately bytesPerRow size
    const paddingSize = Math.max(0, bytesPerRow - 100);
    return {
      id: i,
      name: `user_${i}`,
      email: `user${i}@example.com`,
      padding: 'x'.repeat(paddingSize),
      metadata: { index: i },
    };
  };

  const rows = Array.from({ length: rowCount }, (_, i) => generateRow(i));

  return {
    async getTableMetadata(tableName: string): Promise<TableDataSourceMetadata | null> {
      if (tableName === 'test_table') {
        return {
          tableName,
          partitions: [{
            path: 'data/test_table/p1.bin',
            partitionValues: {},
            sizeBytes: rowCount * bytesPerRow,
            rowCount,
            zoneMap: { columns: {} },
            isCached: false,
          }],
          schema: { id: 'number', name: 'string', email: 'string' },
          rowCount,
        };
      }
      return null;
    },

    async readPartition(_partition: PartitionInfo, _columns?: string[]): Promise<Record<string, unknown>[]> {
      return rows;
    },

    async *streamPartition(_partition: PartitionInfo, _columns?: string[]): AsyncIterableIterator<Record<string, unknown>> {
      for (const row of rows) {
        yield row;
      }
    },

    getTableRows(tableName: string): Record<string, unknown>[] | null {
      if (tableName === 'test_table') {
        return rows;
      }
      return null;
    },
  };
}

// =============================================================================
// GranularMemoryTracker Unit Tests
// =============================================================================

describe('GranularMemoryTracker', () => {
  describe('basic memory tracking', () => {
    it('should track current and peak memory', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      tracker.add(1000);
      expect(tracker.getCurrentBytes()).toBe(1000);
      expect(tracker.getPeakBytes()).toBe(1000);

      tracker.add(500);
      expect(tracker.getCurrentBytes()).toBe(1500);
      expect(tracker.getPeakBytes()).toBe(1500);

      tracker.release(800);
      expect(tracker.getCurrentBytes()).toBe(700);
      expect(tracker.getPeakBytes()).toBe(1500); // Peak unchanged
    });

    it('should throw MemoryLimitExceededError when limit exceeded', () => {
      const tracker = new GranularMemoryTracker(1000);

      tracker.add(500);
      expect(() => tracker.add(600)).toThrow(/memory limit/i);
    });

    it('should handle release beyond current usage', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      tracker.add(1000);
      tracker.release(1500); // Release more than current
      expect(tracker.getCurrentBytes()).toBe(0);
    });
  });

  describe('phase tracking', () => {
    it('should track memory per phase', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      // Parse phase
      tracker.startPhase('parse');
      tracker.add(100);
      tracker.endPhase('parse');

      const parseMetrics = tracker.getPhaseMetrics('parse');
      expect(parseMetrics.allocatedBytes).toBe(100);
      expect(parseMetrics.peakBytes).toBe(100);
      expect(parseMetrics.durationMs).toBeGreaterThanOrEqual(0);

      // Plan phase
      tracker.startPhase('plan');
      tracker.add(200);
      tracker.endPhase('plan');

      const planMetrics = tracker.getPhaseMetrics('plan');
      expect(planMetrics.allocatedBytes).toBe(200);
      expect(planMetrics.peakBytes).toBe(200);
    });

    it('should track peak memory within a phase correctly', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      tracker.startPhase('execute');
      tracker.add(1000);
      tracker.add(500);
      tracker.release(300);
      tracker.add(100);
      tracker.endPhase('execute');

      const executeMetrics = tracker.getPhaseMetrics('execute');
      // Peak should be at 1500 (1000 + 500 before release)
      expect(executeMetrics.peakBytes).toBe(1500);
      expect(executeMetrics.allocatedBytes).toBe(1600); // Total allocated
    });

    it('should track release within a phase', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      tracker.startPhase('result');
      tracker.add(500);
      tracker.release(200);
      tracker.endPhase('result');

      const resultMetrics = tracker.getPhaseMetrics('result');
      expect(resultMetrics.releasedBytes).toBe(200);
    });

    it('should return empty metrics for unstarted phase', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      const metrics = tracker.getPhaseMetrics('parse');
      expect(metrics.allocatedBytes).toBe(0);
      expect(metrics.peakBytes).toBe(0);
      expect(metrics.durationMs).toBe(0);
    });
  });

  describe('row tracking', () => {
    it('should track individual rows', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      const row = { id: 1, name: 'test', data: 'x'.repeat(100) };
      tracker.trackRow(row);

      expect(tracker.getCurrentBytes()).toBeGreaterThan(0);
      expect(tracker.getEstimatedBytesPerRow()).toBeGreaterThan(0);
    });

    it('should track multiple rows', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      const rows = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `user_${i}`,
        data: 'x'.repeat(50),
      }));

      tracker.trackRows(rows);

      expect(tracker.getCurrentBytes()).toBeGreaterThan(0);
      expect(tracker.getEstimatedBytesPerRow()).toBeGreaterThan(0);
    });

    it('should calculate running average for bytes per row', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      // Track rows with varying sizes
      const smallRow = { id: 1, name: 'a' };
      const largeRow = { id: 2, name: 'x'.repeat(1000) };

      tracker.trackRow(smallRow);
      const firstEstimate = tracker.getEstimatedBytesPerRow();

      tracker.trackRow(largeRow);
      const secondEstimate = tracker.getEstimatedBytesPerRow();

      // Second estimate should be larger due to the large row
      expect(secondEstimate).toBeGreaterThan(firstEstimate);
    });
  });

  describe('result set estimation', () => {
    it('should estimate result set memory', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      const rows = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `user_${i}`,
        data: 'x'.repeat(50),
      }));

      const estimatedBytes = tracker.estimateResultSetMemory(rows);

      expect(estimatedBytes).toBeGreaterThan(0);
      expect(tracker.getResultSetBytes()).toBe(estimatedBytes);
    });

    it('should handle empty result set', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      const estimatedBytes = tracker.estimateResultSetMemory([]);

      expect(estimatedBytes).toBe(0);
      expect(tracker.getResultSetBytes()).toBe(0);
    });

    it('should sample rows for large result sets', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      // Create 1000 rows - estimation should sample only 100
      const rows = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `user_${i}`,
        data: 'x'.repeat(50),
      }));

      const estimatedBytes = tracker.estimateResultSetMemory(rows);

      // Should be proportionally larger than a smaller sample
      expect(estimatedBytes).toBeGreaterThan(tracker.estimateResultSetMemory(rows.slice(0, 100)));
    });
  });

  describe('granular metrics', () => {
    it('should return complete granular metrics', () => {
      const tracker = new GranularMemoryTracker(10000);

      // Simulate a full query execution
      tracker.startPhase('parse');
      tracker.add(100);
      tracker.endPhase('parse');

      tracker.startPhase('plan');
      tracker.add(200);
      tracker.endPhase('plan');

      tracker.startPhase('execute');
      tracker.add(500);
      tracker.endPhase('execute');

      tracker.startPhase('result');
      tracker.estimateResultSetMemory([{ id: 1, name: 'test' }]);
      tracker.endPhase('result');

      const metrics = tracker.getGranularMetrics();

      expect(metrics.parse.allocatedBytes).toBe(100);
      expect(metrics.plan.allocatedBytes).toBe(200);
      expect(metrics.execute.allocatedBytes).toBe(500);
      expect(metrics.currentBytes).toBe(800);
      expect(metrics.peakBytes).toBe(800);
      expect(metrics.limitBytes).toBe(10000);
      expect(metrics.utilizationRatio).toBeCloseTo(0.08, 1);
      expect(metrics.resultSetBytes).toBeGreaterThan(0);
    });

    it('should calculate utilization ratio correctly', () => {
      const tracker = new GranularMemoryTracker(1000);

      tracker.add(500);

      const metrics = tracker.getGranularMetrics();
      expect(metrics.utilizationRatio).toBeCloseTo(0.5, 1);
    });

    it('should return zero utilization for infinite limit', () => {
      const tracker = new GranularMemoryTracker(Infinity);

      tracker.add(1000);

      const metrics = tracker.getGranularMetrics();
      expect(metrics.utilizationRatio).toBe(0);
    });
  });
});

// =============================================================================
// QueryEngine Integration Tests
// =============================================================================

describe('QueryEngine memory tracking integration', () => {
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockBucket = createMockBucket();
  });

  describe('stats include granular memory metrics', () => {
    it('should include peakMemoryBytes in stats', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      const result = await engine.execute(query);

      expect(result.stats.peakMemoryBytes).toBeGreaterThan(0);
    });

    it('should include resultSetBytes in stats', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      const result = await engine.execute(query);

      expect(result.stats.resultSetBytes).toBeGreaterThan(0);
    });

    it('should include estimatedBytesPerRow in stats', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      const result = await engine.execute(query);

      expect(result.stats.estimatedBytesPerRow).toBeGreaterThan(0);
    });

    it('should include memoryUtilizationRatio in stats', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 100 * 1024 * 1024, // 100MB
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      const result = await engine.execute(query);

      expect(result.stats.memoryUtilizationRatio).toBeGreaterThanOrEqual(0);
      expect(result.stats.memoryUtilizationRatio).toBeLessThanOrEqual(1);
    });

    it('should include per-phase memory metrics in stats', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      const result = await engine.execute(query);

      expect(result.stats.phaseMemory).toBeDefined();
      expect(result.stats.phaseMemory?.parse).toBeDefined();
      expect(result.stats.phaseMemory?.plan).toBeDefined();
      expect(result.stats.phaseMemory?.execute).toBeDefined();
      expect(result.stats.phaseMemory?.result).toBeDefined();
    });

    it('should track memory in plan phase (data loading)', async () => {
      const dataSource = createTestDataSource(500, 500);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      const result = await engine.execute(query);

      // Plan phase should have significant memory allocation (data loading happens here)
      expect(result.stats.phaseMemory?.plan?.allocatedBytes).toBeGreaterThan(0);
      expect(result.stats.phaseMemory?.plan?.peakBytes).toBeGreaterThan(0);
    });
  });

  describe('memory tracking accuracy', () => {
    it('should track memory proportional to data size', async () => {
      // Execute two queries with different data sizes
      const smallDataSource = createTestDataSource(100, 200);
      const largeDataSource = createTestDataSource(1000, 200);

      const smallEngine = createQueryEngine({
        bucket: mockBucket,
        dataSource: smallDataSource,
      });

      const largeEngine = createQueryEngine({
        bucket: mockBucket,
        dataSource: largeDataSource,
      });

      const query: Query = { table: 'test_table' };

      const smallResult = await smallEngine.execute(query);
      const largeResult = await largeEngine.execute(query);

      // Larger dataset should have higher peak memory
      expect(largeResult.stats.peakMemoryBytes).toBeGreaterThan(smallResult.stats.peakMemoryBytes);

      // Memory should scale roughly with data size (within 3x due to overhead)
      const ratio = largeResult.stats.peakMemoryBytes / smallResult.stats.peakMemoryBytes;
      expect(ratio).toBeGreaterThan(5);
      expect(ratio).toBeLessThan(30);
    });

    it('should estimate bytes per row within reasonable range', async () => {
      const bytesPerRow = 500;
      const dataSource = createTestDataSource(100, bytesPerRow);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      const result = await engine.execute(query);

      // Estimated bytes per row should be in a reasonable range
      // Allow for object overhead and memory estimation variance
      expect(result.stats.estimatedBytesPerRow).toBeGreaterThan(bytesPerRow * 0.5);
      expect(result.stats.estimatedBytesPerRow).toBeLessThan(bytesPerRow * 5);
    });

    it('should track result set memory accurately', async () => {
      const rowCount = 100;
      const bytesPerRow = 300;
      const dataSource = createTestDataSource(rowCount, bytesPerRow);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      const result = await engine.execute(query);

      // Result set memory should be roughly proportional to row count * bytes per row
      const expectedMinBytes = rowCount * bytesPerRow * 0.5;
      const expectedMaxBytes = rowCount * bytesPerRow * 5;

      expect(result.stats.resultSetBytes).toBeGreaterThan(expectedMinBytes);
      expect(result.stats.resultSetBytes).toBeLessThan(expectedMaxBytes);
    });
  });

  describe('memory limit enforcement', () => {
    it('should throw MemoryLimitExceededError for large result sets', async () => {
      const dataSource = createTestDataSource(10000, 1024); // ~10MB
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 1024 * 1024, // 1MB limit
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      await expect(engine.execute(query)).rejects.toThrow(/memory limit/i);
    });

    it('should succeed when under memory limit', async () => {
      const dataSource = createTestDataSource(100, 200); // ~20KB
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 10 * 1024 * 1024, // 10MB limit
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      const result = await engine.execute(query);
      expect(result.rows.length).toBe(100);
      expect(result.stats.memoryUtilizationRatio).toBeLessThan(0.1);
    });
  });

  describe('phase timing', () => {
    it('should track phase durations', async () => {
      const dataSource = createTestDataSource(1000, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      const result = await engine.execute(query);

      // All phases should have non-negative durations
      expect(result.stats.phaseMemory?.parse?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stats.phaseMemory?.plan?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stats.phaseMemory?.execute?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stats.phaseMemory?.result?.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
