/**
 * @evodb/core/query - Query operations
 *
 * This submodule exports shared query operations including:
 * - Filter evaluation
 * - Sorting
 * - Aggregation
 * - QueryExecutor interface (unified interface for cross-package compatibility)
 * - Query engine auto-selection
 *
 * ## Unified Query Types
 *
 * For cross-package compatibility, use the unified `Executor*` types:
 * - `ExecutorQuery` - Unified query specification
 * - `ExecutorResult` - Unified query result
 * - `ExecutorStats` - Unified execution statistics
 * - `ExecutorPlan` - Unified query plan
 *
 * Package-specific types (internal format):
 * - `@evodb/reader`: `ReaderQueryResult`, `ReaderQueryStats`
 * - `@evodb/query`: `EngineQueryResult`, `EngineQueryStats`
 *
 * @example
 * ```typescript
 * // Using unified types for cross-package compatibility
 * import type { QueryExecutor, ExecutorQuery, ExecutorResult } from '@evodb/core';
 *
 * async function runQuery(executor: QueryExecutor, query: ExecutorQuery): Promise<ExecutorResult> {
 *   return await executor.execute(query);
 * }
 * ```
 *
 * @module query
 */

// Query operations
export {
  // Types
  type FilterOperator,
  type FilterPredicate,
  type SortDirection,
  type SortSpec,
  type AggregateFunction,
  type AggregateSpec,
  type FilterEvaluator,
  type AggregationEngine,
  type ResultProcessor,
  // Filter operations
  evaluateFilter,
  evaluateFilters,
  createFilterEvaluator,
  // Sort operations
  sortRows,
  limitRows,
  compareForSort,
  compareValues,
  createResultProcessor,
  // Aggregation operations
  computeAggregate,
  computeAggregations,
  createAggregationEngine,
  // Utilities
  getNestedValue,
  setNestedValue,
  likePatternToRegex,
  // Column validation
  validateColumnName,
  // All-in-one namespace
  queryOps,
} from '../query-ops.js';

// QueryExecutor interface
export {
  // Core interface
  type QueryExecutor,
  // Extended interfaces
  type StreamingQueryExecutor,
  type CacheableQueryExecutor,
  // Query types
  type ExecutorQuery,
  type ExecutorPredicate,
  type ExecutorAggregation,
  type ExecutorOrderBy,
  // Result types
  type ExecutorResult,
  type ExecutorStats,
  type StreamingExecutorResult,
  // Plan types
  type ExecutorPlan,
  type ExecutorCost,
  // Cache types
  type ExecutorCacheStats,
  // Type guards
  isStreamingExecutor,
  isCacheableExecutor,
  // Conversion utilities
  toReaderQueryRequest,
  toQueryEngineQuery,
} from '../query-executor.js';

// Query Engine Auto-Selection
export {
  // Types
  QueryComplexity,
  EngineType,
  type QueryComplexityAnalysis,
  type EngineSelectionResult,
  // Core functions
  analyzeQueryComplexity,
  selectQueryEngine,
  // Utility functions
  wouldBenefitFromZoneMaps,
  wouldBenefitFromBloomFilters,
  getSelectionDescription,
} from '../query-engine-selector.js';
