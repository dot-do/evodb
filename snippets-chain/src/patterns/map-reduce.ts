/**
 * Map-Reduce Pattern
 *
 * Map data across parallel snippets, then reduce results.
 * Classic pattern for aggregations, transformations, and analytics.
 *
 * Use cases:
 * - Aggregations (SUM, COUNT, AVG) over partitioned data
 * - Parallel data transformations
 * - Distributed analytics
 *
 * Pattern Structure:
 *   [Input] → Split → Map[1..N] → Combine → Reduce → [Output]
 *
 * Resource Budget:
 * - Split: 1 snippet (optional, can be inline)
 * - Map: N snippet invocations
 * - Combine: 1 snippet (optional, can be inline with reduce)
 * - Reduce: 1 snippet
 * - Total: N + 1 to N + 3 snippet invocations
 */

import {
  type ChainDefinition,
  type ResourceEstimate,
  type PartitionSpec,
  type Partitioner,
} from '../types.js';
import { ChainBuilder } from '../chain-builder.js';

// =============================================================================
// Map-Reduce Types
// =============================================================================

/**
 * Configuration for map-reduce pattern
 */
export interface MapReduceConfig<_TInput = unknown, _TMapInput = unknown, _TMapOutput = unknown, _TOutput = unknown> {
  /** Chain identifier */
  id: string;
  /** Chain name */
  name: string;
  /** Description */
  description?: string;

  /** Splitter configuration (optional) */
  split?: {
    /** Snippet ID for split step */
    snippetId: string;
    /** Resource estimate */
    resourceEstimate?: Partial<ResourceEstimate>;
  };

  /** Map configuration */
  map: {
    /** Partitioner ID */
    partitionerId: string;
    /** Maximum number of mappers */
    maxMappers: number;
    /** Snippet ID for map operation */
    snippetId: string;
    /** Resource estimate per mapper */
    resourceEstimate?: Partial<ResourceEstimate>;
  };

  /** Reduce configuration */
  reduce: {
    /** Snippet ID for reduce step */
    snippetId: string;
    /** Resource estimate */
    resourceEstimate?: Partial<ResourceEstimate>;
  };
}

/**
 * Common aggregation types
 */
export type AggregationType = 'sum' | 'count' | 'min' | 'max' | 'avg' | 'collect';

/**
 * Partial aggregation result (from map phase)
 */
export interface PartialAggregation {
  type: AggregationType;
  value: number;
  count?: number; // For avg calculation
}

/**
 * Key-value pair for grouped aggregations
 */
export interface KeyedAggregation<K = string> {
  key: K;
  aggregations: PartialAggregation[];
}

// =============================================================================
// Builder Function
// =============================================================================

/**
 * Build a map-reduce chain
 */
export function mapReduce<TInput = unknown, _TMapInput = unknown, _TMapOutput = unknown, TOutput = unknown>(
  config: MapReduceConfig<TInput, _TMapInput, _TMapOutput, TOutput>
): ChainDefinition<TInput, TOutput> {
  const builder = ChainBuilder.create({
    id: config.id,
    name: config.name,
    description: config.description ?? 'Map-reduce pattern chain',
  });

  // Stage 1: Split (optional)
  if (config.split) {
    builder.sequential('split', {
      name: 'Split',
      description: 'Split input data for parallel processing',
      snippet: config.split.snippetId,
      resourceEstimate: config.split.resourceEstimate,
    });
  }

  // Stage 2: Map (parallel)
  builder.parallel('map', {
    name: 'Map',
    description: 'Apply map function to each partition',
    snippet: config.map.snippetId,
    partitioner: config.map.partitionerId,
    maxParallelism: config.map.maxMappers,
    resourceEstimate: config.map.resourceEstimate,
  });

  // Stage 3: Reduce
  builder.sequential('reduce', {
    name: 'Reduce',
    description: 'Reduce mapped results',
    snippet: config.reduce.snippetId,
    resourceEstimate: config.reduce.resourceEstimate,
  });

  return builder.build();
}

// =============================================================================
// Common Partitioners for Map-Reduce
// =============================================================================

/**
 * Partitioner that splits arrays into chunks
 */
export function chunkPartitioner<T>(chunkSize: number): Partitioner<T[]> {
  return (input: T[], maxPartitions: number): PartitionSpec[] => {
    const partitions: PartitionSpec[] = [];
    const actualChunkSize = Math.max(
      chunkSize,
      Math.ceil(input.length / maxPartitions)
    );

    for (let i = 0; i < input.length && partitions.length < maxPartitions; i += actualChunkSize) {
      partitions.push({
        index: partitions.length,
        input: input.slice(i, i + actualChunkSize),
        metadata: {
          startIndex: i,
          endIndex: Math.min(i + actualChunkSize, input.length),
        },
      });
    }

    return partitions;
  };
}

/**
 * Partitioner that splits by key hash
 */
export function hashPartitioner<T extends { key: string }>(
  hashFn: (key: string) => number = defaultHash
): Partitioner<T[]> {
  return (input: T[], maxPartitions: number): PartitionSpec[] => {
    const buckets: Map<number, T[]> = new Map();

    for (const item of input) {
      const bucket = hashFn(item.key) % maxPartitions;
      if (!buckets.has(bucket)) {
        buckets.set(bucket, []);
      }
      const bucketItems = buckets.get(bucket);
      if (bucketItems) {
        bucketItems.push(item);
      }
    }

    return Array.from(buckets.entries()).map(([bucket, items]) => ({
      index: bucket,
      input: items,
      metadata: { bucket },
    }));
  };
}

function defaultHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// =============================================================================
// Aggregation Reducers
// =============================================================================

/**
 * Reduce partial sums
 */
export function sumReducer(partials: number[]): number {
  return partials.reduce((a, b) => a + b, 0);
}

/**
 * Reduce partial counts
 */
export function countReducer(partials: number[]): number {
  return partials.reduce((a, b) => a + b, 0);
}

/**
 * Reduce partial mins
 */
export function minReducer(partials: number[]): number {
  return Math.min(...partials);
}

/**
 * Reduce partial maxes
 */
export function maxReducer(partials: number[]): number {
  return Math.max(...partials);
}

/**
 * Reduce partial averages (requires count tracking)
 */
export function avgReducer(
  partials: Array<{ sum: number; count: number }>
): number {
  const totalSum = partials.reduce((acc, p) => acc + p.sum, 0);
  const totalCount = partials.reduce((acc, p) => acc + p.count, 0);
  return totalCount > 0 ? totalSum / totalCount : 0;
}

/**
 * Generic aggregation reducer
 */
export function aggregationReducer(
  partials: PartialAggregation[]
): number {
  if (partials.length === 0) return 0;

  const type = partials[0].type;
  const values = partials.map(p => p.value);

  switch (type) {
    case 'sum':
    case 'count':
      return sumReducer(values);
    case 'min':
      return minReducer(values);
    case 'max':
      return maxReducer(values);
    case 'avg':
      return avgReducer(
        partials.map(p => ({
          sum: p.value * (p.count ?? 1),
          count: p.count ?? 1,
        }))
      );
    default:
      throw new Error(`Unknown aggregation type: ${type}`);
  }
}

// =============================================================================
// Pre-built Map-Reduce Variants
// =============================================================================

/**
 * Simple aggregation chain
 */
export function aggregationChain(
  id: string,
  options: {
    mapSnippetId: string;
    reduceSnippetId: string;
    maxMappers?: number;
    aggregationType?: AggregationType;
  }
): ChainDefinition {
  return mapReduce({
    id,
    name: `Aggregation: ${id}`,
    description: `Aggregation chain for ${options.aggregationType ?? 'sum'}`,
    map: {
      partitionerId: 'chunk-partitioner',
      maxMappers: options.maxMappers ?? 10,
      snippetId: options.mapSnippetId,
      resourceEstimate: { subrequests: 1, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
    },
    reduce: {
      snippetId: options.reduceSnippetId,
      resourceEstimate: { subrequests: 0, cpuMs: 1, memoryBytes: 4 * 1024 * 1024 },
    },
  });
}

/**
 * Word count style chain (classic map-reduce example)
 */
export function wordCountChain(
  id: string,
  options: {
    mapSnippetId: string;
    reduceSnippetId: string;
    maxMappers?: number;
  }
): ChainDefinition {
  return mapReduce({
    id,
    name: `Word Count: ${id}`,
    description: 'Count word occurrences using map-reduce',
    map: {
      partitionerId: 'chunk-partitioner',
      maxMappers: options.maxMappers ?? 10,
      snippetId: options.mapSnippetId,
      resourceEstimate: { subrequests: 0, cpuMs: 3, memoryBytes: 16 * 1024 * 1024 },
    },
    reduce: {
      snippetId: options.reduceSnippetId,
      resourceEstimate: { subrequests: 0, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
    },
  });
}

/**
 * Grouped aggregation chain (e.g., SUM(amount) GROUP BY category)
 */
export function groupedAggregationChain<_K = string>(
  id: string,
  options: {
    splitSnippetId?: string;
    mapSnippetId: string;
    reduceSnippetId: string;
    maxMappers?: number;
  }
): ChainDefinition {
  return mapReduce({
    id,
    name: `Grouped Aggregation: ${id}`,
    description: 'Grouped aggregation using map-reduce',
    split: options.splitSnippetId
      ? {
          snippetId: options.splitSnippetId,
          resourceEstimate: { subrequests: 1, cpuMs: 1, memoryBytes: 4 * 1024 * 1024 },
        }
      : undefined,
    map: {
      partitionerId: 'hash-partitioner',
      maxMappers: options.maxMappers ?? 10,
      snippetId: options.mapSnippetId,
      resourceEstimate: { subrequests: 1, cpuMs: 3, memoryBytes: 16 * 1024 * 1024 },
    },
    reduce: {
      snippetId: options.reduceSnippetId,
      resourceEstimate: { subrequests: 0, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
    },
  });
}

// =============================================================================
// Cost Calculator
// =============================================================================

/**
 * Calculate estimated cost for map-reduce pattern
 */
export function calculateMapReduceCost(
  mapperCount: number,
  perMapperEstimate: ResourceEstimate,
  reduceEstimate: ResourceEstimate = { subrequests: 0, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
  splitEstimate?: ResourceEstimate
): {
  totalSnippetInvocations: number;
  totalSubrequests: number;
  estimatedCpuMs: number;
  peakMemoryBytes: number;
} {
  const splitCost = splitEstimate ?? { subrequests: 0, cpuMs: 0, memoryBytes: 0 };

  return {
    totalSnippetInvocations: (splitEstimate ? 1 : 0) + mapperCount + 1,
    totalSubrequests:
      splitCost.subrequests +
      perMapperEstimate.subrequests * mapperCount +
      reduceEstimate.subrequests,
    estimatedCpuMs:
      splitCost.cpuMs +
      perMapperEstimate.cpuMs + // Parallel, so just one
      reduceEstimate.cpuMs,
    peakMemoryBytes: Math.max(
      splitCost.memoryBytes,
      perMapperEstimate.memoryBytes * mapperCount,
      reduceEstimate.memoryBytes
    ),
  };
}
