/**
 * @evodb/benchmark - Workers Simulator
 *
 * Simulates Cloudflare Workers parallel execution for local benchmarking.
 * Models realistic Worker behavior including:
 * - Parallel execution with configurable concurrency
 * - CPU time tracking
 * - Cache API simulation
 * - R2 access simulation with realistic latencies
 */

import type {
  SimulatedWorker,
  WorkerStatus,
  WorkerStats,
  QueryTask,
  QueryResult,
  QueryFilter,
  AggregationSpec,
  PartialAggregation,
  PartitionMetadata,
  CacheMetrics,
} from '../types.js';
import { SeededRandom, createRandom } from '../utils/random.js';

/**
 * Worker simulator configuration
 */
export interface WorkerSimulatorConfig {
  /** Number of Workers to simulate */
  workerCount: number;

  /** Maximum concurrent tasks per Worker */
  concurrencyPerWorker: number;

  /** Simulated regions */
  regions: string[];

  /** Cache configuration */
  cache: {
    enabled: boolean;
    hitRatio: number; // Target hit ratio (0-1)
    hitLatencyMs: number; // Cache hit latency
    missLatencyMs: number; // Cache miss latency (before R2 fetch)
  };

  /** R2 simulation */
  r2: {
    latencyMs: number; // Base latency
    latencyJitterMs: number; // Random jitter
    throughputMbps: number; // Simulated throughput
  };

  /** CPU simulation */
  cpu: {
    scanRowsPerMs: number; // Rows scanned per ms CPU time
    filterRowsPerMs: number; // Rows filtered per ms
    aggregateRowsPerMs: number; // Rows aggregated per ms
  };

  /** Random seed for reproducibility */
  seed?: number;
}

/**
 * Default simulator configuration
 */
export const DEFAULT_SIMULATOR_CONFIG: WorkerSimulatorConfig = {
  workerCount: 4,
  concurrencyPerWorker: 6,
  regions: ['us-east', 'us-west', 'eu-west'],
  cache: {
    enabled: true,
    hitRatio: 0.8,
    hitLatencyMs: 1,
    missLatencyMs: 5,
  },
  r2: {
    latencyMs: 15,
    latencyJitterMs: 10,
    throughputMbps: 500,
  },
  cpu: {
    scanRowsPerMs: 100000, // 100K rows/ms
    filterRowsPerMs: 50000, // 50K rows/ms
    aggregateRowsPerMs: 200000, // 200K rows/ms
  },
};

/**
 * Simulated cache entry
 */
interface CacheEntry {
  key: string;
  data: unknown;
  sizeBytes: number;
  cachedAt: number;
  accessCount: number;
}

/**
 * Worker Simulator
 *
 * Simulates parallel Worker execution for benchmarking.
 */
export class WorkerSimulator {
  private readonly config: WorkerSimulatorConfig;
  private readonly random: SeededRandom;
  private readonly workers: Map<string, SimulatedWorker> = new Map();
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly taskQueue: QueryTask[] = [];
  private readonly activeTasksByWorker: Map<string, Set<string>> = new Map();

  // Statistics
  private cacheHits = 0;
  private cacheMisses = 0;
  private bytesFromCache = 0;
  private bytesFromR2 = 0;
  private lookupTimes: number[] = [];

  constructor(config: Partial<WorkerSimulatorConfig> = {}) {
    this.config = { ...DEFAULT_SIMULATOR_CONFIG, ...config };
    this.random = createRandom(this.config.seed ?? Date.now());
    this.initializeWorkers();
  }

  /**
   * Initialize simulated Workers
   */
  private initializeWorkers(): void {
    for (let i = 0; i < this.config.workerCount; i++) {
      const workerId = `worker_${i.toString().padStart(3, '0')}`;
      const region = this.config.regions[i % this.config.regions.length];

      this.workers.set(workerId, {
        id: workerId,
        region,
        status: 'idle',
        assignedPartitions: [],
        load: 0,
        stats: {
          queriesProcessed: 0,
          bytesScanned: 0,
          cpuTimeMs: 0,
          wallTimeMs: 0,
          cacheHits: 0,
          cacheMisses: 0,
        },
      });

      this.activeTasksByWorker.set(workerId, new Set());
    }
  }

  /**
   * Execute tasks in parallel across Workers
   */
  async executeTasks(
    tasks: QueryTask[],
    partitions: PartitionMetadata[],
    data?: Map<string, Record<string, unknown>[]>
  ): Promise<QueryResult[]> {
    // Assign partitions to workers
    this.assignPartitions(partitions);

    // Execute tasks
    const results = await Promise.all(
      tasks.map(task => this.executeTask(task, partitions, data))
    );

    return results;
  }

  /**
   * Execute a single task
   */
  private async executeTask(
    task: QueryTask,
    partitions: PartitionMetadata[],
    data?: Map<string, Record<string, unknown>[]>
  ): Promise<QueryResult> {
    // Select best worker for this task
    const worker = this.selectWorker(task);
    const startTime = performance.now();

    try {
      // Mark worker busy
      worker.status = 'processing';
      const activeTasks = this.activeTasksByWorker.get(worker.id);
      if (activeTasks) {
        activeTasks.add(task.id);
      }

      // Simulate cache lookup
      const cacheResult = await this.checkCache(task);

      if (cacheResult.hit) {
        // Cache hit path
        const result = this.buildResultFromCache(task, cacheResult, worker, startTime);
        this.updateWorkerStats(worker, result);
        return result;
      }

      // Cache miss - need to scan
      const targetPartitions = partitions.filter(p => task.partitions.includes(p.id));
      let rowsScanned = 0;
      let rowsReturned = 0;
      let bytesScanned = 0;
      let cpuTimeMs = 0;

      // Simulate R2 fetch latency
      const r2Latency = this.simulateR2Latency();
      await this.simulateDelay(r2Latency);

      // Process each partition
      const partialResults: unknown[] = [];
      let partialAggregation: PartialAggregation | undefined;

      for (const partition of targetPartitions) {
        // Simulate data scanning
        const scanResult = this.simulateScan(
          task,
          partition,
          data?.get(partition.id)
        );

        rowsScanned += scanResult.rowsScanned;
        rowsReturned += scanResult.rowsReturned;
        bytesScanned += scanResult.bytesScanned;
        cpuTimeMs += scanResult.cpuTimeMs;

        if (scanResult.data) {
          partialResults.push(...scanResult.data);
        }

        if (scanResult.partialAggregation) {
          partialAggregation = this.mergePartialAggregation(
            partialAggregation,
            scanResult.partialAggregation
          );
        }
      }

      // Simulate CPU time
      await this.simulateDelay(cpuTimeMs * 0.01); // Scale down for simulation

      const executionTimeMs = performance.now() - startTime;

      // Cache the result
      if (this.config.cache.enabled) {
        this.cacheResult(task, partialResults, bytesScanned);
      }

      const result: QueryResult = {
        taskId: task.id,
        workerId: worker.id,
        success: true,
        data: task.aggregation ? undefined : partialResults,
        partialResult: partialAggregation,
        rowsScanned,
        rowsReturned,
        bytesScanned,
        executionTimeMs,
        fromCache: false,
      };

      this.updateWorkerStats(worker, result);
      return result;

    } finally {
      // Mark worker available
      const activeTasksFinally = this.activeTasksByWorker.get(worker.id);
      if (activeTasksFinally) {
        activeTasksFinally.delete(task.id);
        worker.status = activeTasksFinally.size > 0 ? 'processing' : 'idle';
        worker.load = activeTasksFinally.size / this.config.concurrencyPerWorker;
      }
    }
  }

  /**
   * Select the best worker for a task
   */
  private selectWorker(task: QueryTask): SimulatedWorker {
    // Find worker with lowest load that has assigned partitions
    let bestWorker: SimulatedWorker | null = null;
    let lowestLoad = Infinity;

    for (const worker of this.workers.values()) {
      // Check if worker has any of the task's partitions
      const hasPartition = task.partitions.some(p =>
        worker.assignedPartitions.includes(p)
      );

      if (hasPartition && worker.load < lowestLoad) {
        bestWorker = worker;
        lowestLoad = worker.load;
      }
    }

    // Fall back to least loaded worker
    if (!bestWorker) {
      for (const worker of this.workers.values()) {
        if (worker.load < lowestLoad) {
          bestWorker = worker;
          lowestLoad = worker.load;
        }
      }
    }

    return bestWorker!;
  }

  /**
   * Assign partitions to workers (round-robin with locality awareness)
   */
  private assignPartitions(partitions: PartitionMetadata[]): void {
    const workerArray = Array.from(this.workers.values());

    for (let i = 0; i < partitions.length; i++) {
      const worker = workerArray[i % workerArray.length];
      worker.assignedPartitions.push(partitions[i].id);
    }
  }

  /**
   * Check cache for task result
   */
  private async checkCache(task: QueryTask): Promise<{ hit: boolean; data?: unknown; sizeBytes?: number }> {
    const lookupStart = performance.now();

    // Simulate cache lookup latency
    await this.simulateDelay(this.config.cache.hitLatencyMs);

    const cacheKey = this.buildCacheKey(task);
    const entry = this.cache.get(cacheKey);

    this.lookupTimes.push(performance.now() - lookupStart);

    if (entry && this.config.cache.enabled) {
      // Simulate probabilistic cache hit based on configured hit ratio
      const shouldHit = this.random.random() < this.config.cache.hitRatio;

      if (shouldHit) {
        this.cacheHits++;
        this.bytesFromCache += entry.sizeBytes;
        entry.accessCount++;
        return { hit: true, data: entry.data, sizeBytes: entry.sizeBytes };
      }
    }

    this.cacheMisses++;
    return { hit: false };
  }

  /**
   * Build cache key for a task
   */
  private buildCacheKey(task: QueryTask): string {
    const filterKey = task.filter
      ? `${task.filter.column}:${task.filter.operator}:${JSON.stringify(task.filter.value)}`
      : '';
    const columnsKey = task.columns?.join(',') ?? '';
    const aggKey = task.aggregation
      ? `${task.aggregation.function}:${task.aggregation.column}`
      : '';

    return `${task.type}:${task.partitions.join(',')}:${filterKey}:${columnsKey}:${aggKey}`;
  }

  /**
   * Build result from cache
   */
  private buildResultFromCache(
    task: QueryTask,
    cacheResult: { hit: boolean; data?: unknown; sizeBytes?: number },
    worker: SimulatedWorker,
    startTime: number
  ): QueryResult {
    return {
      taskId: task.id,
      workerId: worker.id,
      success: true,
      data: cacheResult.data as unknown[],
      rowsScanned: 0,
      rowsReturned: Array.isArray(cacheResult.data) ? cacheResult.data.length : 1,
      bytesScanned: 0,
      executionTimeMs: performance.now() - startTime,
      fromCache: true,
    };
  }

  /**
   * Cache result for future lookups
   */
  private cacheResult(task: QueryTask, data: unknown[], sizeBytes: number): void {
    const cacheKey = this.buildCacheKey(task);
    this.cache.set(cacheKey, {
      key: cacheKey,
      data,
      sizeBytes,
      cachedAt: Date.now(),
      accessCount: 0,
    });
  }

  /**
   * Simulate scanning a partition
   */
  private simulateScan(
    task: QueryTask,
    partition: PartitionMetadata,
    data?: Record<string, unknown>[]
  ): {
    rowsScanned: number;
    rowsReturned: number;
    bytesScanned: number;
    cpuTimeMs: number;
    data?: unknown[];
    partialAggregation?: PartialAggregation;
  } {
    const rowsScanned = partition.rowCount;
    const bytesScanned = partition.sizeBytes;

    // Calculate CPU time based on operation type
    let cpuTimeMs: number;
    let rowsReturned: number;
    let resultData: unknown[] | undefined;
    let partialAggregation: PartialAggregation | undefined;

    switch (task.type) {
      case 'scan':
        cpuTimeMs = rowsScanned / this.config.cpu.scanRowsPerMs;
        rowsReturned = rowsScanned;
        if (data) {
          resultData = data;
        }
        break;

      case 'filter':
        cpuTimeMs = rowsScanned / this.config.cpu.filterRowsPerMs;
        // Estimate selectivity from filter
        const selectivity = this.estimateSelectivity(task.filter, partition);
        rowsReturned = Math.floor(rowsScanned * selectivity);
        if (data && task.filter) {
          resultData = this.applyFilter(data, task.filter);
          rowsReturned = resultData.length;
        }
        break;

      case 'aggregate':
        cpuTimeMs = rowsScanned / this.config.cpu.aggregateRowsPerMs;
        rowsReturned = 1;
        partialAggregation = this.computePartialAggregation(
          task.aggregation!,
          partition,
          data
        );
        break;

      default:
        cpuTimeMs = rowsScanned / this.config.cpu.scanRowsPerMs;
        rowsReturned = rowsScanned;
    }

    this.bytesFromR2 += bytesScanned;

    return {
      rowsScanned,
      rowsReturned,
      bytesScanned,
      cpuTimeMs,
      data: resultData,
      partialAggregation,
    };
  }

  /**
   * Estimate filter selectivity
   */
  private estimateSelectivity(filter: QueryFilter | undefined, partition: PartitionMetadata): number {
    if (!filter) return 1.0;

    const stats = partition.columnStats[filter.column];
    if (!stats) return 0.5; // Default estimate

    switch (filter.operator) {
      case 'eq':
        return 1 / Math.max(1, stats.distinctCount);
      case 'in':
        const inCount = Array.isArray(filter.value) ? filter.value.length : 1;
        return Math.min(1, inCount / Math.max(1, stats.distinctCount));
      case 'lt':
      case 'lte':
      case 'gt':
      case 'gte':
        return 0.3; // Estimate 30% selectivity for range filters
      case 'between':
        return 0.2; // Estimate 20% for between
      default:
        return 0.5;
    }
  }

  /**
   * Apply filter to data
   */
  private applyFilter(data: Record<string, unknown>[], filter: QueryFilter): Record<string, unknown>[] {
    return data.filter(row => {
      const value = row[filter.column];
      switch (filter.operator) {
        case 'eq':
          return value === filter.value;
        case 'ne':
          return value !== filter.value;
        case 'lt':
          return (value as number) < (filter.value as number);
        case 'lte':
          return (value as number) <= (filter.value as number);
        case 'gt':
          return (value as number) > (filter.value as number);
        case 'gte':
          return (value as number) >= (filter.value as number);
        case 'in':
          return (filter.value as unknown[]).includes(value);
        case 'between':
          const [min, max] = filter.value as [number, number];
          return (value as number) >= min && (value as number) <= max;
        default:
          return true;
      }
    });
  }

  /**
   * Compute partial aggregation for a partition
   */
  private computePartialAggregation(
    spec: AggregationSpec,
    partition: PartitionMetadata,
    data?: Record<string, unknown>[]
  ): PartialAggregation {
    if (data) {
      // Compute actual aggregation on data
      const values = data.map(row => row[spec.column] as number).filter(v => v != null);

      switch (spec.function) {
        case 'sum':
          return { function: 'sum', value: values.reduce((a, b) => a + b, 0) };
        case 'avg':
          return {
            function: 'avg',
            value: values.reduce((a, b) => a + b, 0),
            count: values.length,
          };
        case 'min':
          return { function: 'min', value: Math.min(...values) };
        case 'max':
          return { function: 'max', value: Math.max(...values) };
        case 'count':
          return { function: 'count', value: values.length };
        case 'distinct':
          return {
            function: 'distinct',
            value: new Set(values).size,
            distinctValues: [...new Set(values)],
          };
        default:
          return { function: spec.function, value: 0 };
      }
    }

    // Estimate from stats
    const stats = partition.columnStats[spec.column];
    switch (spec.function) {
      case 'count':
        return { function: 'count', value: partition.rowCount - (stats?.nullCount ?? 0) };
      case 'sum':
        const avgValue = stats ? ((stats.min as number) + (stats.max as number)) / 2 : 50;
        return { function: 'sum', value: avgValue * partition.rowCount };
      case 'avg':
        return {
          function: 'avg',
          value: stats ? ((stats.min as number) + (stats.max as number)) / 2 : 50,
          count: partition.rowCount,
        };
      case 'min':
        return { function: 'min', value: stats?.min as number ?? 0 };
      case 'max':
        return { function: 'max', value: stats?.max as number ?? 100 };
      default:
        return { function: spec.function, value: 0 };
    }
  }

  /**
   * Merge partial aggregations
   */
  private mergePartialAggregation(
    existing: PartialAggregation | undefined,
    incoming: PartialAggregation
  ): PartialAggregation {
    if (!existing) return incoming;

    switch (incoming.function) {
      case 'sum':
      case 'count':
        return { function: incoming.function, value: existing.value + incoming.value };
      case 'avg':
        const totalSum = existing.value + incoming.value;
        const totalCount = (existing.count ?? 0) + (incoming.count ?? 0);
        return { function: 'avg', value: totalSum, count: totalCount };
      case 'min':
        return { function: 'min', value: Math.min(existing.value, incoming.value) };
      case 'max':
        return { function: 'max', value: Math.max(existing.value, incoming.value) };
      case 'distinct':
        const merged = new Set([
          ...(existing.distinctValues ?? []),
          ...(incoming.distinctValues ?? []),
        ]);
        return { function: 'distinct', value: merged.size, distinctValues: [...merged] };
      default:
        return incoming;
    }
  }

  /**
   * Simulate R2 latency
   */
  private simulateR2Latency(): number {
    const base = this.config.r2.latencyMs;
    const jitter = this.random.float(-this.config.r2.latencyJitterMs, this.config.r2.latencyJitterMs);
    return Math.max(1, base + jitter);
  }

  /**
   * Simulate delay (non-blocking)
   */
  private simulateDelay(ms: number): Promise<void> {
    // For benchmarking, we use a minimal delay but track the simulated time
    return new Promise(resolve => setTimeout(resolve, Math.min(ms, 1)));
  }

  /**
   * Update worker statistics
   */
  private updateWorkerStats(worker: SimulatedWorker, result: QueryResult): void {
    worker.stats.queriesProcessed++;
    worker.stats.bytesScanned += result.bytesScanned;
    worker.stats.wallTimeMs += result.executionTimeMs;

    if (result.fromCache) {
      worker.stats.cacheHits++;
    } else {
      worker.stats.cacheMisses++;
    }
  }

  /**
   * Get cache metrics
   */
  getCacheMetrics(): CacheMetrics {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRatio: total > 0 ? this.cacheHits / total : 0,
      bytesFromCache: this.bytesFromCache,
      bytesFromOrigin: this.bytesFromR2,
      avgLookupTimeMs: this.lookupTimes.length > 0
        ? this.lookupTimes.reduce((a, b) => a + b, 0) / this.lookupTimes.length
        : 0,
    };
  }

  /**
   * Get all worker statistics
   */
  getWorkerStats(): SimulatedWorker[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get aggregate statistics
   */
  getAggregateStats(): {
    totalQueries: number;
    totalBytesScanned: number;
    totalCpuTimeMs: number;
    totalWallTimeMs: number;
    avgQueriesPerWorker: number;
  } {
    let totalQueries = 0;
    let totalBytesScanned = 0;
    let totalCpuTimeMs = 0;
    let totalWallTimeMs = 0;

    for (const worker of this.workers.values()) {
      totalQueries += worker.stats.queriesProcessed;
      totalBytesScanned += worker.stats.bytesScanned;
      totalCpuTimeMs += worker.stats.cpuTimeMs;
      totalWallTimeMs += worker.stats.wallTimeMs;
    }

    return {
      totalQueries,
      totalBytesScanned,
      totalCpuTimeMs,
      totalWallTimeMs,
      avgQueriesPerWorker: totalQueries / this.config.workerCount,
    };
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.bytesFromCache = 0;
    this.bytesFromR2 = 0;
    this.lookupTimes = [];

    for (const worker of this.workers.values()) {
      worker.stats = {
        queriesProcessed: 0,
        bytesScanned: 0,
        cpuTimeMs: 0,
        wallTimeMs: 0,
        cacheHits: 0,
        cacheMisses: 0,
      };
      worker.assignedPartitions = [];
      worker.load = 0;
      worker.status = 'idle';
    }
  }
}

/**
 * Create default worker simulator
 */
export function createWorkerSimulator(
  config?: Partial<WorkerSimulatorConfig>
): WorkerSimulator {
  return new WorkerSimulator(config);
}
