/**
 * @evodb/benchmark - Partition Parallel Scan Scenario
 *
 * Demonstrates the advantage of multiple Workers scanning different partitions in parallel.
 * Compares single-worker vs N-worker parallel execution.
 */

import type {
  BenchmarkResult,
  PartitionParallelScanConfig,
  PartitionMetadata,
  QueryResult,
} from '../types.js';
import { createWorkerSimulator } from '../workers/worker-simulator.js';
import { createTaskScheduler } from '../workers/task-scheduler.js';
import {
  computeLatencyMetrics,
  computeThroughputMetrics,
  computeCostMetrics,
  calculateScalingEfficiency,
} from '../utils/metrics.js';

/**
 * Default partition parallel scan configuration
 */
export const DEFAULT_PARALLEL_SCAN_CONFIG: PartitionParallelScanConfig = {
  type: 'partition_parallel_scan',
  concurrency: 1,
  dataSize: '1M',
  workerCount: 4,
  enableCache: false, // Disable cache to measure raw scan performance
  cacheTtlSeconds: 0,
  partitionCount: 16,
  partitionScheme: 'hash',
  filesPerPartition: 4,
  rowsPerFile: 100000,
  scanType: 'full',
  filterSelectivity: 1.0, // Full scan
};

/**
 * Partition Parallel Scan Benchmark Scenario
 */
export class PartitionParallelScanScenario {
  private readonly config: PartitionParallelScanConfig;

  constructor(config: Partial<PartitionParallelScanConfig> = {}) {
    this.config = { ...DEFAULT_PARALLEL_SCAN_CONFIG, ...config };
  }

  /**
   * Run single-worker baseline
   */
  async runSingleWorker(
    partitions: PartitionMetadata[],
    data?: Map<string, Record<string, unknown>[]>
  ): Promise<BenchmarkResult> {
    console.log('  Running single-worker baseline...');

    const simulator = createWorkerSimulator({
      workerCount: 1,
      cache: { enabled: false, hitRatio: 0, hitLatencyMs: 0, missLatencyMs: 0 },
    });

    const scheduler = createTaskScheduler({
      workerCount: 1,
      strategy: 'round_robin',
    });

    // Create scan task for all partitions
    const tasks = scheduler.createScanTasks(partitions, {
      filter: this.config.filterSelectivity < 1.0
        ? { column: 'id', operator: 'lt', value: Math.floor(partitions[0].rowCount * this.config.filterSelectivity) }
        : undefined,
    });

    const startTime = performance.now();
    const results = await simulator.executeTasks(tasks, partitions, data);
    const totalDuration = performance.now() - startTime;

    return this.buildResult(results, totalDuration, 1);
  }

  /**
   * Run N-worker parallel scan
   */
  async runParallelWorkers(
    partitions: PartitionMetadata[],
    workerCount: number,
    data?: Map<string, Record<string, unknown>[]>
  ): Promise<BenchmarkResult> {
    console.log(`  Running ${workerCount}-worker parallel scan...`);

    const simulator = createWorkerSimulator({
      workerCount,
      cache: { enabled: false, hitRatio: 0, hitLatencyMs: 0, missLatencyMs: 0 },
    });

    const scheduler = createTaskScheduler({
      workerCount,
      strategy: 'partition_aware',
    });

    // Create parallel scan tasks (distribute partitions across workers)
    const tasks = scheduler.createParallelScanTasks(
      partitions,
      workerCount,
      {
        filter: this.config.filterSelectivity < 1.0
          ? { column: 'id', operator: 'lt', value: Math.floor(partitions[0].rowCount * this.config.filterSelectivity) }
          : undefined,
      }
    );

    const startTime = performance.now();
    const results = await simulator.executeTasks(tasks, partitions, data);
    const totalDuration = performance.now() - startTime;

    return this.buildResult(results, totalDuration, workerCount);
  }

  /**
   * Run full comparison benchmark
   */
  async runComparison(
    partitions: PartitionMetadata[],
    workerCounts: number[] = [1, 2, 4, 8, 16],
    data?: Map<string, Record<string, unknown>[]>
  ): Promise<{
    results: Map<number, BenchmarkResult>;
    speedups: Map<number, number>;
    scalingEfficiencies: Map<number, number>;
  }> {
    const results = new Map<number, BenchmarkResult>();
    const speedups = new Map<number, number>();
    const scalingEfficiencies = new Map<number, number>();

    // Run single-worker baseline first
    const baselineResult = await this.runSingleWorker(partitions, data);
    results.set(1, baselineResult);
    speedups.set(1, 1.0);
    scalingEfficiencies.set(1, 1.0);

    const baselineTime = baselineResult.durationMs;
    const baselineQps = baselineResult.throughput.qps;

    // Run parallel worker configurations
    for (const workerCount of workerCounts.filter(w => w > 1)) {
      const result = await this.runParallelWorkers(partitions, workerCount, data);
      results.set(workerCount, result);

      // Calculate speedup
      const speedup = baselineTime / result.durationMs;
      speedups.set(workerCount, speedup);

      // Calculate scaling efficiency
      const efficiency = calculateScalingEfficiency(baselineQps, result.throughput.qps, workerCount);
      scalingEfficiencies.set(workerCount, efficiency);

      console.log(`    ${workerCount} workers: ${speedup.toFixed(2)}x speedup, ${(efficiency * 100).toFixed(1)}% efficiency`);
    }

    return { results, speedups, scalingEfficiencies };
  }

  /**
   * Build benchmark result from query results
   */
  private buildResult(
    results: QueryResult[],
    totalDuration: number,
    workerCount: number
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

    // Estimate CPU time from scan performance
    const estimatedCpuTimeMs = totalRowsScanned / 100000; // 100K rows/ms estimate

    const cost = computeCostMetrics(
      workerCount, // One request per worker
      estimatedCpuTimeMs,
      Math.ceil(totalBytesScanned / (64 * 1024 * 1024)), // R2 reads
      0,
      0
    );

    return {
      scenario: 'partition_parallel_scan',
      config: this.config,
      timestamp: Date.now(),
      durationMs: totalDuration,
      latency,
      throughput,
      resources: {
        peakMemoryBytes: 0,
        avgCpuUtilization: estimatedCpuTimeMs / totalDuration,
        bytesScanned: totalBytesScanned,
        networkBytesTransferred: totalBytesScanned,
      },
      cost,
      samples: latencySamples,
      metadata: {
        workerCount,
        partitionCount: this.config.partitionCount,
        scanType: this.config.scanType,
        filterSelectivity: this.config.filterSelectivity,
        totalRowsScanned,
        totalBytesScanned,
      },
    };
  }

  /**
   * Run partition scaling benchmark (varying partition count)
   */
  async runPartitionScaling(
    createPartitions: (count: number) => PartitionMetadata[],
    partitionCounts: number[] = [4, 8, 16, 32, 64],
    workerCount: number = 4
  ): Promise<Map<number, { singleWorker: BenchmarkResult; parallel: BenchmarkResult; speedup: number }>> {
    const results = new Map<number, { singleWorker: BenchmarkResult; parallel: BenchmarkResult; speedup: number }>();

    for (const partitionCount of partitionCounts) {
      console.log(`\nTesting with ${partitionCount} partitions...`);

      const partitions = createPartitions(partitionCount);

      const singleWorker = await this.runSingleWorker(partitions);
      const parallel = await this.runParallelWorkers(partitions, workerCount);

      const speedup = singleWorker.durationMs / parallel.durationMs;

      results.set(partitionCount, { singleWorker, parallel, speedup });

      console.log(`  Speedup: ${speedup.toFixed(2)}x with ${workerCount} workers`);
    }

    return results;
  }
}

/**
 * Create partition parallel scan scenario
 */
export function createPartitionParallelScanScenario(
  config?: Partial<PartitionParallelScanConfig>
): PartitionParallelScanScenario {
  return new PartitionParallelScanScenario(config);
}

/**
 * Quick benchmark function for parallel scan
 */
export async function benchmarkParallelScan(
  partitions: PartitionMetadata[],
  options?: {
    workerCounts?: number[];
    filterSelectivity?: number;
    data?: Map<string, Record<string, unknown>[]>;
  }
): Promise<{
  results: Map<number, BenchmarkResult>;
  speedups: Map<number, number>;
  scalingEfficiencies: Map<number, number>;
}> {
  const scenario = createPartitionParallelScanScenario({
    filterSelectivity: options?.filterSelectivity ?? 1.0,
    partitionCount: partitions.length,
  });

  return scenario.runComparison(
    partitions,
    options?.workerCounts ?? [1, 2, 4, 8],
    options?.data
  );
}
