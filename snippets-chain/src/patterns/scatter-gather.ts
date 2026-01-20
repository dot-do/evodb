/**
 * Scatter-Gather Pattern
 *
 * Fan-out work to multiple parallel snippets (scatter),
 * then collect and combine results (gather).
 *
 * Use cases:
 * - Partition scans in columnar queries
 * - Parallel vector searches across data shards
 * - Multi-region queries
 *
 * Pattern Structure:
 *   [Input] → Scatter → [Partition 1, Partition 2, ..., Partition N] → Gather → [Output]
 *
 * Resource Budget:
 * - Scatter: 1 snippet invocation
 * - Parallel: N snippet invocations (where N = number of partitions)
 * - Gather: 1 snippet invocation
 * - Total: N + 2 snippet invocations
 */

import {
  type ChainDefinition,
  type ResourceEstimate,
  type PartitionSpec,
  type SnippetHandler,
  type Partitioner,
} from '../types.js';
import { ChainBuilder } from '../chain-builder.js';

// =============================================================================
// Scatter-Gather Types
// =============================================================================

/**
 * Configuration for scatter-gather pattern
 */
export interface ScatterGatherConfig<_TInput = unknown, _TPartitionInput = unknown, _TPartitionOutput = unknown, _TOutput = unknown> {
  /** Chain identifier */
  id: string;
  /** Chain name */
  name: string;
  /** Description */
  description?: string;

  /** Scatter configuration */
  scatter: {
    /** Snippet ID for scatter step */
    snippetId: string;
    /** Resource estimate */
    resourceEstimate?: Partial<ResourceEstimate>;
  };

  /** Partition configuration */
  partition: {
    /** Partitioner ID */
    partitionerId: string;
    /** Maximum number of partitions */
    maxPartitions: number;
    /** Snippet ID for partition processing */
    snippetId: string;
    /** Resource estimate per partition */
    resourceEstimate?: Partial<ResourceEstimate>;
  };

  /** Gather configuration */
  gather: {
    /** Snippet ID for gather step */
    snippetId: string;
    /** Resource estimate */
    resourceEstimate?: Partial<ResourceEstimate>;
  };
}

/**
 * Result of scatter step - determines partitioning
 */
export interface ScatterResult<T = unknown> {
  /** Partition specifications */
  partitions: T[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input to gather step
 */
export interface GatherInput<T = unknown> {
  /** Results from all partitions */
  partitionResults: T[];
  /** Original scatter metadata */
  scatterMetadata?: Record<string, unknown>;
}

// =============================================================================
// Builder Function
// =============================================================================

/**
 * Build a scatter-gather chain
 */
export function scatterGather<TInput = unknown, _TPartitionInput = unknown, _TPartitionOutput = unknown, TOutput = unknown>(
  config: ScatterGatherConfig<TInput, _TPartitionInput, _TPartitionOutput, TOutput>
): ChainDefinition<TInput, TOutput> {
  const builder = ChainBuilder.create({
    id: config.id,
    name: config.name,
    description: config.description ?? 'Scatter-gather pattern chain',
  });

  // Stage 1: Scatter (determine partitions)
  builder.sequential('scatter', {
    name: 'Scatter',
    description: 'Determine partitions for parallel processing',
    snippet: config.scatter.snippetId,
    resourceEstimate: config.scatter.resourceEstimate,
  });

  // Stage 2: Parallel partition processing
  builder.parallel('process-partitions', {
    name: 'Process Partitions',
    description: 'Process each partition in parallel',
    snippet: config.partition.snippetId,
    partitioner: config.partition.partitionerId,
    maxParallelism: config.partition.maxPartitions,
    resourceEstimate: config.partition.resourceEstimate,
  });

  // Stage 3: Gather (combine results)
  builder.sequential('gather', {
    name: 'Gather',
    description: 'Combine partition results',
    snippet: config.gather.snippetId,
    resourceEstimate: config.gather.resourceEstimate,
  });

  return builder.build();
}

// =============================================================================
// Common Partitioners
// =============================================================================

/**
 * Create a partitioner that splits data by array index
 */
export function arrayPartitioner<T>(): Partitioner<ScatterResult<T>> {
  return (input: ScatterResult<T>, maxPartitions: number): PartitionSpec[] => {
    const partitions = input.partitions.slice(0, maxPartitions);
    return partitions.map((data, index) => ({
      index,
      input: data,
      metadata: { totalPartitions: partitions.length },
    }));
  };
}

/**
 * Create a partitioner that splits by partition IDs
 */
export function idPartitioner(): Partitioner<ScatterResult<string>> {
  return (input: ScatterResult<string>, maxPartitions: number): PartitionSpec[] => {
    const ids = input.partitions.slice(0, maxPartitions);
    return ids.map((id, index) => ({
      index,
      input: { partitionId: id },
      metadata: { partitionId: id },
    }));
  };
}

/**
 * Create a partitioner for numeric ranges
 */
export function rangePartitioner(totalItems: number): Partitioner<ScatterResult<void>> {
  return (_input: ScatterResult<void>, maxPartitions: number): PartitionSpec[] => {
    const itemsPerPartition = Math.ceil(totalItems / maxPartitions);
    const partitions: PartitionSpec[] = [];

    for (let i = 0; i < maxPartitions && i * itemsPerPartition < totalItems; i++) {
      const start = i * itemsPerPartition;
      const end = Math.min(start + itemsPerPartition, totalItems);
      partitions.push({
        index: i,
        input: { start, end },
        metadata: { start, end },
      });
    }

    return partitions;
  };
}

// =============================================================================
// Helper Handlers
// =============================================================================

/**
 * Create a scatter handler that returns partition IDs from input
 */
export function createScatterHandler<T>(
  getPartitions: (input: T) => unknown[]
): SnippetHandler<T, ScatterResult> {
  return async (_ctx, input) => {
    const partitions = getPartitions(input);
    return { partitions };
  };
}

/**
 * Create a gather handler that combines partition results
 */
export function createGatherHandler<TPartitionOutput, TOutput>(
  reducer: (results: TPartitionOutput[]) => TOutput
): SnippetHandler<TPartitionOutput[], TOutput> {
  return async (_ctx, partitionResults) => {
    return reducer(partitionResults);
  };
}

// =============================================================================
// Pre-built Scatter-Gather Variants
// =============================================================================

/**
 * Simple scatter-gather with identity partitioning
 */
export function simpleScatterGather(
  id: string,
  partitionSnippetId: string,
  gatherSnippetId: string,
  maxPartitions = 10
): ChainDefinition {
  return scatterGather({
    id,
    name: `Simple Scatter-Gather: ${id}`,
    scatter: {
      snippetId: 'identity-scatter',
    },
    partition: {
      partitionerId: 'array-partitioner',
      maxPartitions,
      snippetId: partitionSnippetId,
    },
    gather: {
      snippetId: gatherSnippetId,
    },
  });
}

/**
 * Partition-based scatter-gather for data stores
 */
export function partitionScan(
  id: string,
  options: {
    findPartitionsSnippetId: string;
    scanPartitionSnippetId: string;
    mergeResultsSnippetId: string;
    maxPartitions?: number;
  }
): ChainDefinition {
  return scatterGather({
    id,
    name: `Partition Scan: ${id}`,
    description: 'Scan data across multiple partitions',
    scatter: {
      snippetId: options.findPartitionsSnippetId,
      resourceEstimate: { subrequests: 1, cpuMs: 1, memoryBytes: 4 * 1024 * 1024 },
    },
    partition: {
      partitionerId: 'partition-id-partitioner',
      maxPartitions: options.maxPartitions ?? 10,
      snippetId: options.scanPartitionSnippetId,
      resourceEstimate: { subrequests: 2, cpuMs: 3, memoryBytes: 16 * 1024 * 1024 },
    },
    gather: {
      snippetId: options.mergeResultsSnippetId,
      resourceEstimate: { subrequests: 0, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
    },
  });
}

// =============================================================================
// Cost Calculator
// =============================================================================

/**
 * Calculate estimated cost for scatter-gather pattern
 */
export function calculateScatterGatherCost(
  partitionCount: number,
  perPartitionEstimate: ResourceEstimate,
  scatterEstimate: ResourceEstimate = { subrequests: 1, cpuMs: 1, memoryBytes: 4 * 1024 * 1024 },
  gatherEstimate: ResourceEstimate = { subrequests: 0, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 }
): {
  totalSnippetInvocations: number;
  totalSubrequests: number;
  estimatedCpuMs: number;
  peakMemoryBytes: number;
} {
  return {
    totalSnippetInvocations: 1 + partitionCount + 1,
    totalSubrequests:
      scatterEstimate.subrequests +
      perPartitionEstimate.subrequests * partitionCount +
      gatherEstimate.subrequests,
    estimatedCpuMs:
      scatterEstimate.cpuMs +
      perPartitionEstimate.cpuMs + // Parallel, so just max of one
      gatherEstimate.cpuMs,
    peakMemoryBytes: Math.max(
      scatterEstimate.memoryBytes,
      perPartitionEstimate.memoryBytes * partitionCount,
      gatherEstimate.memoryBytes
    ),
  };
}
