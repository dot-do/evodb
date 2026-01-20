/**
 * Vector Search Pattern
 *
 * Multi-stage vector similarity search optimized for
 * Cloudflare's snippet constraints.
 *
 * Use cases:
 * - Semantic search
 * - Recommendation systems
 * - Image/embedding similarity
 * - RAG (Retrieval Augmented Generation) retrieval
 *
 * Pattern Structure:
 *   Stage 1: Centroid Search (coarse)
 *     - Load centroids from edge cache
 *     - Find top-k nearest cluster centroids
 *     - Return qualifying partition IDs
 *
 *   Stage 2: Partition Scan (parallel, fine)
 *     - Each snippet scans one partition
 *     - Compute exact distances
 *     - Return top-k candidates from partition
 *
 *   Stage 3: Merge & Rerank
 *     - Merge all partition results
 *     - Optional reranking with additional signals
 *     - Return final top-k
 *
 * Resource Budget:
 * - Centroid search: 1 snippet (cached centroids, minimal subrequests)
 * - Partition scans: P snippets (where P = qualifying partitions)
 * - Merge: 1 snippet
 * - Total: P + 2 snippet invocations
 */

import {
  type ChainDefinition,
  type ResourceEstimate,
  type PartitionSpec,
  type Partitioner,
} from '../types.js';
import { ChainBuilder } from '../chain-builder.js';

// =============================================================================
// Vector Search Types
// =============================================================================

/**
 * Vector embedding
 */
export type Vector = Float32Array | number[];

/**
 * Distance metric types
 */
export type DistanceMetric = 'euclidean' | 'cosine' | 'dot' | 'manhattan';

/**
 * Vector search query
 */
export interface VectorSearchQuery {
  /** Query vector */
  vector: Vector;
  /** Number of results to return */
  topK: number;
  /** Distance metric */
  metric?: DistanceMetric;
  /** Optional filter expression */
  filter?: string;
  /** Minimum similarity threshold */
  minSimilarity?: number;
  /** Include vector in results */
  includeVectors?: boolean;
  /** Include metadata in results */
  includeMetadata?: boolean;
}

/**
 * Centroid information
 */
export interface Centroid {
  /** Centroid ID */
  id: string;
  /** Centroid vector */
  vector: Vector;
  /** Partition ID this centroid represents */
  partitionId: string;
  /** Number of vectors in this partition */
  vectorCount: number;
}

/**
 * Result from centroid search
 */
export interface CentroidSearchResult {
  /** Qualifying partition IDs */
  partitionIds: string[];
  /** Distances to centroids (for debugging) */
  centroidDistances?: Array<{ partitionId: string; distance: number }>;
  /** Expansion factor used */
  expansionFactor: number;
}

/**
 * Candidate vector from partition scan
 */
export interface VectorCandidate {
  /** Vector ID */
  id: string;
  /** Distance to query */
  distance: number;
  /** Similarity score (1 - normalized distance) */
  similarity: number;
  /** Original vector (if requested) */
  vector?: Vector;
  /** Vector metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result from partition scan
 */
export interface PartitionScanResult {
  /** Partition ID */
  partitionId: string;
  /** Top candidates from this partition */
  candidates: VectorCandidate[];
  /** Total vectors scanned */
  vectorsScanned: number;
  /** Vectors passing filter */
  vectorsMatched: number;
}

/**
 * Final merged search result
 */
export interface VectorSearchResult {
  /** Final top-k results */
  results: VectorCandidate[];
  /** Total vectors scanned across all partitions */
  totalScanned: number;
  /** Number of partitions searched */
  partitionsSearched: number;
  /** Query execution metadata */
  executionMetadata: {
    centroidSearchMs: number;
    partitionScanMs: number;
    mergeMs: number;
    totalMs: number;
  };
}

/**
 * Configuration for vector search chain
 */
export interface VectorSearchConfig {
  /** Chain identifier */
  id: string;
  /** Chain name */
  name: string;
  /** Description */
  description?: string;

  /** Centroid search configuration */
  centroidSearch: {
    /** Snippet ID */
    snippetId: string;
    /** Number of centroids to probe */
    nProbe?: number;
    /** Expansion factor for recall */
    expansionFactor?: number;
    /** Resource estimate */
    resourceEstimate?: Partial<ResourceEstimate>;
  };

  /** Partition scan configuration */
  partitionScan: {
    /** Snippet ID */
    snippetId: string;
    /** Partitioner ID */
    partitionerId: string;
    /** Maximum partitions to scan */
    maxPartitions?: number;
    /** Resource estimate per partition */
    resourceEstimate?: Partial<ResourceEstimate>;
  };

  /** Merge/rerank configuration */
  merge: {
    /** Snippet ID */
    snippetId: string;
    /** Enable reranking */
    rerank?: boolean;
    /** Resource estimate */
    resourceEstimate?: Partial<ResourceEstimate>;
  };
}

// =============================================================================
// Builder Function
// =============================================================================

/**
 * Build a vector search chain
 */
export function vectorSearch(config: VectorSearchConfig): ChainDefinition {
  const builder = ChainBuilder.create({
    id: config.id,
    name: config.name,
    description: config.description ?? 'Multi-stage vector similarity search',
  });

  // Stage 1: Centroid search (coarse filtering)
  builder.sequential('centroid-search', {
    name: 'Centroid Search',
    description: 'Find nearest cluster centroids to identify candidate partitions',
    snippet: config.centroidSearch.snippetId,
    resourceEstimate: config.centroidSearch.resourceEstimate ?? {
      subrequests: 1, // Load centroids from cache
      cpuMs: 2,
      memoryBytes: 8 * 1024 * 1024,
    },
  });

  // Stage 2: Parallel partition scans (fine search)
  builder.parallel('partition-scan', {
    name: 'Partition Scan',
    description: 'Scan candidate partitions for exact matches',
    snippet: config.partitionScan.snippetId,
    partitioner: config.partitionScan.partitionerId,
    maxParallelism: config.partitionScan.maxPartitions ?? 10,
    resourceEstimate: config.partitionScan.resourceEstimate ?? {
      subrequests: 2, // Load partition data
      cpuMs: 4,
      memoryBytes: 16 * 1024 * 1024,
    },
  });

  // Stage 3: Merge and rerank results
  builder.sequential('merge-results', {
    name: 'Merge Results',
    description: 'Merge partition results and optionally rerank',
    snippet: config.merge.snippetId,
    resourceEstimate: config.merge.resourceEstimate ?? {
      subrequests: config.merge.rerank ? 1 : 0,
      cpuMs: 2,
      memoryBytes: 8 * 1024 * 1024,
    },
  });

  return builder.build();
}

// =============================================================================
// Vector Search Partitioner
// =============================================================================

/**
 * Partitioner for vector search that uses centroid search results
 */
export function vectorPartitioner(): Partitioner<CentroidSearchResult> {
  return (result: CentroidSearchResult, maxPartitions: number): PartitionSpec[] => {
    const partitionIds = result.partitionIds.slice(0, maxPartitions);
    return partitionIds.map((partitionId, index) => ({
      index,
      input: { partitionId },
      metadata: {
        partitionId,
        centroidDistance: result.centroidDistances?.find(
          c => c.partitionId === partitionId
        )?.distance,
      },
    }));
  };
}

// =============================================================================
// Distance Functions
// =============================================================================

/**
 * Calculate Euclidean distance
 */
export function euclideanDistance(a: Vector, b: Vector): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Calculate cosine similarity
 */
export function cosineSimilarity(a: Vector, b: Vector): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Calculate cosine distance (1 - similarity)
 */
export function cosineDistance(a: Vector, b: Vector): number {
  return 1 - cosineSimilarity(a, b);
}

/**
 * Calculate dot product
 */
export function dotProduct(a: Vector, b: Vector): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return sum;
}

/**
 * Get distance function by metric type
 */
export function getDistanceFunction(
  metric: DistanceMetric
): (a: Vector, b: Vector) => number {
  switch (metric) {
    case 'euclidean':
      return euclideanDistance;
    case 'cosine':
      return cosineDistance;
    case 'dot':
      return (a, b) => -dotProduct(a, b); // Negate for "distance" semantics
    case 'manhattan':
      return (a, b) => {
        let sum = 0;
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) {
          sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
        }
        return sum;
      };
    default:
      throw new Error(`Unknown distance metric: ${metric}`);
  }
}

// =============================================================================
// Pre-built Vector Search Variants
// =============================================================================

/**
 * Standard IVF (Inverted File) vector search
 */
export function ivfVectorSearch(
  id: string,
  options: {
    centroidSearchSnippetId: string;
    partitionScanSnippetId: string;
    mergeSnippetId: string;
    nProbe?: number;
    maxPartitions?: number;
  }
): ChainDefinition {
  return vectorSearch({
    id,
    name: `IVF Vector Search: ${id}`,
    description: 'Inverted file index based vector search',
    centroidSearch: {
      snippetId: options.centroidSearchSnippetId,
      nProbe: options.nProbe ?? 10,
    },
    partitionScan: {
      snippetId: options.partitionScanSnippetId,
      partitionerId: 'vector-partitioner',
      maxPartitions: options.maxPartitions ?? 10,
    },
    merge: {
      snippetId: options.mergeSnippetId,
    },
  });
}

/**
 * Vector search with reranking
 */
export function rerankingVectorSearch(
  id: string,
  options: {
    centroidSearchSnippetId: string;
    partitionScanSnippetId: string;
    rerankSnippetId: string;
    maxPartitions?: number;
  }
): ChainDefinition {
  return vectorSearch({
    id,
    name: `Reranking Vector Search: ${id}`,
    description: 'Vector search with reranking stage',
    centroidSearch: {
      snippetId: options.centroidSearchSnippetId,
    },
    partitionScan: {
      snippetId: options.partitionScanSnippetId,
      partitionerId: 'vector-partitioner',
      maxPartitions: options.maxPartitions ?? 10,
    },
    merge: {
      snippetId: options.rerankSnippetId,
      rerank: true,
      resourceEstimate: {
        subrequests: 1, // May call reranking model
        cpuMs: 3,
        memoryBytes: 8 * 1024 * 1024,
      },
    },
  });
}

/**
 * Hybrid search (vector + keyword)
 */
export function hybridSearch(
  id: string,
  options: {
    vectorSearchSnippetId: string;
    keywordSearchSnippetId: string;
    fusionSnippetId: string;
  }
): ChainDefinition {
  const builder = ChainBuilder.create({
    id,
    name: `Hybrid Search: ${id}`,
    description: 'Combined vector and keyword search with fusion',
  });

  // Vector search stage
  builder.sequential('vector-search', {
    name: 'Vector Search',
    snippet: options.vectorSearchSnippetId,
    resourceEstimate: {
      subrequests: 3,
      cpuMs: 4,
      memoryBytes: 16 * 1024 * 1024,
    },
  });

  // Keyword search stage (depends on nothing - runs conceptually in parallel after vector search completes)
  builder.sequential('keyword-search', {
    name: 'Keyword Search',
    snippet: options.keywordSearchSnippetId,
    resourceEstimate: {
      subrequests: 2,
      cpuMs: 2,
      memoryBytes: 8 * 1024 * 1024,
    },
  });

  // Fusion stage
  builder.sequential('fusion', {
    name: 'Result Fusion',
    snippet: options.fusionSnippetId,
    resourceEstimate: {
      subrequests: 0,
      cpuMs: 2,
      memoryBytes: 8 * 1024 * 1024,
    },
  });

  return builder.build();
}

// =============================================================================
// Merge Utilities
// =============================================================================

/**
 * Merge partition scan results
 */
export function mergePartitionResults(
  results: PartitionScanResult[],
  topK: number
): VectorCandidate[] {
  // Collect all candidates
  const allCandidates: VectorCandidate[] = [];
  for (const result of results) {
    allCandidates.push(...result.candidates);
  }

  // Sort by distance (ascending)
  allCandidates.sort((a, b) => a.distance - b.distance);

  // Return top-k
  return allCandidates.slice(0, topK);
}

/**
 * Reciprocal Rank Fusion for combining multiple result lists
 */
export function reciprocalRankFusion(
  resultLists: Array<Array<{ id: string; score: number }>>,
  k = 60
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();

  for (const results of resultLists) {
    results.forEach((result, rank) => {
      const rrf = 1 / (k + rank + 1);
      scores.set(result.id, (scores.get(result.id) ?? 0) + rrf);
    });
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

// =============================================================================
// Cost Calculator
// =============================================================================

/**
 * Calculate estimated cost for vector search pattern
 */
export function calculateVectorSearchCost(
  partitionsToScan: number,
  perPartitionEstimate: ResourceEstimate = {
    subrequests: 2,
    cpuMs: 4,
    memoryBytes: 16 * 1024 * 1024,
  },
  centroidSearchEstimate: ResourceEstimate = {
    subrequests: 1,
    cpuMs: 2,
    memoryBytes: 8 * 1024 * 1024,
  },
  mergeEstimate: ResourceEstimate = {
    subrequests: 0,
    cpuMs: 2,
    memoryBytes: 8 * 1024 * 1024,
  }
): {
  totalSnippetInvocations: number;
  totalSubrequests: number;
  estimatedCpuMs: number;
  peakMemoryBytes: number;
} {
  return {
    totalSnippetInvocations: 1 + partitionsToScan + 1,
    totalSubrequests:
      centroidSearchEstimate.subrequests +
      perPartitionEstimate.subrequests * partitionsToScan +
      mergeEstimate.subrequests,
    estimatedCpuMs:
      centroidSearchEstimate.cpuMs +
      perPartitionEstimate.cpuMs + // Parallel
      mergeEstimate.cpuMs,
    peakMemoryBytes: Math.max(
      centroidSearchEstimate.memoryBytes,
      perPartitionEstimate.memoryBytes * partitionsToScan,
      mergeEstimate.memoryBytes
    ),
  };
}
