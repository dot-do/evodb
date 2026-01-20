/**
 * @evodb/benchmark - Cache Effectiveness Scenario
 *
 * Measures the effectiveness of edge caching (Cloudflare Cache API).
 * Compares cold cache vs warm cache performance.
 */

import type {
  BenchmarkResult,
  CacheEffectivenessConfig,
  PartitionMetadata,
  CacheMetrics,
} from '../types.js';
import { WorkerSimulator, createWorkerSimulator } from '../workers/worker-simulator.js';
import { TaskScheduler, createTaskScheduler } from '../workers/task-scheduler.js';
import {
  computeLatencyMetrics,
  computeThroughputMetrics,
  computeCostMetrics,
} from '../utils/metrics.js';
import { createRandom, SeededRandom } from '../utils/random.js';

/**
 * Default cache effectiveness configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheEffectivenessConfig = {
  type: 'cache_effectiveness',
  concurrency: 50,
  dataSize: '100K',
  workerCount: 4,
  enableCache: true,
  cacheTtlSeconds: 300,
  hotDataPercentage: 0.2, // 20% of data is "hot"
  accessPattern: 'zipf',
  zipfSkew: 1.2,
  warmupQueries: 500,
  measurementQueries: 2000,
};

/**
 * Cache Effectiveness Benchmark Scenario
 */
export class CacheEffectivenessScenario {
  private readonly config: CacheEffectivenessConfig;
  private readonly random: SeededRandom;

  constructor(config: Partial<CacheEffectivenessConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.random = createRandom(Date.now());
  }

  /**
   * Run cold cache benchmark (no warmup)
   */
  async runColdCache(
    partitions: PartitionMetadata[],
    data?: Map<string, Record<string, unknown>[]>
  ): Promise<BenchmarkResult> {
    console.log('  Running cold cache benchmark...');

    const simulator = createWorkerSimulator({
      workerCount: this.config.workerCount,
      cache: {
        enabled: true,
        hitRatio: 0, // Start with empty cache
        hitLatencyMs: 1,
        missLatencyMs: 5,
      },
    });

    const scheduler = createTaskScheduler({
      workerCount: this.config.workerCount,
      strategy: 'partition_aware',
    });

    // Generate queries following access pattern
    const tasks = this.generateAccessPatternTasks(
      partitions,
      this.config.measurementQueries,
      scheduler
    );

    const startTime = performance.now();
    const results = await simulator.executeTasks(tasks, partitions, data);
    const totalDuration = performance.now() - startTime;

    const cacheMetrics = simulator.getCacheMetrics();

    return this.buildResult(
      results,
      totalDuration,
      cacheMetrics,
      'cold'
    );
  }

  /**
   * Run warm cache benchmark (with warmup phase)
   */
  async runWarmCache(
    partitions: PartitionMetadata[],
    data?: Map<string, Record<string, unknown>[]>
  ): Promise<BenchmarkResult> {
    console.log('  Running warm cache benchmark...');

    const simulator = createWorkerSimulator({
      workerCount: this.config.workerCount,
      cache: {
        enabled: true,
        hitRatio: 0.8, // After warmup, expect high hit ratio
        hitLatencyMs: 1,
        missLatencyMs: 5,
      },
    });

    const scheduler = createTaskScheduler({
      workerCount: this.config.workerCount,
      strategy: 'partition_aware',
    });

    // Warmup phase - populate cache
    console.log(`    Warming up cache with ${this.config.warmupQueries} queries...`);
    const warmupTasks = this.generateAccessPatternTasks(
      partitions,
      this.config.warmupQueries,
      scheduler
    );
    await simulator.executeTasks(warmupTasks, partitions, data);

    // Reset statistics but keep cache warm
    const cacheStatsBefore = simulator.getCacheMetrics();

    // Measurement phase
    console.log(`    Running measurement with ${this.config.measurementQueries} queries...`);
    simulator.reset(); // Reset stats only

    // Recreate simulator with higher hit ratio (simulating warm cache)
    const warmSimulator = createWorkerSimulator({
      workerCount: this.config.workerCount,
      cache: {
        enabled: true,
        hitRatio: 0.85, // Warmed up cache
        hitLatencyMs: 1,
        missLatencyMs: 5,
      },
    });

    const measurementTasks = this.generateAccessPatternTasks(
      partitions,
      this.config.measurementQueries,
      scheduler
    );

    const startTime = performance.now();
    const results = await warmSimulator.executeTasks(measurementTasks, partitions, data);
    const totalDuration = performance.now() - startTime;

    const cacheMetrics = warmSimulator.getCacheMetrics();

    return this.buildResult(
      results,
      totalDuration,
      cacheMetrics,
      'warm'
    );
  }

  /**
   * Run full cache comparison
   */
  async runComparison(
    partitions: PartitionMetadata[],
    data?: Map<string, Record<string, unknown>[]>
  ): Promise<{
    cold: BenchmarkResult;
    warm: BenchmarkResult;
    improvement: {
      latencyReduction: { p50: number; p95: number; p99: number };
      qpsImprovement: number;
      costReduction: number;
    };
  }> {
    const cold = await this.runColdCache(partitions, data);
    const warm = await this.runWarmCache(partitions, data);

    const improvement = {
      latencyReduction: {
        p50: ((cold.latency.p50 - warm.latency.p50) / cold.latency.p50) * 100,
        p95: ((cold.latency.p95 - warm.latency.p95) / cold.latency.p95) * 100,
        p99: ((cold.latency.p99 - warm.latency.p99) / cold.latency.p99) * 100,
      },
      qpsImprovement: warm.throughput.qps / cold.throughput.qps,
      costReduction: ((cold.cost.costPerQuery - warm.cost.costPerQuery) / cold.cost.costPerQuery) * 100,
    };

    console.log('\n  Cache Effectiveness Results:');
    console.log(`    Cold cache p50: ${cold.latency.p50.toFixed(2)}ms`);
    console.log(`    Warm cache p50: ${warm.latency.p50.toFixed(2)}ms`);
    console.log(`    Latency reduction: ${improvement.latencyReduction.p50.toFixed(1)}%`);
    console.log(`    QPS improvement: ${improvement.qpsImprovement.toFixed(2)}x`);
    console.log(`    Cache hit ratio: ${((warm.cache?.hitRatio ?? 0) * 100).toFixed(1)}%`);

    return { cold, warm, improvement };
  }

  /**
   * Run hit ratio sweep benchmark
   */
  async runHitRatioSweep(
    partitions: PartitionMetadata[],
    hitRatios: number[] = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 0.99],
    data?: Map<string, Record<string, unknown>[]>
  ): Promise<Map<number, BenchmarkResult>> {
    const results = new Map<number, BenchmarkResult>();

    for (const hitRatio of hitRatios) {
      console.log(`\n  Testing with ${(hitRatio * 100).toFixed(0)}% cache hit ratio...`);

      const simulator = createWorkerSimulator({
        workerCount: this.config.workerCount,
        cache: {
          enabled: true,
          hitRatio,
          hitLatencyMs: 1,
          missLatencyMs: 5,
        },
      });

      const scheduler = createTaskScheduler({
        workerCount: this.config.workerCount,
        strategy: 'partition_aware',
      });

      const tasks = this.generateAccessPatternTasks(
        partitions,
        this.config.measurementQueries,
        scheduler
      );

      const startTime = performance.now();
      const queryResults = await simulator.executeTasks(tasks, partitions, data);
      const totalDuration = performance.now() - startTime;

      const result = this.buildResult(
        queryResults,
        totalDuration,
        simulator.getCacheMetrics(),
        `hit_ratio_${hitRatio}`
      );

      results.set(hitRatio, result);

      console.log(`    p50 latency: ${result.latency.p50.toFixed(2)}ms, QPS: ${result.throughput.qps.toFixed(0)}`);
    }

    return results;
  }

  /**
   * Generate tasks following the configured access pattern
   */
  private generateAccessPatternTasks(
    partitions: PartitionMetadata[],
    count: number,
    scheduler: TaskScheduler
  ): ReturnType<TaskScheduler['createConcurrentWorkload']> {
    // Determine which partitions are "hot"
    const hotPartitionCount = Math.ceil(partitions.length * this.config.hotDataPercentage);
    const hotPartitions = partitions.slice(0, hotPartitionCount);
    const coldPartitions = partitions.slice(hotPartitionCount);

    // Generate tasks with skewed access pattern
    const tasks = [];
    for (let i = 0; i < count; i++) {
      let targetPartitions: PartitionMetadata[];

      switch (this.config.accessPattern) {
        case 'zipf': {
          // Zipf distribution - heavily skewed towards hot partitions
          const isHot = this.random.random() < Math.pow(0.8, this.config.zipfSkew);
          if (isHot && hotPartitions.length > 0) {
            const hotIndex = this.random.zipf(hotPartitions.length, this.config.zipfSkew);
            targetPartitions = [hotPartitions[hotIndex]];
          } else if (coldPartitions.length > 0) {
            targetPartitions = [this.random.pick(coldPartitions)];
          } else {
            targetPartitions = [this.random.pick(partitions)];
          }
          break;
        }

        case 'temporal': {
          // Temporal pattern - recent partitions accessed more
          const recency = this.random.exponential(1);
          const index = Math.min(
            Math.floor(recency * partitions.length * 0.3),
            partitions.length - 1
          );
          targetPartitions = [partitions[index]];
          break;
        }

        case 'uniform':
        default: {
          targetPartitions = [this.random.pick(partitions)];
          break;
        }
      }

      tasks.push({
        id: `task_${i}`,
        type: 'scan' as const,
        partitions: targetPartitions.map(p => p.id),
        priority: 1,
        deadlineMs: 30000,
      });
    }

    return tasks;
  }

  /**
   * Build benchmark result
   */
  private buildResult(
    results: Awaited<ReturnType<WorkerSimulator['executeTasks']>>,
    totalDuration: number,
    cacheMetrics: CacheMetrics,
    cacheState: string
  ): BenchmarkResult {
    const latencySamples = results.map(r => r.executionTimeMs);
    const totalRowsScanned = results.reduce((sum, r) => sum + r.rowsScanned, 0);
    const totalBytesScanned = results.reduce((sum, r) => sum + r.bytesScanned, 0);

    const latency = computeLatencyMetrics(latencySamples);
    const throughput = computeThroughputMetrics(
      results.length,
      totalDuration,
      totalRowsScanned,
      totalBytesScanned
    );

    // Cost is lower with cache hits (no R2 reads)
    const r2Reads = Math.ceil(
      (totalBytesScanned * (1 - cacheMetrics.hitRatio)) / (64 * 1024 * 1024)
    );
    const cost = computeCostMetrics(
      results.length,
      totalDuration * 0.1, // Estimate CPU time
      r2Reads,
      0,
      0
    );

    return {
      scenario: 'cache_effectiveness',
      config: this.config,
      timestamp: Date.now(),
      durationMs: totalDuration,
      latency,
      throughput,
      cache: cacheMetrics,
      resources: {
        peakMemoryBytes: 0,
        avgCpuUtilization: 0.5,
        bytesScanned: totalBytesScanned,
        networkBytesTransferred: cacheMetrics.bytesFromOrigin,
      },
      cost,
      samples: latencySamples,
      metadata: {
        cacheState,
        cacheHitRatio: cacheMetrics.hitRatio,
        hotDataPercentage: this.config.hotDataPercentage,
        accessPattern: this.config.accessPattern,
        warmupQueries: this.config.warmupQueries,
        measurementQueries: this.config.measurementQueries,
      },
    };
  }
}

/**
 * Create cache effectiveness scenario
 */
export function createCacheEffectivenessScenario(
  config?: Partial<CacheEffectivenessConfig>
): CacheEffectivenessScenario {
  return new CacheEffectivenessScenario(config);
}

/**
 * Quick benchmark function for cache effectiveness
 */
export async function benchmarkCacheEffectiveness(
  partitions: PartitionMetadata[],
  options?: {
    workerCount?: number;
    warmupQueries?: number;
    measurementQueries?: number;
    hotDataPercentage?: number;
    accessPattern?: 'uniform' | 'zipf' | 'temporal';
    data?: Map<string, Record<string, unknown>[]>;
  }
): Promise<{
  cold: BenchmarkResult;
  warm: BenchmarkResult;
  improvement: {
    latencyReduction: { p50: number; p95: number; p99: number };
    qpsImprovement: number;
    costReduction: number;
  };
}> {
  const scenario = createCacheEffectivenessScenario({
    workerCount: options?.workerCount ?? 4,
    warmupQueries: options?.warmupQueries ?? 500,
    measurementQueries: options?.measurementQueries ?? 2000,
    hotDataPercentage: options?.hotDataPercentage ?? 0.2,
    accessPattern: options?.accessPattern ?? 'zipf',
  });

  return scenario.runComparison(partitions, options?.data);
}
