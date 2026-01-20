/**
 * @evodb/benchmark - Concurrent Queries Scenario
 *
 * Simulates concurrent query execution from multiple users (1K, 10K users).
 * Measures QPS, latency distribution, and scaling characteristics.
 */

import type {
  BenchmarkResult,
  ConcurrentQueriesConfig,
  PartitionMetadata,
  ResourceMetrics,
} from '../types.js';
import { WorkerSimulator, createWorkerSimulator } from '../workers/worker-simulator.js';
import {
  TaskScheduler,
  createTaskScheduler,
  generateBenchmarkFilters,
  generateBenchmarkAggregations,
} from '../workers/task-scheduler.js';
import {
  computeLatencyMetrics,
  computeThroughputMetrics,
  computeCostMetrics,
} from '../utils/metrics.js';
import { createRandom, SeededRandom } from '../utils/random.js';

/**
 * Default concurrent queries configuration
 */
export const DEFAULT_CONCURRENT_CONFIG: ConcurrentQueriesConfig = {
  type: 'concurrent_queries',
  concurrency: 100,
  dataSize: '100K',
  workerCount: 4,
  enableCache: true,
  cacheTtlSeconds: 300,
  simulatedUsers: 1000,
  readWriteRatio: 0.95, // 95% reads
  thinkTimeMs: 100,
  queryComplexity: 'mixed',
};

/**
 * Concurrent Queries Benchmark Scenario
 */
export class ConcurrentQueriesScenario {
  private readonly config: ConcurrentQueriesConfig;
  private readonly random: SeededRandom;
  private simulator: WorkerSimulator;
  private scheduler: TaskScheduler;

  constructor(config: Partial<ConcurrentQueriesConfig> = {}) {
    this.config = { ...DEFAULT_CONCURRENT_CONFIG, ...config };
    this.random = createRandom(Date.now());
    this.simulator = createWorkerSimulator({
      workerCount: this.config.workerCount,
      cache: {
        enabled: this.config.enableCache,
        hitRatio: 0.7, // Target 70% cache hit for concurrent workload
        hitLatencyMs: 1,
        missLatencyMs: 5,
      },
    });
    this.scheduler = createTaskScheduler({
      workerCount: this.config.workerCount,
      strategy: 'load_balanced',
    });
  }

  /**
   * Run the concurrent queries benchmark
   */
  async run(
    partitions: PartitionMetadata[],
    data?: Map<string, Record<string, unknown>[]>,
    options?: {
      warmupQueries?: number;
      measurementQueries?: number;
      schemaName?: string;
    }
  ): Promise<BenchmarkResult> {
    const warmupQueries = options?.warmupQueries ?? 100;
    const measurementQueries = options?.measurementQueries ?? 1000;
    const schemaName = options?.schemaName ?? 'user_activity';

    // Generate query workload
    const filters = generateBenchmarkFilters(schemaName);
    const aggregations = generateBenchmarkAggregations(schemaName);

    // Warmup phase
    console.log(`  Running warmup (${warmupQueries} queries)...`);
    await this.runWorkload(partitions, warmupQueries, filters, aggregations, data);
    this.simulator.reset();

    // Measurement phase
    console.log(`  Running measurement (${measurementQueries} queries, ${this.config.simulatedUsers} simulated users)...`);
    const startTime = performance.now();

    const latencySamples: number[] = [];
    let totalRowsScanned = 0;
    let totalBytesScanned = 0;
    let completedQueries = 0;

    // Simulate concurrent users
    const batchSize = Math.min(this.config.concurrency, measurementQueries);
    const batches = Math.ceil(measurementQueries / batchSize);

    for (let batch = 0; batch < batches; batch++) {
      const queriesInBatch = Math.min(batchSize, measurementQueries - completedQueries);

      // Generate tasks for this batch
      const tasks = this.scheduler.createConcurrentWorkload(
        partitions,
        queriesInBatch,
        {
          queryTypes: this.getQueryTypes(),
          filters,
          aggregations,
        }
      );

      // Execute batch
      const results = await this.simulator.executeTasks(tasks, partitions, data);

      // Collect metrics
      for (const result of results) {
        latencySamples.push(result.executionTimeMs);
        totalRowsScanned += result.rowsScanned;
        totalBytesScanned += result.bytesScanned;
        completedQueries++;
      }

      // Simulate think time between batches
      if (this.config.thinkTimeMs > 0 && batch < batches - 1) {
        await this.simulateThinkTime();
      }
    }

    const totalDuration = performance.now() - startTime;

    // Compute metrics
    const latency = computeLatencyMetrics(latencySamples);
    const throughput = computeThroughputMetrics(
      completedQueries,
      totalDuration,
      totalRowsScanned,
      totalBytesScanned
    );
    const cache = this.simulator.getCacheMetrics();
    const workerStats = this.simulator.getAggregateStats();

    const cost = computeCostMetrics(
      completedQueries,
      workerStats.totalCpuTimeMs,
      Math.ceil(totalBytesScanned / (64 * 1024 * 1024)), // Estimate R2 reads
      0, // No writes in this benchmark
      0 // No external egress
    );

    const resources: ResourceMetrics = {
      peakMemoryBytes: 0, // Would need actual measurement
      avgCpuUtilization: workerStats.totalCpuTimeMs / totalDuration,
      bytesScanned: totalBytesScanned,
      networkBytesTransferred: totalBytesScanned,
    };

    return {
      scenario: 'concurrent_queries',
      config: this.config,
      timestamp: Date.now(),
      durationMs: totalDuration,
      latency,
      throughput,
      cache,
      resources,
      cost,
      samples: latencySamples,
      metadata: {
        completedQueries,
        simulatedUsers: this.config.simulatedUsers,
        workerCount: this.config.workerCount,
        cacheEnabled: this.config.enableCache,
      },
    };
  }

  /**
   * Run workload without collecting metrics (for warmup)
   */
  private async runWorkload(
    partitions: PartitionMetadata[],
    queryCount: number,
    filters: ReturnType<typeof generateBenchmarkFilters>,
    aggregations: ReturnType<typeof generateBenchmarkAggregations>,
    data?: Map<string, Record<string, unknown>[]>
  ): Promise<void> {
    const tasks = this.scheduler.createConcurrentWorkload(
      partitions,
      queryCount,
      {
        queryTypes: this.getQueryTypes(),
        filters,
        aggregations,
      }
    );

    await this.simulator.executeTasks(tasks, partitions, data);
  }

  /**
   * Get query types based on complexity setting
   */
  private getQueryTypes(): Array<'scan' | 'filter' | 'aggregate'> {
    switch (this.config.queryComplexity) {
      case 'simple':
        return ['scan'];
      case 'medium':
        return ['scan', 'filter'];
      case 'complex':
        return ['filter', 'aggregate'];
      case 'mixed':
      default:
        return ['scan', 'filter', 'aggregate'];
    }
  }

  /**
   * Simulate user think time
   */
  private async simulateThinkTime(): Promise<void> {
    const thinkTime = this.random.exponential(1 / this.config.thinkTimeMs);
    await new Promise(resolve => setTimeout(resolve, Math.min(thinkTime, 1)));
  }

  /**
   * Run scaling benchmark (varying worker count)
   */
  async runScalingBenchmark(
    partitions: PartitionMetadata[],
    workerCounts: number[],
    data?: Map<string, Record<string, unknown>[]>,
    options?: {
      schemaName?: string;
      queriesPerRun?: number;
    }
  ): Promise<Map<number, BenchmarkResult>> {
    const results = new Map<number, BenchmarkResult>();
    const queriesPerRun = options?.queriesPerRun ?? 500;

    for (const workerCount of workerCounts) {
      console.log(`\nTesting with ${workerCount} workers...`);

      // Reconfigure simulator
      this.simulator = createWorkerSimulator({
        workerCount,
        cache: {
          enabled: this.config.enableCache,
          hitRatio: 0.7,
          hitLatencyMs: 1,
          missLatencyMs: 5,
        },
      });
      this.scheduler = createTaskScheduler({
        workerCount,
        strategy: 'load_balanced',
      });

      const result = await this.run(partitions, data, {
        warmupQueries: 50,
        measurementQueries: queriesPerRun,
        schemaName: options?.schemaName,
      });

      results.set(workerCount, result);
    }

    return results;
  }

  /**
   * Run concurrency benchmark (varying user count)
   */
  async runConcurrencyBenchmark(
    partitions: PartitionMetadata[],
    userCounts: number[],
    data?: Map<string, Record<string, unknown>[]>,
    options?: {
      schemaName?: string;
      queriesPerRun?: number;
    }
  ): Promise<Map<number, BenchmarkResult>> {
    const results = new Map<number, BenchmarkResult>();
    const queriesPerRun = options?.queriesPerRun ?? 500;

    for (const userCount of userCounts) {
      console.log(`\nTesting with ${userCount} simulated users...`);

      // Update config
      this.config.simulatedUsers = userCount;
      this.config.concurrency = Math.min(userCount, 100);

      // Reset simulator
      this.simulator.reset();

      const result = await this.run(partitions, data, {
        warmupQueries: 50,
        measurementQueries: queriesPerRun,
        schemaName: options?.schemaName,
      });

      results.set(userCount, result);
    }

    return results;
  }
}

/**
 * Create concurrent queries scenario
 */
export function createConcurrentQueriesScenario(
  config?: Partial<ConcurrentQueriesConfig>
): ConcurrentQueriesScenario {
  return new ConcurrentQueriesScenario(config);
}

/**
 * Quick benchmark function for concurrent queries
 */
export async function benchmarkConcurrentQueries(
  partitions: PartitionMetadata[],
  options?: {
    workerCount?: number;
    simulatedUsers?: number;
    queries?: number;
    schemaName?: string;
    enableCache?: boolean;
    data?: Map<string, Record<string, unknown>[]>;
  }
): Promise<BenchmarkResult> {
  const scenario = createConcurrentQueriesScenario({
    workerCount: options?.workerCount ?? 4,
    simulatedUsers: options?.simulatedUsers ?? 1000,
    enableCache: options?.enableCache ?? true,
  });

  return scenario.run(partitions, options?.data, {
    measurementQueries: options?.queries ?? 1000,
    schemaName: options?.schemaName ?? 'user_activity',
  });
}
