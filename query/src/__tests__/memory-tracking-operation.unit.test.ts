/**
 * @evodb/query - Operation-Level Memory Tracking Tests
 *
 * Tests for the OperationMemoryTracker class and per-operation memory tracking.
 * Validates:
 * - Per-operation memory tracking (scan, filter, aggregate, sort, limit, project)
 * - Peak memory usage tracking per operation
 * - Memory bottleneck identification
 * - Integration with QueryEngine stats
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createQueryEngine,
  OperationMemoryTracker,
  type QueryOperationType,
  type OperationMemoryMetricsInternal,
  type OperationMemoryReport,
} from '../engine.js';
import type {
  QueryEngineConfig,
  Query,
  R2Bucket,
  R2Object,
  R2Objects,
  TableDataSource,
  PartitionInfo,
  TableDataSourceMetadata,
} from '../types.js';

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
function createTestDataSource(rowCount: number, bytesPerRow: number = 200): TableDataSource & { getTableRows: (table: string) => Record<string, unknown>[] | null } {
  const generateRow = (i: number): Record<string, unknown> => {
    // Create a row with approximately bytesPerRow size
    const paddingSize = Math.max(0, bytesPerRow - 100);
    return {
      id: i,
      name: `user_${i}`,
      email: `user${i}@example.com`,
      status: i % 2 === 0 ? 'active' : 'inactive',
      score: i * 10,
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
          schema: { id: 'number', name: 'string', email: 'string', status: 'string', score: 'number' },
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
// OperationMemoryTracker Unit Tests
// =============================================================================

describe('OperationMemoryTracker', () => {
  describe('basic operation tracking', () => {
    it('should track memory for a single operation', () => {
      const tracker = new OperationMemoryTracker(Infinity);

      tracker.startOperation('scan', 100);
      tracker.add(1000);
      tracker.endOperation('scan', 100);

      const scanMetrics = tracker.getOperationMetrics('scan');
      expect(scanMetrics.allocatedBytes).toBe(1000);
      expect(scanMetrics.peakBytes).toBe(1000);
      expect(scanMetrics.inputRows).toBe(100);
      expect(scanMetrics.outputRows).toBe(100);
      expect(scanMetrics.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track memory for multiple operations sequentially', () => {
      const tracker = new OperationMemoryTracker(Infinity);

      // Scan operation
      tracker.startOperation('scan', 0);
      tracker.add(5000);
      tracker.endOperation('scan', 1000);

      // Filter operation
      tracker.startOperation('filter', 1000);
      tracker.add(500); // Some overhead for predicate evaluation
      tracker.endOperation('filter', 500);

      const scanMetrics = tracker.getOperationMetrics('scan');
      const filterMetrics = tracker.getOperationMetrics('filter');

      expect(scanMetrics.allocatedBytes).toBe(5000);
      expect(scanMetrics.outputRows).toBe(1000);
      expect(filterMetrics.allocatedBytes).toBe(500);
      expect(filterMetrics.inputRows).toBe(1000);
      expect(filterMetrics.outputRows).toBe(500);
    });

    it('should track peak memory within an operation', () => {
      const tracker = new OperationMemoryTracker(Infinity);

      tracker.startOperation('aggregate', 1000);
      tracker.add(2000);
      tracker.add(1000);
      tracker.release(1500);
      tracker.add(500);
      tracker.endOperation('aggregate', 10);

      const aggregateMetrics = tracker.getOperationMetrics('aggregate');
      // Peak should be at 3000 (2000 + 1000 before release)
      expect(aggregateMetrics.peakBytes).toBe(3000);
      expect(aggregateMetrics.allocatedBytes).toBe(3500); // Total allocated
      expect(aggregateMetrics.releasedBytes).toBe(1500);
    });

    it('should track release within an operation', () => {
      const tracker = new OperationMemoryTracker(Infinity);

      tracker.startOperation('sort', 500);
      tracker.add(2000);
      tracker.release(500);
      tracker.endOperation('sort', 500);

      const sortMetrics = tracker.getOperationMetrics('sort');
      expect(sortMetrics.releasedBytes).toBe(500);
    });

    it('should return empty metrics for unstarted operation', () => {
      const tracker = new OperationMemoryTracker(Infinity);

      const metrics = tracker.getOperationMetrics('project');
      expect(metrics.allocatedBytes).toBe(0);
      expect(metrics.peakBytes).toBe(0);
      expect(metrics.durationMs).toBe(0);
      expect(metrics.inputRows).toBe(0);
      expect(metrics.outputRows).toBe(0);
    });
  });

  describe('operation memory report', () => {
    it('should return comprehensive operation report', () => {
      const tracker = new OperationMemoryTracker(10000);

      // Simulate a full query execution
      tracker.startOperation('scan', 0);
      tracker.add(500);
      tracker.endOperation('scan', 100);

      tracker.startOperation('filter', 100);
      tracker.add(50);
      tracker.endOperation('filter', 50);

      tracker.startOperation('sort', 50);
      tracker.add(100);
      tracker.endOperation('sort', 50);

      tracker.startOperation('limit', 50);
      tracker.endOperation('limit', 10);

      const report = tracker.getOperationReport();

      expect(report.scan).toBeDefined();
      expect(report.filter).toBeDefined();
      expect(report.sort).toBeDefined();
      expect(report.limit).toBeDefined();
      expect(report.scan?.allocatedBytes).toBe(500);
      expect(report.filter?.allocatedBytes).toBe(50);
    });

    it('should only include executed operations in report', () => {
      const tracker = new OperationMemoryTracker(Infinity);

      tracker.startOperation('scan', 0);
      tracker.add(100);
      tracker.endOperation('scan', 10);

      const report = tracker.getOperationReport();

      expect(report.scan).toBeDefined();
      expect(report.filter).toBeUndefined();
      expect(report.aggregate).toBeUndefined();
      expect(report.sort).toBeUndefined();
      expect(report.limit).toBeUndefined();
      expect(report.project).toBeUndefined();
    });
  });

  describe('memory bottleneck identification', () => {
    it('should identify operation with highest peak memory', () => {
      const tracker = new OperationMemoryTracker(Infinity);

      tracker.startOperation('scan', 0);
      tracker.add(1000);
      tracker.endOperation('scan', 100);

      tracker.startOperation('aggregate', 100);
      tracker.add(5000); // Highest memory usage
      tracker.endOperation('aggregate', 10);

      tracker.startOperation('sort', 10);
      tracker.add(2000);
      tracker.endOperation('sort', 10);

      const bottleneck = tracker.getMemoryBottleneck();

      expect(bottleneck).not.toBeNull();
      expect(bottleneck?.operation).toBe('aggregate');
      expect(bottleneck?.metrics.peakBytes).toBe(5000);
    });

    it('should return null when no operations have been executed', () => {
      const tracker = new OperationMemoryTracker(Infinity);

      const bottleneck = tracker.getMemoryBottleneck();
      expect(bottleneck).toBeNull();
    });
  });

  describe('operation timing', () => {
    it('should track operation durations', () => {
      const tracker = new OperationMemoryTracker(Infinity);

      tracker.startOperation('scan', 100);
      // Small delay to ensure duration is measurable
      tracker.add(1000);
      tracker.endOperation('scan', 100);

      const scanMetrics = tracker.getOperationMetrics('scan');
      expect(scanMetrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(scanMetrics.startedAt).toBeGreaterThan(0);
      expect(scanMetrics.endedAt).toBeGreaterThanOrEqual(scanMetrics.startedAt);
    });
  });

  describe('memory efficiency calculation', () => {
    it('should calculate memory efficiency for filter operations', () => {
      const tracker = new OperationMemoryTracker(Infinity);

      // Filter that reduces 50% of rows
      tracker.startOperation('filter', 100);
      tracker.add(1000);
      tracker.endOperation('filter', 50);

      const filterMetrics = tracker.getOperationMetrics('filter');
      expect(filterMetrics.memoryEfficiency).toBeDefined();
      expect(filterMetrics.memoryEfficiency).toBeCloseTo(0.5, 1);
    });
  });

  describe('inherits GranularMemoryTracker functionality', () => {
    it('should track phase memory alongside operation memory', () => {
      const tracker = new OperationMemoryTracker(Infinity);

      // Phase tracking
      tracker.startPhase('execute');

      // Operation tracking within phase
      tracker.startOperation('scan', 0);
      tracker.add(1000);
      tracker.endOperation('scan', 100);

      tracker.endPhase('execute');

      // Both should be tracked
      const executeMetrics = tracker.getPhaseMetrics('execute');
      const scanMetrics = tracker.getOperationMetrics('scan');

      expect(executeMetrics.allocatedBytes).toBe(1000);
      expect(scanMetrics.allocatedBytes).toBe(1000);
    });

    it('should enforce memory limits', () => {
      const tracker = new OperationMemoryTracker(1000);

      tracker.startOperation('scan', 0);
      tracker.add(500);
      expect(() => tracker.add(600)).toThrow(/memory limit/i);
    });
  });
});

// =============================================================================
// QueryEngine Integration Tests
// =============================================================================

describe('QueryEngine operation memory tracking integration', () => {
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockBucket = createMockBucket();
  });

  describe('stats include operation memory metrics', () => {
    it('should include scan operation metrics', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = { table: 'test_table' };

      const result = await engine.execute(query);

      expect(result.stats.operationMemory).toBeDefined();
      expect(result.stats.operationMemory?.scan).toBeDefined();
      expect(result.stats.operationMemory?.scan?.allocatedBytes).toBeGreaterThan(0);
      expect(result.stats.operationMemory?.scan?.outputRows).toBe(100);
    });

    it('should include filter operation metrics when predicates are used', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'test_table',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
      };

      const result = await engine.execute(query);

      expect(result.stats.operationMemory?.filter).toBeDefined();
      expect(result.stats.operationMemory?.filter?.inputRows).toBe(100);
      expect(result.stats.operationMemory?.filter?.outputRows).toBe(50); // Half are 'active'
    });

    it('should include aggregate operation metrics when aggregations are used', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'test_table',
        aggregations: [
          { function: 'count', column: null, alias: 'total' },
          { function: 'sum', column: 'score', alias: 'total_score' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.stats.operationMemory?.aggregate).toBeDefined();
      expect(result.stats.operationMemory?.aggregate?.inputRows).toBe(100);
      expect(result.stats.operationMemory?.aggregate?.outputRows).toBe(1); // Single aggregated row
    });

    it('should include sort operation metrics when ORDER BY is used', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'test_table',
        orderBy: [{ column: 'score', direction: 'desc' }],
      };

      const result = await engine.execute(query);

      expect(result.stats.operationMemory?.sort).toBeDefined();
      expect(result.stats.operationMemory?.sort?.inputRows).toBe(100);
      expect(result.stats.operationMemory?.sort?.outputRows).toBe(100);
    });

    it('should include limit operation metrics when LIMIT is used', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      // Use ORDER BY to disable early termination optimization
      // Early termination only loads the required number of rows, so limit operation
      // wouldn't have different input/output counts
      const query: Query = {
        table: 'test_table',
        limit: 10,
        orderBy: [{ column: 'id', direction: 'asc' }],
      };

      const result = await engine.execute(query);

      expect(result.stats.operationMemory?.limit).toBeDefined();
      expect(result.stats.operationMemory?.limit?.inputRows).toBe(100);
      expect(result.stats.operationMemory?.limit?.outputRows).toBe(10);
    });

    it('should include project operation metrics when projection is used', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'test_table',
        projection: { columns: ['id', 'name'] },
      };

      const result = await engine.execute(query);

      expect(result.stats.operationMemory?.project).toBeDefined();
      expect(result.stats.operationMemory?.project?.inputRows).toBe(100);
      expect(result.stats.operationMemory?.project?.outputRows).toBe(100);
    });
  });

  describe('complex query with multiple operations', () => {
    it('should track all operations in a complex query', async () => {
      const dataSource = createTestDataSource(100, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'test_table',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
        projection: { columns: ['id', 'name', 'score'] },
        orderBy: [{ column: 'score', direction: 'desc' }],
        limit: 5,
      };

      const result = await engine.execute(query);

      // All operations should be tracked
      expect(result.stats.operationMemory?.scan).toBeDefined();
      expect(result.stats.operationMemory?.filter).toBeDefined();
      expect(result.stats.operationMemory?.project).toBeDefined();
      expect(result.stats.operationMemory?.sort).toBeDefined();
      expect(result.stats.operationMemory?.limit).toBeDefined();

      // Verify row counts through the pipeline
      expect(result.stats.operationMemory?.scan?.outputRows).toBe(100);
      expect(result.stats.operationMemory?.filter?.inputRows).toBe(100);
      expect(result.stats.operationMemory?.filter?.outputRows).toBe(50);
      expect(result.stats.operationMemory?.limit?.outputRows).toBe(5);

      // Final result should have 5 rows
      expect(result.rows.length).toBe(5);
    });

    it('should track operation durations', async () => {
      const dataSource = createTestDataSource(1000, 200);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'test_table',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
        orderBy: [{ column: 'score', direction: 'desc' }],
      };

      const result = await engine.execute(query);

      // All operations should have non-negative durations
      expect(result.stats.operationMemory?.scan?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stats.operationMemory?.filter?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stats.operationMemory?.sort?.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('memory bottleneck identification', () => {
    it('should help identify memory-intensive operations', async () => {
      const dataSource = createTestDataSource(1000, 500);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'test_table',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
        orderBy: [{ column: 'score', direction: 'desc' }],
      };

      const result = await engine.execute(query);

      // Scan should typically be the most memory-intensive operation
      // because it loads all the data
      const operationMemory = result.stats.operationMemory;
      if (operationMemory) {
        const maxPeak = Math.max(
          operationMemory.scan?.peakBytes ?? 0,
          operationMemory.filter?.peakBytes ?? 0,
          operationMemory.sort?.peakBytes ?? 0,
        );

        // Scan should have the highest peak memory
        expect(operationMemory.scan?.peakBytes).toBe(maxPeak);
      }
    });
  });
});
