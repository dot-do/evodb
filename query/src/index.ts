/**
 * @evodb/query - EvoDB Query Engine
 *
 * Execute queries against R2-stored columnar data with:
 * - Zone map optimization for partition pruning
 * - Bloom filter support for point lookups
 * - Edge cache integration
 * - Streaming results for large queries
 *
 * @example
 * ```typescript
 * import { createQueryEngine, type Query } from '@evodb/query';
 *
 * const engine = createQueryEngine({ bucket: env.R2_BUCKET });
 *
 * const query: Query = {
 *   table: 'com/example/api/users',
 *   predicates: [
 *     { column: 'status', operator: 'eq', value: 'active' }
 *   ],
 *   projection: { columns: ['id', 'name', 'email'] },
 *   limit: 100,
 * };
 *
 * const result = await engine.execute(query);
 * console.log(`Found ${result.totalRowCount} users`);
 * ```
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Core query types
  Query,
  Projection,
  Predicate,
  PredicateOperator,
  PredicateValue,
  Aggregation,
  AggregationFunction,
  OrderBy,
  QueryHints,

  // Query plan types
  QueryPlan,
  PlanOperator,
  ScanOperator,
  FilterOperator,
  ProjectOperator,
  AggregateOperator,
  SortOperator,
  LimitOperator,
  MergeOperator,
  PartitionInfo,
  ZoneMap,
  ZoneMapColumn,
  BloomFilterInfo,
  PrunedPartition,
  PruneReason,
  QueryCost,

  // Result types
  QueryResult,
  QueryStats,
  StreamingQueryResult,

  // Cache types
  CacheStats,
  CacheEntry,

  // Configuration types
  QueryEngineConfig,
  CacheConfig,

  // R2 types
  R2Bucket,
  R2GetOptions,
  R2Range,
  R2Object,
  R2HttpMetadata,
  R2Objects,
  R2ListOptions,
} from './types.js';

// =============================================================================
// Class Exports
// =============================================================================

export {
  QueryEngine,
  QueryPlanner,
  PartitionScanner,
  ZoneMapOptimizer,
  BloomFilterManager,
  AggregationEngine,
  CacheManager,
  ResultProcessor,
} from './engine.js';

// =============================================================================
// Factory Function Exports
// =============================================================================

export {
  createQueryEngine,
  createQueryPlanner,
  createZoneMapOptimizer,
  createBloomFilterManager,
  createAggregationEngine,
  createCacheManager,
  createResultProcessor,
} from './engine.js';
