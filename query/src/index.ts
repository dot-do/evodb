/**
 * @evodb/query - Unified Query Engine Package
 *
 * This package provides a unified query engine with configurable execution modes.
 *
 * ## Recommended: UnifiedQueryEngine (v0.2.0+)
 * The new UnifiedQueryEngine consolidates both simple and full modes into a single class:
 *
 * ```typescript
 * import { UnifiedQueryEngine } from '@evodb/query';
 *
 * // Simple mode - lightweight for basic queries
 * const simpleEngine = new UnifiedQueryEngine({
 *   mode: 'simple',
 *   bucket: env.R2_BUCKET,
 *   simpleCache: { enableCacheApi: true },
 * });
 *
 * // Full mode (default) - advanced features
 * const fullEngine = new UnifiedQueryEngine({
 *   mode: 'full',  // default
 *   bucket: env.R2_BUCKET,
 *   cache: { enabled: true, ttlSeconds: 3600, maxSizeBytes: 256 * 1024 * 1024, keyPrefix: 'evodb:' },
 * });
 * ```
 *
 * ## Execution Modes:
 *
 * ### Simple Mode
 * Lightweight query engine for basic filtering, projection, and aggregation:
 * - R2 + Cache API integration
 * - Manifest-based table discovery
 * - Columnar JSON block reading
 * - Lower overhead, fewer features
 *
 * ### Full Mode (default)
 * Full-featured query engine with:
 * - Zone map optimization for partition pruning
 * - Bloom filter support for point lookups
 * - Edge cache integration (LRU)
 * - Streaming results for large queries
 * - Query planning and cost estimation
 * - Memory tracking and limits
 * - Subrequest budget tracking
 *
 * ## Legacy APIs (Deprecated)
 * SimpleQueryEngine and QueryEngine are still available but deprecated.
 * They will be removed in v0.3.0.
 *
 * @example UnifiedQueryEngine (Recommended)
 * ```typescript
 * import { UnifiedQueryEngine, createUnifiedQueryEngine } from '@evodb/query';
 *
 * // Factory function
 * const engine = createUnifiedQueryEngine({
 *   mode: 'simple',
 *   bucket: env.R2_BUCKET,
 * });
 *
 * // Simple mode query API
 * const result = await engine.query({
 *   table: 'users',
 *   filters: [{ column: 'status', operator: 'eq', value: 'active' }],
 *   columns: ['id', 'name'],
 *   limit: 100,
 * });
 *
 * // Or use unified execute() API (works in both modes)
 * const result2 = await engine.execute({
 *   table: 'users',
 *   predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
 *   columns: ['id', 'name'],
 *   limit: 100,
 * });
 * ```
 *
 * @example Legacy Simple Mode (Deprecated)
 * ```typescript
 * import { SimpleQueryEngine, type SimpleQueryConfig } from '@evodb/query';
 *
 * // DEPRECATED: Use UnifiedQueryEngine with mode: 'simple' instead
 * const engine = new SimpleQueryEngine({
 *   bucket: env.R2_BUCKET,
 *   cache: { enableCacheApi: true },
 * });
 * ```
 *
 * @example Legacy Full Mode (Deprecated)
 * ```typescript
 * import { createQueryEngine, type Query } from '@evodb/query';
 *
 * // DEPRECATED: Use UnifiedQueryEngine with mode: 'full' instead
 * const engine = createQueryEngine({ bucket: env.R2_BUCKET });
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
  QueryExecutionOptions,

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

  // Result types (engine-specific internal format)
  EngineQueryResult,
  EngineQueryStats,
  // Per-operation memory metrics type (for identifying bottlenecks)
  OperationMemoryMetrics,
  // Backward compatibility aliases (deprecated)
  QueryResult,
  QueryStats,
  StreamingQueryResult,

  // Cache types
  CacheStats,
  CacheEntry,

  // Configuration types
  QueryEngineConfig,
  CacheConfig,
  StreamingThresholdConfig,

  // Data source types
  TableDataSource,
  TableDataSourceMetadata,
  DataSourceFactory,

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
  // Error classes
  MemoryLimitExceededError,
  // Memory tracking classes
  GranularMemoryTracker,
  OperationMemoryTracker,
} from './engine.js';

// Memory tracking types
export type {
  QueryPhase,
  PhaseMemoryMetrics,
  GranularMemoryMetrics,
  QueryOperationType,
  OperationMemoryMetricsInternal,
  OperationMemoryReport,
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
  // Adaptive streaming thresholds
  DEFAULT_STREAMING_THRESHOLD_ROWS,
  DEFAULT_STREAMING_THRESHOLD_BYTES,
} from './engine.js';

// =============================================================================
// Cache-Aware Query Planner Exports
// =============================================================================

export {
  CacheAwareQueryPlanner,
  createCacheAwareQueryPlanner,
} from './cache-aware-planner.js';

export type {
  CacheAwarePlanConfig,
  CacheAwarePlan,
  CacheAwarePlanStats,
  CacheBenefitStats,
  PlanCacheStats,
  PrefetchRecommendation,
} from './cache-aware-planner.js';

// =============================================================================
// QueryExecutor Interface (unified query execution)
// =============================================================================

// Re-export QueryExecutor interface types from @evodb/core
export type {
  QueryExecutor,
  StreamingQueryExecutor,
  CacheableQueryExecutor,
  ExecutorQuery,
  ExecutorResult,
  ExecutorStats,
  ExecutorPlan,
  ExecutorCost,
  ExecutorCacheStats,
  StreamingExecutorResult,
} from '@evodb/core';

import type {
  StreamingQueryExecutor,
  CacheableQueryExecutor,
  ExecutorQuery,
  ExecutorResult,
  ExecutorStats,
  ExecutorPlan,
  ExecutorCacheStats,
  StreamingExecutorResult,
} from '@evodb/core';
import { toQueryEngineQuery } from '@evodb/core';
import type { Query, QueryEngineConfig, EngineQueryResult, QueryPlan, EngineQueryStats } from './types.js';
import { QueryEngine } from './engine.js';

/**
 * QueryExecutorAdapter wraps the @evodb/query QueryEngine to provide
 * the unified QueryExecutor interface from @evodb/core.
 *
 * This adapter allows @evodb/query's QueryEngine to be used interchangeably
 * with @evodb/reader when only basic query execution is needed.
 *
 * @example
 * ```typescript
 * import { createQueryEngine, QueryExecutorAdapter, type QueryExecutor } from '@evodb/query';
 *
 * const engine = createQueryEngine({ bucket: env.R2_BUCKET });
 * const executor: QueryExecutor = new QueryExecutorAdapter(engine);
 *
 * // Use unified interface
 * const result = await executor.execute({
 *   table: 'com/example/api/users',
 *   predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
 *   columns: ['id', 'name'],
 *   limit: 100,
 * });
 * ```
 */
export class QueryExecutorAdapter implements StreamingQueryExecutor, CacheableQueryExecutor {
  private readonly engine: QueryEngine;

  constructor(engine: QueryEngine) {
    this.engine = engine;
  }

  /**
   * Execute a query using the unified QueryExecutor interface.
   */
  async execute<T = Record<string, unknown>>(
    executorQuery: ExecutorQuery
  ): Promise<ExecutorResult<T>> {
    // Convert ExecutorQuery to internal Query format
    const converted = toQueryEngineQuery(executorQuery);
    const query: Query = {
      table: converted.table,
      projection: converted.projection,
      predicates: converted.predicates?.map(p => ({
        column: p.column,
        operator: p.operator as Query['predicates'] extends (infer U)[] | undefined
          ? U extends { operator: infer O } ? O : never : never,
        value: p.value as Query['predicates'] extends (infer U)[] | undefined
          ? U extends { value: infer V } ? V : never : never,
        not: p.not,
      })),
      groupBy: converted.groupBy,
      aggregations: converted.aggregations?.map(a => ({
        function: a.function as Query['aggregations'] extends (infer U)[] | undefined
          ? U extends { function: infer F } ? F : never : never,
        column: a.column,
        alias: a.alias,
      })),
      orderBy: converted.orderBy,
      limit: converted.limit,
      offset: converted.offset,
      hints: converted.hints,
    };

    // Execute query using internal method
    const result: EngineQueryResult = await this.engine.execute(query);

    // Convert internal QueryResult to ExecutorResult format
    const executorStats: ExecutorStats = {
      executionTimeMs: result.stats.executionTimeMs,
      rowsScanned: result.stats.rowsScanned,
      rowsReturned: result.stats.rowsMatched,
      bytesRead: result.stats.bytesRead,
      cacheHitRatio: result.stats.cacheHitRatio,
      // Additional stats from query engine
      planningTimeMs: result.stats.planningTimeMs,
      ioTimeMs: result.stats.ioTimeMs,
      partitionsScanned: result.stats.partitionsScanned,
      partitionsPruned: result.stats.partitionsPruned,
      zoneMapEffectiveness: result.stats.zoneMapEffectiveness,
      bloomFilterChecks: result.stats.bloomFilterChecks,
      bloomFilterHits: result.stats.bloomFilterHits,
      peakMemoryBytes: result.stats.peakMemoryBytes,
    };

    return {
      rows: result.rows as T[],
      totalRowCount: result.totalRowCount,
      hasMore: result.hasMore,
      stats: executorStats,
    };
  }

  /**
   * Explain the execution plan for a query without executing it.
   */
  async explain(executorQuery: ExecutorQuery): Promise<ExecutorPlan> {
    // Convert ExecutorQuery to internal Query format
    const converted = toQueryEngineQuery(executorQuery);
    const query: Query = {
      table: converted.table,
      projection: converted.projection,
      predicates: converted.predicates?.map(p => ({
        column: p.column,
        operator: p.operator as Query['predicates'] extends (infer U)[] | undefined
          ? U extends { operator: infer O } ? O : never : never,
        value: p.value as Query['predicates'] extends (infer U)[] | undefined
          ? U extends { value: infer V } ? V : never : never,
        not: p.not,
      })),
      groupBy: converted.groupBy,
      aggregations: converted.aggregations?.map(a => ({
        function: a.function as Query['aggregations'] extends (infer U)[] | undefined
          ? U extends { function: infer F } ? F : never : never,
        column: a.column,
        alias: a.alias,
      })),
      orderBy: converted.orderBy,
      limit: converted.limit,
      offset: converted.offset,
      hints: converted.hints,
    };

    // Get plan from internal method
    const plan: QueryPlan = await this.engine.plan(query);

    return {
      planId: plan.planId,
      query: executorQuery,
      estimatedCost: {
        rowsToScan: plan.estimatedCost.rowsToScan,
        bytesToRead: plan.estimatedCost.bytesToRead,
        outputRows: plan.estimatedCost.outputRows,
        totalCost: plan.estimatedCost.totalCost,
      },
      createdAt: plan.createdAt,
      description: `Query plan for "${executorQuery.table}" using ${plan.usesZoneMaps ? 'zone maps' : 'full scan'}`,
      planTree: plan.rootOperator,
      partitionsSelected: plan.selectedPartitions.length,
      partitionsPruned: plan.prunedPartitions.length,
      usesZoneMaps: plan.usesZoneMaps,
      usesBloomFilters: plan.usesBloomFilters,
    };
  }

  /**
   * Execute a query and stream results.
   */
  async executeStream<T = Record<string, unknown>>(
    executorQuery: ExecutorQuery
  ): Promise<StreamingExecutorResult<T>> {
    // Convert ExecutorQuery to internal Query format
    const converted = toQueryEngineQuery(executorQuery);
    const query: Query = {
      table: converted.table,
      projection: converted.projection,
      predicates: converted.predicates?.map(p => ({
        column: p.column,
        operator: p.operator as Query['predicates'] extends (infer U)[] | undefined
          ? U extends { operator: infer O } ? O : never : never,
        value: p.value as Query['predicates'] extends (infer U)[] | undefined
          ? U extends { value: infer V } ? V : never : never,
        not: p.not,
      })),
      groupBy: converted.groupBy,
      aggregations: converted.aggregations?.map(a => ({
        function: a.function as Query['aggregations'] extends (infer U)[] | undefined
          ? U extends { function: infer F } ? F : never : never,
        column: a.column,
        alias: a.alias,
      })),
      orderBy: converted.orderBy,
      limit: converted.limit,
      offset: converted.offset,
      hints: converted.hints,
    };

    // Get streaming result from internal method
    const streamResult = await this.engine.executeStream<T>(query);

    return {
      rows: streamResult.rows,
      async getStats(): Promise<ExecutorStats> {
        const stats: EngineQueryStats = await streamResult.getStats();
        return {
          executionTimeMs: stats.executionTimeMs,
          rowsScanned: stats.rowsScanned,
          rowsReturned: stats.rowsMatched,
          bytesRead: stats.bytesRead,
          cacheHitRatio: stats.cacheHitRatio,
        };
      },
      cancel: streamResult.cancel,
      isRunning: streamResult.isRunning,
    };
  }

  /**
   * Get cache statistics in the unified ExecutorCacheStats format.
   */
  getCacheStats(): ExecutorCacheStats {
    const stats = this.engine.getCacheStats();
    return {
      hits: stats.hits,
      misses: stats.misses,
      bytesFromCache: stats.bytesFromCache,
      bytesFromStorage: stats.bytesFromR2,
      hitRatio: stats.hitRatio,
    };
  }

  /**
   * Clear the query cache.
   */
  async clearCache(): Promise<void> {
    await this.engine.clearCache();
  }

  /**
   * Invalidate specific cache entries.
   */
  async invalidateCache(paths: string[]): Promise<void> {
    await this.engine.invalidateCache(paths);
  }
}

/**
 * Create a QueryExecutor adapter from a QueryEngineConfig.
 *
 * This is a convenience function that creates both the QueryEngine
 * and wraps it in a QueryExecutorAdapter.
 *
 * @example
 * ```typescript
 * import { createQueryExecutor, type QueryExecutor } from '@evodb/query';
 *
 * const executor: QueryExecutor = createQueryExecutor({ bucket: env.R2_BUCKET });
 * const result = await executor.execute({ table: 'users', limit: 10 });
 * ```
 */
export function createQueryExecutor(config: QueryEngineConfig): QueryExecutorAdapter {
  const engine = new QueryEngine(config);
  return new QueryExecutorAdapter(engine);
}

// =============================================================================
// Simple Query Engine Exports (formerly @evodb/reader)
// =============================================================================

export {
  // Main class
  SimpleQueryEngine,
  // Factory function
  createSimpleQueryEngine,
  // Cache tier
  SimpleCacheTier,
  // Validation utilities
  validateBlockSize,
  validateBlockData,
  parseAndValidateBlockData,
  validateManifest,
  validateTableMetadata,
  // Error classes
  BlockSizeValidationError,
  BlockDataValidationError,
  ManifestValidationError,
  // Error codes (enums)
  BlockSizeValidationErrorCode,
  BlockDataValidationErrorCode,
  ManifestValidationErrorCode,
  // Constants
  DEFAULT_MAX_BLOCK_SIZE,
} from './simple-engine.js';

export type {
  // Query types
  SimpleQueryRequest,
  SimpleQueryResult,
  SimpleQueryStats,
  SimpleFilterPredicate,
  SimpleFilterOperator,
  SimpleSortSpec,
  SimpleSortDirection,
  SimpleAggregateSpec,
  SimpleAggregateFunction,
  // Block types
  SimpleBlockScanRequest,
  SimpleBlockScanResult,
  BlockData,
  BlockDataValidationResult,
  // Table types
  SimpleTableMetadata,
  SimpleColumnSchema,
  SimpleColumnType,
  // Config types
  SimpleQueryConfig,
  SimpleCacheTierConfig,
  SimpleCacheStats,
  // R2 types (inline)
  SimpleR2Bucket,
  SimpleR2Object,
  SimpleR2ListOptions,
  SimpleR2Objects,
  // Manifest type
  ValidatedManifest,
} from './simple-engine.js';

// =============================================================================
// Backward Compatibility Aliases (for migration from @evodb/reader)
// =============================================================================

// Re-export SimpleQueryEngine as QueryEngine alias for @evodb/reader compatibility
// Note: The full QueryEngine is also exported above, so importing needs to be explicit
import { SimpleQueryEngine } from './simple-engine.js';
import type {
  SimpleQueryConfig,
  SimpleQueryRequest,
  SimpleQueryResult,
  SimpleCacheTierConfig,
} from './simple-engine.js';

/**
 * @deprecated Use SimpleQueryEngine instead for simple mode queries.
 * This alias is provided for backward compatibility with @evodb/reader.
 */
export { SimpleQueryEngine as ReaderQueryEngine };

/**
 * @deprecated Use SimpleQueryConfig instead.
 * This alias is provided for backward compatibility with @evodb/reader.
 */
export type ReaderConfig = SimpleQueryConfig;

/**
 * @deprecated Use SimpleQueryRequest instead.
 * This alias is provided for backward compatibility with @evodb/reader.
 */
export type QueryRequest = SimpleQueryRequest;

/**
 * @deprecated Use SimpleQueryResult instead.
 * This alias is provided for backward compatibility with @evodb/reader.
 */
export type ReaderQueryResult = SimpleQueryResult;

/**
 * @deprecated Use SimpleCacheTierConfig instead.
 * This alias is provided for backward compatibility with @evodb/reader.
 */
export type CacheTierConfig = SimpleCacheTierConfig;

// =============================================================================
// Unified Query Engine Exports (Recommended for new code)
// =============================================================================

export {
  // Main unified engine class
  UnifiedQueryEngine,
  // Factory functions
  createUnifiedQueryEngine,
  createSimpleUnifiedEngine,
  createFullUnifiedEngine,
} from './unified-engine.js';

export type {
  // Configuration types
  QueryEngineMode,
  UnifiedQueryEngineConfig,
  // Simple mode types (re-exported for convenience with Unified prefix)
  SimpleQueryRequest as UnifiedSimpleQueryRequest,
  SimpleQueryResult as UnifiedSimpleQueryResult,
  SimpleQueryStats as UnifiedSimpleQueryStats,
  SimpleFilterPredicate as UnifiedSimpleFilterPredicate,
  SimpleFilterOperator as UnifiedSimpleFilterOperator,
  SimpleSortSpec as UnifiedSimpleSortSpec,
  SimpleAggregateSpec as UnifiedSimpleAggregateSpec,
  SimpleAggregateFunction as UnifiedSimpleAggregateFunction,
} from './unified-engine.js';

// =============================================================================
// Type-Safe Query Builder Exports
// =============================================================================

export {
  // Query Builder class
  QueryBuilder,
  // Factory functions
  createQueryBuilder,
  createUntypedQueryBuilder,
  // Schema helpers
  defineSchema,
  mergeSchemas,
} from './query-builder.js';

export type {
  // Schema types
  ColumnType,
  SchemaDefinition,
  ColumnNames,
  ColumnsOfType,
  ColumnRuntimeType,
  InferRowType,
  // Operator types
  StringOperators,
  NumericOperators,
  BooleanOperators,
  TimestampOperators,
  OperatorsForType,
  // Typed query components
  TypedPredicate,
  TypedAggregation,
  TypedOrderBy,
  TypedProjection,
  TypedQuery,
} from './query-builder.js';
