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
