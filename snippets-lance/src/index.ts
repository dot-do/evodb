/**
 * @evodb/snippets-lance
 *
 * Lance vector search optimized for Cloudflare Snippets (5ms CPU, 32MB RAM)
 *
 * Key features:
 * - Edge-cached Lance files for zero-latency reads
 * - IVF-PQ index with lazy partition loading
 * - SIMD-friendly distance computations
 * - Pre-allocated buffers to minimize GC
 * - Memory-efficient design fitting 32MB limit
 *
 * @example
 * ```typescript
 * import {
 *   CachedLanceReader,
 *   SnippetsVectorSearch,
 *   InMemoryVectorSearch,
 *   buildCachedIndex,
 *   generateRandomVectors,
 * } from '@evodb/snippets-lance';
 *
 * // For production: Use edge-cached reader
 * const reader = new CachedLanceReader({
 *   baseUrl: 'https://cdn.workers.do/lance',
 *   dataset: 'embeddings',
 * });
 *
 * const search = new SnippetsVectorSearch(reader);
 * await search.initialize();
 *
 * const results = await search.search(queryVector, { k: 10, nprobes: 1 });
 *
 * // For testing: Use in-memory search
 * const vectors = generateRandomVectors(10000, 384);
 * const index = buildCachedIndex({
 *   numPartitions: 64,
 *   dimension: 384,
 *   numSubVectors: 48,
 *   distanceType: 'l2',
 *   vectors,
 * });
 *
 * const memSearch = new InMemoryVectorSearch(
 *   index.centroids,
 *   index.pqCodebook,
 *   index.partitionData,
 * );
 *
 * const results = memSearch.search(queryVector, { k: 10 });
 * ```
 *
 * @packageDocumentation
 */

// ==========================================
// Types
// ==========================================

export type {
  // Constraints
  SnippetsConstraints,

  // Edge Cache
  EdgeCacheAdapter,
  CachedLanceConfig,

  // Index Components
  CentroidIndex,
  PQCodebook,
  PartitionMeta,
  PartitionData,

  // Search
  SnippetsSearchOptions,
  SearchResult,

  // Benchmark
  BenchmarkTiming,
  MemoryUsage,
  BenchmarkResult,
} from './types.js';

export { SNIPPETS_CONSTRAINTS } from './types.js';

// ==========================================
// Cached Lance Reader
// ==========================================

export {
  CachedLanceReader,
  FetchEdgeCacheAdapter,
  buildCachedIndex,
} from './cached-lance-reader.js';

export type {
  CachedIndexHeader,
  BuildCachedIndexOptions,
} from './cached-lance-reader.js';

// ==========================================
// Vector Search
// ==========================================

export {
  SnippetsVectorSearch,
  InMemoryVectorSearch,
  benchmarkSearch,
  generateRandomVectors,
  normalizeVector,
  microtime,
} from './snippets-vector-search.js';
