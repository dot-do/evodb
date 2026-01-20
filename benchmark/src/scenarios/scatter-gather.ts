/**
 * @evodb/benchmark - Scatter-Gather Pattern Scenario
 *
 * Benchmarks the scatter-gather pattern where complex queries are split
 * across partitions and results are aggregated.
 */

import type {
  BenchmarkResult,
  ScatterGatherConfig,
  PartitionMetadata,
  AggregationSpec,
  PartialAggregation,
  QueryResult,
} from '../types.js';
import { WorkerSimulator, createWorkerSimulator } from '../workers/worker-simulator.js';
import {
  TaskScheduler,
  createTaskScheduler,
  generateBenchmarkAggregations,
} from '../workers/task-scheduler.js';
import {
  computeLatencyMetrics,
  computeThroughputMetrics,
  computeCostMetrics,
} from '../utils/metrics.js';

/**
 * Default scatter-gather configuration
 */
export const DEFAULT_SCATTER_GATHER_CONFIG: ScatterGatherConfig = {
  type: 'scatter_gather',
  concurrency: 10,
  dataSize: '1M',
  workerCount: 8,
  enableCache: true,
  cacheTtlSeconds: 60,
  scatterFanOut: 8,
  aggregationType: 'sum',
  resultLimit: 1000,
  allowPartialResults: false,
  scatterTimeoutMs: 5000,
};

/**
 * Scatter-Gather query types
 */
export interface ScatterGatherQuery {
  /** Query ID */
  id: string;

  /** Aggregation to perform */
  aggregation: AggregationSpec;

  /** Filter to apply before aggregation */
  filter?: {
    column: string;
    operator: string;
    value: unknown;
  };

  /** Expected result type */
  resultType: 'single_value' | 'grouped' | 'topk';
}

/**
 * Scatter-Gather Benchmark Scenario
 */
export class ScatterGatherScenario {
  private readonly config: ScatterGatherConfig;

  constructor(config: Partial<ScatterGatherConfig> = {}) {
    this.config = { ...DEFAULT_SCATTER_GATHER_CONFIG, ...config };
  }

  /**
   * Run scatter-gather benchmark
   */
  async run(
    partitions: PartitionMetadata[],
    data?: Map<string, Record<string, unknown>[]>,
    options?: {
      queries?: number;
      schemaName?: string;
    }
  ): Promise<BenchmarkResult> {
    const queryCount = options?.queries ?? 100;
    const schemaName = options?.schemaName ?? 'ecommerce_events';

    console.log(`  Running scatter-gather benchmark (${queryCount} queries, ${this.config.scatterFanOut} fan-out)...`);

    const simulator = createWorkerSimulator({
      workerCount: this.config.workerCount,
      cache: {
        enabled: this.config.enableCache,
        hitRatio: 0.5, // Moderate cache hit for aggregation results
        hitLatencyMs: 1,
        missLatencyMs: 5,
      },
    });

    const scheduler = createTaskScheduler({
      workerCount: this.config.workerCount,
      strategy: 'partition_aware',
    });

    // Generate aggregation queries
    const aggregations = generateBenchmarkAggregations(schemaName);
    const latencySamples: number[] = [];
    let totalRowsScanned = 0;
    let totalBytesScanned = 0;

    const startTime = performance.now();

    for (let q = 0; q < queryCount; q++) {
      // Pick a random aggregation
      const aggregation = aggregations[q % aggregations.length];

      // Create scatter tasks
      const scatterBatch = scheduler.createScatterGatherBatch(
        partitions,
        aggregation,
        {
          limit: this.config.resultLimit,
          timeoutMs: this.config.scatterTimeoutMs,
        }
      );

      // Execute scatter phase
      const scatterStart = performance.now();
      const scatterResults = await simulator.executeTasks(
        scatterBatch.tasks,
        partitions,
        data
      );

      // Gather phase - merge partial results
      const gatherStart = performance.now();
      const mergedResult = this.gatherResults(scatterResults, aggregation);
      const gatherTime = performance.now() - gatherStart;

      const totalQueryTime = performance.now() - scatterStart;
      latencySamples.push(totalQueryTime);

      // Accumulate metrics
      for (const result of scatterResults) {
        totalRowsScanned += result.rowsScanned;
        totalBytesScanned += result.bytesScanned;
      }
    }

    const totalDuration = performance.now() - startTime;
    const cacheMetrics = simulator.getCacheMetrics();

    return this.buildResult(
      latencySamples,
      totalDuration,
      totalRowsScanned,
      totalBytesScanned,
      queryCount,
      cacheMetrics
    );
  }

  /**
   * Gather and merge partial results
   */
  private gatherResults(
    results: QueryResult[],
    aggregation: AggregationSpec
  ): unknown {
    const partialResults = results
      .filter(r => r.success && r.partialResult)
      .map(r => r.partialResult!);

    if (partialResults.length === 0) {
      return null;
    }

    // Merge based on aggregation type
    switch (aggregation.function) {
      case 'sum':
      case 'count':
        return partialResults.reduce((sum, p) => sum + p.value, 0);

      case 'avg': {
        const totalSum = partialResults.reduce((sum, p) => sum + p.value, 0);
        const totalCount = partialResults.reduce((sum, p) => sum + (p.count ?? 0), 0);
        return totalCount > 0 ? totalSum / totalCount : 0;
      }

      case 'min':
        return Math.min(...partialResults.map(p => p.value));

      case 'max':
        return Math.max(...partialResults.map(p => p.value));

      case 'distinct': {
        const allDistinct = new Set<unknown>();
        for (const p of partialResults) {
          if (p.distinctValues) {
            for (const v of p.distinctValues) {
              allDistinct.add(v);
            }
          }
        }
        return allDistinct.size;
      }

      default:
        return partialResults[0].value;
    }
  }

  /**
   * Run fan-out comparison benchmark
   */
  async runFanOutComparison(
    partitions: PartitionMetadata[],
    fanOutLevels: number[] = [1, 2, 4, 8, 16],
    data?: Map<string, Record<string, unknown>[]>,
    options?: {
      queriesPerLevel?: number;
      schemaName?: string;
    }
  ): Promise<{
    results: Map<number, BenchmarkResult>;
    speedups: Map<number, number>;
  }> {
    const results = new Map<number, BenchmarkResult>();
    const speedups = new Map<number, number>();

    let baselineTime: number | null = null;

    for (const fanOut of fanOutLevels) {
      console.log(`\n  Testing fan-out level ${fanOut}...`);

      // Adjust config
      this.config.scatterFanOut = fanOut;
      this.config.workerCount = Math.max(fanOut, 4);

      const result = await this.run(partitions, data, {
        queries: options?.queriesPerLevel ?? 50,
        schemaName: options?.schemaName,
      });

      results.set(fanOut, result);

      if (baselineTime === null) {
        baselineTime = result.durationMs;
        speedups.set(fanOut, 1.0);
      } else {
        const speedup = baselineTime / result.durationMs;
        speedups.set(fanOut, speedup);
        console.log(`    Speedup vs single: ${speedup.toFixed(2)}x`);
      }
    }

    return { results, speedups };
  }

  /**
   * Run aggregation type comparison
   */
  async runAggregationComparison(
    partitions: PartitionMetadata[],
    data?: Map<string, Record<string, unknown>[]>,
    options?: {
      queries?: number;
    }
  ): Promise<Map<string, BenchmarkResult>> {
    const results = new Map<string, BenchmarkResult>();
    const aggregationTypes: Array<'sum' | 'avg' | 'count' | 'min' | 'max' | 'distinct'> = [
      'sum', 'avg', 'count', 'min', 'max', 'distinct'
    ];

    for (const aggType of aggregationTypes) {
      console.log(`\n  Testing ${aggType} aggregation...`);

      this.config.aggregationType = aggType;

      const result = await this.run(partitions, data, {
        queries: options?.queries ?? 50,
      });

      results.set(aggType, result);

      console.log(`    p50 latency: ${result.latency.p50.toFixed(2)}ms, QPS: ${result.throughput.qps.toFixed(0)}`);
    }

    return results;
  }

  /**
   * Build benchmark result
   */
  private buildResult(
    latencySamples: number[],
    totalDuration: number,
    totalRowsScanned: number,
    totalBytesScanned: number,
    queryCount: number,
    cacheMetrics: ReturnType<WorkerSimulator['getCacheMetrics']>
  ): BenchmarkResult {
    const latency = computeLatencyMetrics(latencySamples);
    const throughput = computeThroughputMetrics(
      queryCount,
      totalDuration,
      totalRowsScanned,
      totalBytesScanned
    );

    const cost = computeCostMetrics(
      queryCount * this.config.scatterFanOut, // Each query fans out
      totalDuration * 0.2, // Estimate CPU time
      Math.ceil(totalBytesScanned / (64 * 1024 * 1024)),
      0,
      0
    );

    return {
      scenario: 'scatter_gather',
      config: this.config,
      timestamp: Date.now(),
      durationMs: totalDuration,
      latency,
      throughput,
      cache: cacheMetrics,
      resources: {
        peakMemoryBytes: 0,
        avgCpuUtilization: 0.6,
        bytesScanned: totalBytesScanned,
        networkBytesTransferred: totalBytesScanned,
      },
      cost,
      samples: latencySamples,
      metadata: {
        scatterFanOut: this.config.scatterFanOut,
        aggregationType: this.config.aggregationType,
        queryCount,
        allowPartialResults: this.config.allowPartialResults,
        workerCount: this.config.workerCount,
      },
    };
  }
}

/**
 * Create scatter-gather scenario
 */
export function createScatterGatherScenario(
  config?: Partial<ScatterGatherConfig>
): ScatterGatherScenario {
  return new ScatterGatherScenario(config);
}

/**
 * Quick benchmark function for scatter-gather
 */
export async function benchmarkScatterGather(
  partitions: PartitionMetadata[],
  options?: {
    workerCount?: number;
    scatterFanOut?: number;
    aggregationType?: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'distinct';
    queries?: number;
    schemaName?: string;
    data?: Map<string, Record<string, unknown>[]>;
  }
): Promise<BenchmarkResult> {
  const scenario = createScatterGatherScenario({
    workerCount: options?.workerCount ?? 8,
    scatterFanOut: options?.scatterFanOut ?? 8,
    aggregationType: options?.aggregationType ?? 'sum',
  });

  return scenario.run(partitions, options?.data, {
    queries: options?.queries ?? 100,
    schemaName: options?.schemaName,
  });
}
