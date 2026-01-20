/**
 * @evodb/benchmark - Task Scheduler
 *
 * Schedules and distributes query tasks across simulated Workers.
 * Implements various scheduling strategies for benchmark scenarios.
 */

import type { QueryTask, PartitionMetadata, QueryFilter, AggregationSpec } from '../types.js';
import { createRandom, SeededRandom } from '../utils/random.js';

/**
 * Scheduling strategy
 */
export type SchedulingStrategy =
  | 'round_robin'      // Simple round-robin distribution
  | 'locality_aware'   // Prefer workers with cached data
  | 'load_balanced'    // Balance based on worker load
  | 'partition_aware'; // Group by partition assignment

/**
 * Task scheduler configuration
 */
export interface TaskSchedulerConfig {
  /** Scheduling strategy */
  strategy: SchedulingStrategy;

  /** Number of workers */
  workerCount: number;

  /** Maximum queue depth per worker */
  maxQueueDepth: number;

  /** Enable task coalescing */
  enableCoalescing: boolean;

  /** Maximum tasks to coalesce */
  maxCoalesceSize: number;

  /** Random seed */
  seed?: number;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: TaskSchedulerConfig = {
  strategy: 'partition_aware',
  workerCount: 4,
  maxQueueDepth: 100,
  enableCoalescing: true,
  maxCoalesceSize: 10,
};

/**
 * Task batch for scatter-gather
 */
export interface TaskBatch {
  /** Batch ID */
  id: string;

  /** Tasks in this batch */
  tasks: QueryTask[];

  /** Aggregation to perform on results */
  aggregation?: AggregationSpec;

  /** Result limit */
  limit?: number;

  /** Timeout in ms */
  timeoutMs?: number;
}

/**
 * Task Scheduler
 */
export class TaskScheduler {
  private readonly config: TaskSchedulerConfig;
  private readonly random: SeededRandom;
  private taskIdCounter = 0;
  private batchIdCounter = 0;

  constructor(config: Partial<TaskSchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.random = createRandom(this.config.seed ?? Date.now());
  }

  /**
   * Create scan tasks for all partitions
   */
  createScanTasks(
    partitions: PartitionMetadata[],
    options?: {
      columns?: string[];
      filter?: QueryFilter;
      priority?: number;
      deadlineMs?: number;
    }
  ): QueryTask[] {
    return partitions.map(partition => ({
      id: `task_${++this.taskIdCounter}`,
      type: options?.filter ? 'filter' : 'scan',
      partitions: [partition.id],
      filter: options?.filter,
      columns: options?.columns,
      priority: options?.priority ?? 1,
      deadlineMs: options?.deadlineMs ?? 30000,
    }));
  }

  /**
   * Create parallel scan tasks (multiple partitions per task)
   */
  createParallelScanTasks(
    partitions: PartitionMetadata[],
    tasksCount: number,
    options?: {
      columns?: string[];
      filter?: QueryFilter;
      priority?: number;
    }
  ): QueryTask[] {
    const tasks: QueryTask[] = [];
    const partitionsPerTask = Math.ceil(partitions.length / tasksCount);

    for (let i = 0; i < tasksCount; i++) {
      const start = i * partitionsPerTask;
      const end = Math.min(start + partitionsPerTask, partitions.length);
      const taskPartitions = partitions.slice(start, end);

      if (taskPartitions.length > 0) {
        tasks.push({
          id: `task_${++this.taskIdCounter}`,
          type: options?.filter ? 'filter' : 'scan',
          partitions: taskPartitions.map(p => p.id),
          filter: options?.filter,
          columns: options?.columns,
          priority: options?.priority ?? 1,
          deadlineMs: 30000,
        });
      }
    }

    return tasks;
  }

  /**
   * Create aggregation tasks (one per partition, for scatter-gather)
   */
  createAggregationTasks(
    partitions: PartitionMetadata[],
    aggregation: AggregationSpec,
    options?: {
      filter?: QueryFilter;
      priority?: number;
    }
  ): QueryTask[] {
    return partitions.map(partition => ({
      id: `task_${++this.taskIdCounter}`,
      type: 'aggregate',
      partitions: [partition.id],
      filter: options?.filter,
      aggregation,
      priority: options?.priority ?? 2,
      deadlineMs: 30000,
    }));
  }

  /**
   * Create a scatter-gather task batch
   */
  createScatterGatherBatch(
    partitions: PartitionMetadata[],
    aggregation: AggregationSpec,
    options?: {
      filter?: QueryFilter;
      limit?: number;
      timeoutMs?: number;
    }
  ): TaskBatch {
    const tasks = this.createAggregationTasks(partitions, aggregation, {
      filter: options?.filter,
      priority: 3,
    });

    return {
      id: `batch_${++this.batchIdCounter}`,
      tasks,
      aggregation,
      limit: options?.limit,
      timeoutMs: options?.timeoutMs ?? 30000,
    };
  }

  /**
   * Create concurrent query workload
   */
  createConcurrentWorkload(
    partitions: PartitionMetadata[],
    queryCount: number,
    options?: {
      queryTypes?: Array<'scan' | 'filter' | 'aggregate'>;
      filters?: QueryFilter[];
      aggregations?: AggregationSpec[];
    }
  ): QueryTask[] {
    const tasks: QueryTask[] = [];
    const queryTypes = options?.queryTypes ?? ['scan', 'filter', 'aggregate'];
    const filters = options?.filters ?? [];
    const aggregations = options?.aggregations ?? [];

    for (let i = 0; i < queryCount; i++) {
      const queryType = this.random.pick(queryTypes);

      // Select random subset of partitions
      const partitionCount = this.random.int(1, Math.min(4, partitions.length));
      const selectedPartitions = this.random.shuffle([...partitions]).slice(0, partitionCount);

      const task: QueryTask = {
        id: `task_${++this.taskIdCounter}`,
        type: queryType,
        partitions: selectedPartitions.map(p => p.id),
        priority: this.random.int(1, 5),
        deadlineMs: this.random.int(5000, 30000),
      };

      if (queryType === 'filter' && filters.length > 0) {
        task.filter = this.random.pick(filters);
      }

      if (queryType === 'aggregate' && aggregations.length > 0) {
        task.aggregation = this.random.pick(aggregations);
      }

      tasks.push(task);
    }

    return tasks;
  }

  /**
   * Distribute tasks to workers based on strategy
   */
  distributeTasks(
    tasks: QueryTask[],
    partitions: PartitionMetadata[]
  ): Map<number, QueryTask[]> {
    const distribution = new Map<number, QueryTask[]>();

    for (let i = 0; i < this.config.workerCount; i++) {
      distribution.set(i, []);
    }

    switch (this.config.strategy) {
      case 'round_robin':
        this.distributeRoundRobin(tasks, distribution);
        break;

      case 'load_balanced':
        this.distributeLoadBalanced(tasks, distribution);
        break;

      case 'partition_aware':
        this.distributePartitionAware(tasks, partitions, distribution);
        break;

      case 'locality_aware':
      default:
        this.distributeLocalityAware(tasks, partitions, distribution);
        break;
    }

    return distribution;
  }

  /**
   * Round-robin distribution
   */
  private distributeRoundRobin(
    tasks: QueryTask[],
    distribution: Map<number, QueryTask[]>
  ): void {
    tasks.forEach((task, i) => {
      const workerId = i % this.config.workerCount;
      const workerTasks = distribution.get(workerId);
      if (workerTasks) {
        workerTasks.push(task);
      }
    });
  }

  /**
   * Load-balanced distribution
   */
  private distributeLoadBalanced(
    tasks: QueryTask[],
    distribution: Map<number, QueryTask[]>
  ): void {
    // Sort tasks by estimated work (partition count)
    const sortedTasks = [...tasks].sort(
      (a, b) => b.partitions.length - a.partitions.length
    );

    // Assign to worker with least load
    for (const task of sortedTasks) {
      let minLoad = Infinity;
      let minWorker = 0;

      for (const [workerId, workerTasks] of distribution) {
        const load = workerTasks.reduce((sum, t) => sum + t.partitions.length, 0);
        if (load < minLoad) {
          minLoad = load;
          minWorker = workerId;
        }
      }

      const workerTasks = distribution.get(minWorker);
      if (workerTasks) {
        workerTasks.push(task);
      }
    }
  }

  /**
   * Partition-aware distribution
   */
  private distributePartitionAware(
    tasks: QueryTask[],
    partitions: PartitionMetadata[],
    distribution: Map<number, QueryTask[]>
  ): void {
    // Assign partitions to workers
    const partitionToWorker = new Map<string, number>();
    partitions.forEach((p, i) => {
      partitionToWorker.set(p.id, i % this.config.workerCount);
    });

    // Assign tasks based on their primary partition
    for (const task of tasks) {
      const primaryPartition = task.partitions[0];
      const workerId = partitionToWorker.get(primaryPartition) ?? 0;
      const workerTasks = distribution.get(workerId);
      if (workerTasks) {
        workerTasks.push(task);
      }
    }
  }

  /**
   * Locality-aware distribution (considers cache affinity)
   */
  private distributeLocalityAware(
    tasks: QueryTask[],
    partitions: PartitionMetadata[],
    distribution: Map<number, QueryTask[]>
  ): void {
    // For now, same as partition-aware
    // In production, this would consider cache state
    this.distributePartitionAware(tasks, partitions, distribution);
  }

  /**
   * Coalesce similar tasks
   */
  coalesceTasks(tasks: QueryTask[]): QueryTask[] {
    if (!this.config.enableCoalescing) {
      return tasks;
    }

    // Group tasks by type and filter
    const groups = new Map<string, QueryTask[]>();

    for (const task of tasks) {
      const key = `${task.type}:${JSON.stringify(task.filter ?? {})}:${JSON.stringify(task.aggregation ?? {})}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      const group = groups.get(key);
      if (group) {
        group.push(task);
      }
    }

    // Coalesce each group
    const coalescedTasks: QueryTask[] = [];

    for (const [, groupTasks] of groups) {
      for (let i = 0; i < groupTasks.length; i += this.config.maxCoalesceSize) {
        const batch = groupTasks.slice(i, i + this.config.maxCoalesceSize);

        if (batch.length === 1) {
          coalescedTasks.push(batch[0]);
        } else {
          // Merge partitions
          const allPartitions = batch.flatMap(t => t.partitions);
          const uniquePartitions = [...new Set(allPartitions)];

          coalescedTasks.push({
            id: `task_${++this.taskIdCounter}`,
            type: batch[0].type,
            partitions: uniquePartitions,
            filter: batch[0].filter,
            aggregation: batch[0].aggregation,
            columns: batch[0].columns,
            priority: Math.max(...batch.map(t => t.priority)),
            deadlineMs: Math.min(...batch.map(t => t.deadlineMs)),
          });
        }
      }
    }

    return coalescedTasks;
  }

  /**
   * Reset task ID counter
   */
  reset(): void {
    this.taskIdCounter = 0;
    this.batchIdCounter = 0;
  }
}

/**
 * Create default task scheduler
 */
export function createTaskScheduler(
  config?: Partial<TaskSchedulerConfig>
): TaskScheduler {
  return new TaskScheduler(config);
}

/**
 * Generate common filter predicates for benchmarking
 */
export function generateBenchmarkFilters(schema: string): QueryFilter[] {
  const filters: QueryFilter[] = [];

  // Based on common query patterns
  switch (schema) {
    case 'user_activity':
      filters.push(
        { column: 'event_type', operator: 'eq', value: 'post' },
        { column: 'event_type', operator: 'in', value: ['post', 'like', 'repost'] },
        { column: 'region', operator: 'eq', value: 'us-east' },
        { column: 'timestamp', operator: 'gte', value: Date.now() - 7 * 24 * 60 * 60 * 1000 },
      );
      break;

    case 'ecommerce_events':
      filters.push(
        { column: 'event_type', operator: 'eq', value: 'purchase' },
        { column: 'product_id', operator: 'lt', value: 10000 },
        { column: 'price', operator: 'gte', value: 100 },
        { column: 'country', operator: 'in', value: ['US', 'UK', 'DE'] },
      );
      break;

    case 'iot_sensors':
      filters.push(
        { column: 'sensor_type', operator: 'eq', value: 'temperature' },
        { column: 'value', operator: 'between', value: [20, 30] },
        { column: 'is_anomaly', operator: 'eq', value: true },
      );
      break;

    case 'logs':
      filters.push(
        { column: 'level', operator: 'eq', value: 'ERROR' },
        { column: 'level', operator: 'in', value: ['ERROR', 'FATAL'] },
        { column: 'status_code', operator: 'gte', value: 500 },
        { column: 'duration_ms', operator: 'gt', value: 1000 },
      );
      break;

    case 'transactions':
      filters.push(
        { column: 'transaction_type', operator: 'eq', value: 'purchase' },
        { column: 'amount', operator: 'gte', value: 1000 },
        { column: 'is_fraud', operator: 'eq', value: true },
        { column: 'status', operator: 'ne', value: 'completed' },
      );
      break;
  }

  return filters;
}

/**
 * Generate common aggregations for benchmarking
 */
export function generateBenchmarkAggregations(schema: string): AggregationSpec[] {
  const aggregations: AggregationSpec[] = [];

  switch (schema) {
    case 'user_activity':
      aggregations.push(
        { function: 'count', column: 'id' },
        { function: 'count', column: 'id', groupBy: ['event_type'] },
        { function: 'count', column: 'id', groupBy: ['region', 'event_type'] },
      );
      break;

    case 'ecommerce_events':
      aggregations.push(
        { function: 'sum', column: 'price' },
        { function: 'avg', column: 'price' },
        { function: 'count', column: 'event_id', groupBy: ['event_type'] },
        { function: 'sum', column: 'price', groupBy: ['country'] },
      );
      break;

    case 'iot_sensors':
      aggregations.push(
        { function: 'avg', column: 'value' },
        { function: 'min', column: 'value' },
        { function: 'max', column: 'value' },
        { function: 'avg', column: 'value', groupBy: ['sensor_type'] },
      );
      break;

    case 'logs':
      aggregations.push(
        { function: 'count', column: 'log_id' },
        { function: 'count', column: 'log_id', groupBy: ['level'] },
        { function: 'avg', column: 'duration_ms' },
        { function: 'count', column: 'log_id', groupBy: ['service', 'level'] },
      );
      break;

    case 'transactions':
      aggregations.push(
        { function: 'sum', column: 'amount' },
        { function: 'avg', column: 'amount' },
        { function: 'count', column: 'transaction_id', groupBy: ['transaction_type'] },
        { function: 'sum', column: 'amount', groupBy: ['currency'] },
      );
      break;
  }

  return aggregations;
}
