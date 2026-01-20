/**
 * @evodb/core/query - Query operations
 *
 * This submodule exports shared query operations including:
 * - Filter evaluation
 * - Sorting
 * - Aggregation
 * - QueryExecutor interface
 * - Query engine auto-selection
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
