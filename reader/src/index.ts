/**
 * @evodb/reader - DEPRECATED
 *
 * This package has been merged into @evodb/query.
 * Please update your imports to use @evodb/query instead.
 *
 * Migration guide:
 * - QueryEngine -> SimpleQueryEngine (from @evodb/query)
 * - ReaderConfig -> SimpleQueryConfig
 * - QueryRequest -> SimpleQueryRequest
 * - QueryResult -> SimpleQueryResult
 * - All validation utilities are available in @evodb/query
 *
 * @deprecated Use @evodb/query instead. This package re-exports for backward compatibility.
 *
 * @example
 * ```typescript
 * // Before (deprecated):
 * import { QueryEngine, type ReaderConfig } from '@evodb/reader';
 *
 * // After (recommended):
 * import { SimpleQueryEngine, type SimpleQueryConfig } from '@evodb/query';
 * ```
 */

// Re-export everything from @evodb/query for backward compatibility
export {
  // Main class (aliased for compatibility)
  SimpleQueryEngine as QueryEngine,
  ReaderQueryEngine,
  // Factory function
  createSimpleQueryEngine as createQueryEngine,
  // Cache tier
  SimpleCacheTier as CacheTier,
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
  // QueryExecutor adapter
  QueryExecutorAdapter,
  createQueryExecutor,
} from '@evodb/query';

// Re-export types with backward compatible names
export type {
  // Simple query types (aliased for compatibility)
  SimpleQueryRequest as QueryRequest,
  SimpleQueryResult as QueryResult,
  ReaderQueryResult,
  SimpleQueryStats as QueryStats,
  SimpleFilterPredicate as FilterPredicate,
  SimpleFilterOperator as FilterOperator,
  SimpleSortSpec as SortSpec,
  SimpleSortDirection as SortDirection,
  SimpleAggregateSpec as AggregateSpec,
  SimpleAggregateFunction as AggregateFunction,
  // Block types
  SimpleBlockScanRequest as BlockScanRequest,
  SimpleBlockScanResult as BlockScanResult,
  BlockData,
  BlockDataValidationResult,
  // Table types
  SimpleTableMetadata as TableMetadata,
  SimpleColumnSchema as ColumnSchema,
  SimpleColumnType as ColumnType,
  // Config types
  SimpleQueryConfig as ReaderConfig,
  SimpleCacheTierConfig as CacheTierConfig,
  SimpleCacheStats as CacheStats,
  // R2 types
  SimpleR2Bucket as R2Bucket,
  SimpleR2Object as R2Object,
  SimpleR2ListOptions as R2ListOptions,
  SimpleR2Objects as R2Objects,
  // Manifest type
  ValidatedManifest,
  // QueryExecutor types
  QueryExecutor,
  CacheableQueryExecutor,
  ExecutorQuery,
  ExecutorResult,
  ExecutorStats,
  ExecutorPlan,
  ExecutorCost,
  ExecutorCacheStats,
} from '@evodb/query';

// Additional backward compatibility alias
export type ReaderEnv = {
  R2_BUCKET?: unknown;
  CACHE_PREFIX?: string;
  CACHE_TTL_SECONDS?: string;
};

/**
 * @deprecated Use SimpleQueryEngine from @evodb/query instead.
 */
console.warn(
  '[@evodb/reader] This package is deprecated. Please migrate to @evodb/query. ' +
  'See migration guide: https://github.com/evodb/evodb/blob/main/MIGRATION.md'
);
