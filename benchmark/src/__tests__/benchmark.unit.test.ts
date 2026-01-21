/**
 * @evodb/benchmark - Scale-out Benchmark Tests
 *
 * Tests for the benchmark harness components.
 * These run locally to validate the simulation infrastructure.
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Types and utilities
import {
  DATA_SIZE_ROWS,
  computeLatencyMetrics,
  computeThroughputMetrics,
  computeCostMetrics,
  percentile,
  createHistogram,
  formatBytes,
  formatDuration,
  formatNumber,
  calculateSpeedup,
  calculateScalingEfficiency,
} from '../index.js';

// Random utilities
import { SeededRandom, createRandom } from '../utils/random.js';

// Generators
import { DataGenerator, generateDataset, generateForSize } from '../generators/data-generator.js';
import {
  USER_ACTIVITY_SCHEMA,
  ECOMMERCE_EVENTS_SCHEMA,
  IOT_SENSOR_SCHEMA,
  getSchema,
  listSchemas,
} from '../generators/schemas.js';

// Workers simulation
import { WorkerSimulator, createWorkerSimulator } from '../workers/worker-simulator.js';
import {
  TaskScheduler,
  createTaskScheduler,
  generateBenchmarkFilters,
  generateBenchmarkAggregations,
} from '../workers/task-scheduler.js';

// Scenarios
import { benchmarkConcurrentQueries } from '../scenarios/concurrent-queries.js';
import { benchmarkParallelScan } from '../scenarios/partition-parallel-scan.js';
import { benchmarkCacheEffectiveness } from '../scenarios/cache-effectiveness.js';
import { benchmarkScatterGather } from '../scenarios/scatter-gather.js';

// Baselines
import {
  CLICKBENCH_BASELINE,
  compareToBaseline,
  estimateWorkloadCost,
} from '../baselines/clickhouse-baselines.js';

// =============================================================================
// Utility Tests
// =============================================================================

describe('Utilities', () => {
  describe('SeededRandom', () => {
    it('should produce reproducible sequences', () => {
      const r1 = createRandom(12345);
      const r2 = createRandom(12345);

      const seq1 = Array.from({ length: 10 }, () => r1.random());
      const seq2 = Array.from({ length: 10 }, () => r2.random());

      expect(seq1).toEqual(seq2);
    });

    it('should generate integers in range', () => {
      const r = createRandom(42);
      const values = Array.from({ length: 1000 }, () => r.int(0, 100));

      expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...values)).toBeLessThanOrEqual(100);
    });

    it('should generate Zipf distribution', () => {
      const r = createRandom(42);
      const counts = new Map<number, number>();

      for (let i = 0; i < 10000; i++) {
        const value = r.zipf(10, 1.0);
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }

      // First item should be most frequent
      const count0 = counts.get(0) ?? 0;
      const count9 = counts.get(9) ?? 0;
      expect(count0).toBeGreaterThan(count9);
    });

    it('should generate UUIDs', () => {
      const r = createRandom(42);
      const uuid = r.uuid();

      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe('Metrics Computation', () => {
    it('should compute latency metrics correctly', () => {
      const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const metrics = computeLatencyMetrics(samples);

      expect(metrics.min).toBe(10);
      expect(metrics.max).toBe(100);
      expect(metrics.mean).toBe(55);
      expect(metrics.p50).toBe(55);
      expect(metrics.p95).toBeCloseTo(95.5, 1);
    });

    it('should compute throughput metrics', () => {
      const metrics = computeThroughputMetrics(1000, 1000, 100000, 1000000);

      expect(metrics.qps).toBe(1000);
      expect(metrics.rowsPerSecond).toBe(100000);
      expect(metrics.bytesPerSecond).toBe(1000000);
    });

    it('should compute cost metrics', () => {
      const metrics = computeCostMetrics(1000000, 10000, 1000, 100, 0);

      expect(metrics.costPerQuery).toBeGreaterThan(0);
      expect(metrics.costPerMillionQueries).toBeGreaterThan(0);
    });

    it('should create histogram', () => {
      const samples = Array.from({ length: 100 }, (_, i) => i);
      const histogram = createHistogram(samples, 10);

      expect(histogram.length).toBe(10);
      expect(histogram.reduce((sum, b) => sum + b.count, 0)).toBe(100);
    });
  });

  describe('Formatting', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500.00 B');
      expect(formatBytes(1500)).toBe('1.46 KB');
      expect(formatBytes(1500000)).toBe('1.43 MB');
      expect(formatBytes(1500000000)).toBe('1.40 GB');
    });

    it('should format duration correctly', () => {
      expect(formatDuration(0.5)).toBe('500.00us');
      expect(formatDuration(100)).toBe('100.00ms');
      expect(formatDuration(5000)).toBe('5.00s');
      expect(formatDuration(120000)).toBe('2.00min');
    });

    it('should format numbers correctly', () => {
      expect(formatNumber(500)).toBe('500');
      expect(formatNumber(1500)).toBe('1.50K');
      expect(formatNumber(1500000)).toBe('1.50M');
    });
  });

  describe('Scaling Calculations', () => {
    it('should calculate speedup', () => {
      expect(calculateSpeedup(100, 50)).toBe(2);
      expect(calculateSpeedup(100, 100)).toBe(1);
      expect(calculateSpeedup(100, 200)).toBe(0.5);
    });

    it('should calculate scaling efficiency', () => {
      // Perfect linear scaling
      expect(calculateScalingEfficiency(100, 400, 4)).toBe(1);

      // Sublinear scaling (80% efficiency)
      expect(calculateScalingEfficiency(100, 320, 4)).toBe(0.8);
    });
  });
});

// =============================================================================
// Data Generator Tests
// =============================================================================

describe('Data Generators', () => {
  describe('Schema Registry', () => {
    it('should list all available schemas', () => {
      const schemas = listSchemas();

      expect(schemas).toContain('user_activity');
      expect(schemas).toContain('ecommerce_events');
      expect(schemas).toContain('iot_sensors');
      expect(schemas).toContain('logs');
      expect(schemas).toContain('transactions');
    });

    it('should get schema by name', () => {
      const schema = getSchema('user_activity');

      expect(schema).toBeDefined();
      expect(schema!.name).toBe('user_activity');
      expect(schema!.columns.length).toBeGreaterThan(0);
    });

    it('should have valid user activity schema', () => {
      const schema = USER_ACTIVITY_SCHEMA;

      expect(schema.columns.some(c => c.primaryKey)).toBe(true);
      expect(schema.columns.some(c => c.partitionKey)).toBe(true);
      expect(schema.columns.some(c => c.nullable)).toBe(true);
    });
  });

  describe('Dataset Generation', () => {
    it('should generate small dataset (1K)', () => {
      const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '1K', { seed: 42 });

      expect(dataset.rowCount).toBe(1000);
      expect(dataset.partitions.length).toBe(1);
      expect(dataset.rows).toBeDefined();
      expect(dataset.rows!.length).toBe(1000);
    });

    it('should generate partitioned dataset (10K)', () => {
      const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '10K', { seed: 42 });

      expect(dataset.rowCount).toBe(10000);
      expect(dataset.partitions.length).toBe(4);
      expect(dataset.partitionData).toBeDefined();

      // Check partitions sum to total
      let totalRows = 0;
      for (const [, rows] of dataset.partitionData!) {
        totalRows += rows.length;
      }
      expect(totalRows).toBe(10000);
    });

    it('should generate column statistics', () => {
      const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '1K', { seed: 42 });
      const partition = dataset.partitions[0];

      expect(partition.columnStats).toBeDefined();
      expect(partition.columnStats['id']).toBeDefined();
      expect(partition.columnStats['id'].distinctCount).toBeGreaterThan(0);
    });

    it('should generate reproducible data with seed', () => {
      const d1 = generateForSize(USER_ACTIVITY_SCHEMA, '1K', { seed: 12345 });
      const d2 = generateForSize(USER_ACTIVITY_SCHEMA, '1K', { seed: 12345 });

      expect(d1.rows![0]).toEqual(d2.rows![0]);
    });

    it('should generate different schemas', () => {
      const ecommerce = generateForSize(ECOMMERCE_EVENTS_SCHEMA, '1K', { seed: 42 });
      const iot = generateForSize(IOT_SENSOR_SCHEMA, '1K', { seed: 42 });

      expect(ecommerce.schema.name).toBe('ecommerce_events');
      expect(iot.schema.name).toBe('iot_sensors');

      // Check schema-specific columns exist
      expect(ecommerce.rows![0]).toHaveProperty('product_id');
      expect(iot.rows![0]).toHaveProperty('sensor_type');
    });
  });

  describe('Streaming Generation', () => {
    it('should generate data via streaming', () => {
      const generator = new DataGenerator({
        schema: USER_ACTIVITY_SCHEMA,
        rowCount: 100,
        partitionCount: 2,
        partitionKey: 'timestamp',
        seed: 42,
      });

      const rows: unknown[] = [];
      for (const row of generator.generateStreaming()) {
        rows.push(row);
        if (rows.length >= 10) break;
      }

      expect(rows.length).toBe(10);
    });
  });
});

// =============================================================================
// Workers Simulation Tests
// =============================================================================

describe('Workers Simulation', () => {
  describe('WorkerSimulator', () => {
    it('should create simulator with correct worker count', () => {
      const simulator = createWorkerSimulator({ workerCount: 4 });
      const stats = simulator.getWorkerStats();

      expect(stats.length).toBe(4);
      expect(stats.every(w => w.status === 'idle')).toBe(true);
    });

    it('should execute tasks and return results', async () => {
      const simulator = createWorkerSimulator({ workerCount: 2 });
      const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '1K', { seed: 42 });

      const tasks = [
        { id: 't1', type: 'scan' as const, partitions: [dataset.partitions[0].id], priority: 1, deadlineMs: 30000 },
      ];

      const results = await simulator.executeTasks(tasks, dataset.partitions, dataset.partitionData);

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(true);
      expect(results[0].rowsScanned).toBeGreaterThan(0);
    });

    it('should track cache metrics', async () => {
      const simulator = createWorkerSimulator({
        workerCount: 2,
        cache: { enabled: true, hitRatio: 0.5, hitLatencyMs: 1, missLatencyMs: 5 },
      });

      const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '1K', { seed: 42 });

      // Execute same task multiple times
      for (let i = 0; i < 10; i++) {
        const tasks = [
          { id: `t${i}`, type: 'scan' as const, partitions: [dataset.partitions[0].id], priority: 1, deadlineMs: 30000 },
        ];
        await simulator.executeTasks(tasks, dataset.partitions, dataset.partitionData);
      }

      const metrics = simulator.getCacheMetrics();

      expect(metrics.hits + metrics.misses).toBe(10);
      expect(metrics.hitRatio).toBeGreaterThanOrEqual(0);
      expect(metrics.hitRatio).toBeLessThanOrEqual(1);
    });

    it('should reset statistics', async () => {
      const simulator = createWorkerSimulator({ workerCount: 2 });
      const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '1K', { seed: 42 });

      const tasks = [
        { id: 't1', type: 'scan' as const, partitions: [dataset.partitions[0].id], priority: 1, deadlineMs: 30000 },
      ];
      await simulator.executeTasks(tasks, dataset.partitions, dataset.partitionData);

      simulator.reset();

      const stats = simulator.getAggregateStats();
      expect(stats.totalQueries).toBe(0);
    });
  });

  describe('TaskScheduler', () => {
    it('should create scan tasks for all partitions', () => {
      const scheduler = createTaskScheduler({ workerCount: 4 });
      const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '10K', { seed: 42 });

      const tasks = scheduler.createScanTasks(dataset.partitions);

      expect(tasks.length).toBe(dataset.partitions.length);
      expect(tasks.every(t => t.type === 'scan')).toBe(true);
    });

    it('should create parallel scan tasks', () => {
      const scheduler = createTaskScheduler({ workerCount: 4 });
      const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '10K', { seed: 42 });

      const tasks = scheduler.createParallelScanTasks(dataset.partitions, 4);

      expect(tasks.length).toBe(4);
      // Each task should have ~1 partition
      expect(tasks.every(t => t.partitions.length >= 1)).toBe(true);
    });

    it('should create aggregation tasks', () => {
      const scheduler = createTaskScheduler({ workerCount: 4 });
      const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '10K', { seed: 42 });

      const tasks = scheduler.createAggregationTasks(dataset.partitions, {
        function: 'sum',
        column: 'session_duration_ms',
      });

      expect(tasks.length).toBe(dataset.partitions.length);
      expect(tasks.every(t => t.type === 'aggregate')).toBe(true);
    });

    it('should generate benchmark filters', () => {
      const filters = generateBenchmarkFilters('user_activity');

      expect(filters.length).toBeGreaterThan(0);
      expect(filters.some(f => f.column === 'event_type')).toBe(true);
    });

    it('should generate benchmark aggregations', () => {
      const aggregations = generateBenchmarkAggregations('ecommerce_events');

      expect(aggregations.length).toBeGreaterThan(0);
      expect(aggregations.some(a => a.function === 'sum')).toBe(true);
    });

    it('should distribute tasks round-robin', () => {
      const scheduler = createTaskScheduler({ workerCount: 4, strategy: 'round_robin' });
      const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '10K', { seed: 42 });

      const tasks = scheduler.createScanTasks(dataset.partitions);
      const distribution = scheduler.distributeTasks(tasks, dataset.partitions);

      // Each worker should have ~1 task
      for (const [, workerTasks] of distribution) {
        expect(workerTasks.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});

// =============================================================================
// Scenario Tests
// =============================================================================

describe('Benchmark Scenarios', () => {
  let dataset: ReturnType<typeof generateForSize>;

  beforeAll(() => {
    // Generate a small dataset for testing scenarios
    dataset = generateForSize(USER_ACTIVITY_SCHEMA, '10K', { seed: 42, includeData: true });
  });

  describe('Concurrent Queries Scenario', () => {
    it('should run concurrent queries benchmark', async () => {
      const result = await benchmarkConcurrentQueries(dataset.partitions, {
        workerCount: 2,
        simulatedUsers: 10,
        queries: 50,
        schemaName: 'user_activity',
        data: dataset.partitionData,
      });

      expect(result.scenario).toBe('concurrent_queries');
      expect(result.throughput.qps).toBeGreaterThan(0);
      expect(result.latency.p50).toBeGreaterThan(0);
      expect(result.samples).toBeDefined();
      expect(result.samples!.length).toBe(50);
    }, 30000);
  });

  describe('Partition Parallel Scan Scenario', () => {
    it('should run parallel scan benchmark', async () => {
      const { results, speedups, scalingEfficiencies } = await benchmarkParallelScan(
        dataset.partitions,
        {
          workerCounts: [1, 2],
          data: dataset.partitionData,
        }
      );

      expect(results.size).toBe(2);
      expect(speedups.get(1)).toBe(1);
      expect(speedups.get(2)).toBeGreaterThanOrEqual(1); // Should be at least as fast

      // Check scaling efficiency
      const efficiency = scalingEfficiencies.get(2);
      expect(efficiency).toBeDefined();
      expect(efficiency).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Cache Effectiveness Scenario', () => {
    it('should run cache effectiveness benchmark', async () => {
      const { cold, warm, improvement } = await benchmarkCacheEffectiveness(
        dataset.partitions,
        {
          workerCount: 2,
          warmupQueries: 20,
          measurementQueries: 50,
          data: dataset.partitionData,
        }
      );

      expect(cold.scenario).toBe('cache_effectiveness');
      expect(warm.scenario).toBe('cache_effectiveness');

      // Warm cache should have better cache metrics
      expect(warm.cache?.hitRatio).toBeGreaterThanOrEqual(cold.cache?.hitRatio ?? 0);
    }, 30000);
  });

  describe('Scatter-Gather Scenario', () => {
    it('should run scatter-gather benchmark', async () => {
      const result = await benchmarkScatterGather(dataset.partitions, {
        workerCount: 2,
        scatterFanOut: 2,
        queries: 20,
        schemaName: 'user_activity',
        data: dataset.partitionData,
      });

      expect(result.scenario).toBe('scatter_gather');
      expect(result.throughput.qps).toBeGreaterThan(0);
      expect(result.metadata?.scatterFanOut).toBe(2);
    }, 30000);
  });
});

// =============================================================================
// Baseline Comparison Tests
// =============================================================================

describe('Baseline Comparisons', () => {
  describe('ClickBench Baseline', () => {
    it('should have valid baseline data', () => {
      expect(CLICKBENCH_BASELINE.results.length).toBeGreaterThan(0);
      expect(CLICKBENCH_BASELINE.results[0].executionTimeSec).toBeGreaterThan(0);
    });

    it('should compare results to baseline', () => {
      const comparison = compareToBaseline(
        {
          queryType: 'count',
          executionTimeSec: 0.01,
          rowsProcessed: 100000000,
          costUsd: 0.000001,
        },
        CLICKBENCH_BASELINE,
        'Q0'
      );

      expect(comparison.baselineResult).toBeDefined();
      expect(comparison.speedup).toBeGreaterThan(0);
      expect(comparison.notes.length).toBeGreaterThan(0);
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate workload cost', () => {
      const cost = estimateWorkloadCost({
        queriesPerMonth: 1000000,
        avgCpuTimeMs: 10,
        avgR2ReadsPerQuery: 2,
        avgBytesPerQuery: 1000000,
        cacheHitRatio: 0.8,
      });

      expect(cost.totalCost).toBeGreaterThan(0);
      expect(cost.costPerQuery).toBeGreaterThan(0);
      expect(cost.workersCost).toBeGreaterThanOrEqual(0);
      expect(cost.r2Cost).toBeGreaterThanOrEqual(0);
    });

    it('should show cost savings with high cache hit ratio', () => {
      const lowCacheHit = estimateWorkloadCost({
        queriesPerMonth: 1000000,
        avgCpuTimeMs: 10,
        avgR2ReadsPerQuery: 2,
        avgBytesPerQuery: 1000000,
        cacheHitRatio: 0.2,
      });

      const highCacheHit = estimateWorkloadCost({
        queriesPerMonth: 1000000,
        avgCpuTimeMs: 10,
        avgR2ReadsPerQuery: 2,
        avgBytesPerQuery: 1000000,
        cacheHitRatio: 0.9,
      });

      // Higher cache hit ratio should result in lower R2 costs
      expect(highCacheHit.r2Cost).toBeLessThan(lowCacheHit.r2Cost);
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  it('should run end-to-end benchmark workflow', async () => {
    // 1. Generate data
    const dataset = generateForSize(USER_ACTIVITY_SCHEMA, '1K', { seed: 42, includeData: true });
    expect(dataset.rows!.length).toBe(1000);

    // 2. Create simulator
    const simulator = createWorkerSimulator({ workerCount: 2 });

    // 3. Create scheduler
    const scheduler = createTaskScheduler({ workerCount: 2 });

    // 4. Create and execute tasks
    const tasks = scheduler.createScanTasks(dataset.partitions);
    const results = await simulator.executeTasks(tasks, dataset.partitions, dataset.partitionData);

    // 5. Verify results
    expect(results.length).toBe(dataset.partitions.length);
    expect(results.every(r => r.success)).toBe(true);

    // 6. Check metrics
    const cacheMetrics = simulator.getCacheMetrics();
    expect(cacheMetrics.hits + cacheMetrics.misses).toBeGreaterThan(0);

    // 7. Compute latency metrics
    const latencySamples = results.map(r => r.executionTimeMs);
    const latency = computeLatencyMetrics(latencySamples);
    expect(latency.p50).toBeGreaterThan(0);
  }, 30000);
});
