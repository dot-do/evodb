/**
 * @evodb/core - Shared Query Utilities
 *
 * Common query operations extracted from various packages for reuse:
 * - Projection handling (extracting/transforming columns)
 * - Row transformation utilities
 * - Zone map pruning helpers
 * - Batch filtering operations
 *
 * This module complements query-ops.ts which provides:
 * - Filter evaluation
 * - Sorting
 * - Aggregation
 * - Value comparison
 *
 * @module query-utils
 */

import {
  getNestedValue,
  compareValues,
  evaluateFilter,
  type FilterPredicate,
} from './query-ops.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Column statistics for zone map pruning
 */
export interface ColumnStats {
  /** Minimum value in the partition */
  min: unknown;
  /** Maximum value in the partition */
  max: unknown;
  /** Null count (for null-aware filtering) */
  nullCount: number;
  /** Distinct value count estimate (optional) */
  distinctCount?: number;
}

/**
 * Zone map for a partition/block containing column statistics
 */
export interface ZoneMap {
  /** Column statistics by column name */
  columns: Record<string, ColumnStats>;
}

/**
 * Projection specification
 */
export interface ProjectionSpec {
  /** Columns to include */
  columns: string[];
  /** Whether to include row metadata fields (starting with _) */
  includeMetadata?: boolean;
  /** Optional column aliases: maps source column to output name */
  aliases?: Record<string, string>;
}

/**
 * Result of projection application
 */
export interface ProjectedRow<T = unknown> {
  /** Projected row data */
  data: Record<string, T>;
  /** Original row (if preserveOriginal was specified) */
  original?: Record<string, unknown>;
}

// =============================================================================
// Projection Handling
// =============================================================================

/**
 * Apply projection to a single row, extracting only specified columns.
 *
 * This is the canonical implementation for column projection used across
 * @evodb packages. Supports nested paths via dot notation.
 *
 * @param row - Source row with all columns
 * @param columns - Column names/paths to extract
 * @param aliases - Optional aliases mapping source column to output name
 * @returns New object with only projected columns
 *
 * @example
 * // Simple projection
 * applyProjection({ id: 1, name: 'Alice', email: 'alice@example.com' }, ['id', 'name'])
 * // => { id: 1, name: 'Alice' }
 *
 * @example
 * // With aliases
 * applyProjection({ user_name: 'Bob' }, ['user_name'], { user_name: 'name' })
 * // => { name: 'Bob' }
 *
 * @example
 * // Nested paths
 * applyProjection({ user: { profile: { name: 'Carol' } } }, ['user.profile.name'])
 * // => { 'user.profile.name': 'Carol' }
 */
export function applyProjection(
  row: Record<string, unknown>,
  columns: string[],
  aliases?: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const column of columns) {
    const value = getNestedValue(row, column);
    const outputKey = aliases?.[column] ?? column;
    result[outputKey] = value;
  }

  return result;
}

/**
 * Apply projection to multiple rows efficiently.
 *
 * @param rows - Source rows
 * @param columns - Column names/paths to extract
 * @param aliases - Optional aliases
 * @returns Array of projected rows
 */
export function applyProjectionBatch(
  rows: Record<string, unknown>[],
  columns: string[],
  aliases?: Record<string, string>
): Record<string, unknown>[] {
  return rows.map(row => applyProjection(row, columns, aliases));
}

/**
 * Apply projection spec to a row.
 *
 * @param row - Source row
 * @param spec - Projection specification
 * @returns Projected row
 */
export function applyProjectionSpec(
  row: Record<string, unknown>,
  spec: ProjectionSpec
): Record<string, unknown> {
  const columns = spec.includeMetadata
    ? spec.columns
    : spec.columns.filter(c => !c.startsWith('_'));

  return applyProjection(row, columns, spec.aliases);
}

/**
 * Get all column names from a row, optionally filtering metadata columns.
 *
 * @param row - Source row
 * @param includeMetadata - Whether to include columns starting with _
 * @returns Array of column names
 */
export function getColumnNames(
  row: Record<string, unknown>,
  includeMetadata = false
): string[] {
  const keys = Object.keys(row);
  if (includeMetadata) {
    return keys;
  }
  return keys.filter(k => !k.startsWith('_'));
}

// =============================================================================
// Zone Map Pruning
// =============================================================================

/**
 * Check if a filter predicate can be satisfied by a zone map.
 *
 * Returns true if the partition MAY contain matching rows based on the
 * column statistics. Returns false only if we can definitively prove
 * no rows will match (enabling safe partition pruning).
 *
 * This is a conservative implementation - when in doubt, returns true
 * to avoid incorrectly pruning partitions that might have matches.
 *
 * @param zoneMap - Zone map with column statistics
 * @param filter - Filter predicate to check
 * @returns true if partition may contain matches, false if definitely no matches
 *
 * @example
 * const zoneMap = { columns: { age: { min: 20, max: 50, nullCount: 0 } } };
 * canSatisfyFilter(zoneMap, { column: 'age', operator: 'eq', value: 30 }) // true
 * canSatisfyFilter(zoneMap, { column: 'age', operator: 'eq', value: 100 }) // false
 * canSatisfyFilter(zoneMap, { column: 'age', operator: 'gt', value: 60 }) // false
 */
export function canSatisfyFilter(
  zoneMap: ZoneMap,
  filter: FilterPredicate
): boolean {
  const stats = zoneMap.columns[filter.column];

  // If no stats for this column, conservatively return true
  if (!stats) {
    return true;
  }

  const { min, max, nullCount } = stats;

  // Handle null checks first
  if (filter.operator === 'isNull') {
    return nullCount > 0;
  }

  if (filter.operator === 'isNotNull') {
    // Check if there are any non-null values
    const totalRows = stats.distinctCount ?? 1;
    return totalRows > nullCount;
  }

  // If min or max is undefined, we can't prune
  if (min === undefined || max === undefined) {
    return true;
  }

  const value = filter.value;

  switch (filter.operator) {
    case 'eq':
      // Value must be within [min, max] range
      return compareValues(value, min) >= 0 && compareValues(value, max) <= 0;

    case 'ne':
      // Can only prune if all values in partition equal the filter value
      // (min === max === value)
      if (compareValues(min, max) === 0 && compareValues(min, value) === 0) {
        return false;
      }
      return true;

    case 'gt':
      // Partition matches if max > value
      return compareValues(max, value) > 0;

    case 'gte':
    case 'ge':
      // Partition matches if max >= value
      return compareValues(max, value) >= 0;

    case 'lt':
      // Partition matches if min < value
      return compareValues(min, value) < 0;

    case 'lte':
    case 'le':
      // Partition matches if min <= value
      return compareValues(min, value) <= 0;

    case 'between': {
      // Check for overlap between [min, max] and [lowerBound, upperBound]
      const lowerBound = filter.lowerBound;
      const upperBound = filter.upperBound;

      if (lowerBound === undefined || upperBound === undefined) {
        // Try alternative format: value = [lower, upper]
        if (Array.isArray(value) && value.length === 2) {
          const [lo, hi] = value;
          // No overlap if max < lo or min > hi
          return !(compareValues(max, lo) < 0 || compareValues(min, hi) > 0);
        }
        return true;
      }

      // No overlap if max < lowerBound or min > upperBound
      return !(compareValues(max, lowerBound) < 0 || compareValues(min, upperBound) > 0);
    }

    case 'in': {
      // Check if any value in the list is within [min, max]
      const values = filter.values ?? (Array.isArray(value) ? value : []);
      return values.some(
        v => compareValues(v, min) >= 0 && compareValues(v, max) <= 0
      );
    }

    case 'notIn': {
      // Cannot effectively prune with notIn - always return true
      return true;
    }

    case 'like': {
      // LIKE pruning is complex - only prune for simple prefix patterns
      // For now, conservatively return true
      return true;
    }

    default:
      // Unknown operator - conservatively return true
      return true;
  }
}

/**
 * Check if a zone map can satisfy all filters (AND logic).
 *
 * @param zoneMap - Zone map with column statistics
 * @param filters - Array of filter predicates
 * @returns true if partition may contain matches for ALL filters
 */
export function canSatisfyAllFilters(
  zoneMap: ZoneMap,
  filters: FilterPredicate[]
): boolean {
  if (!filters || filters.length === 0) {
    return true;
  }

  for (const filter of filters) {
    if (!canSatisfyFilter(zoneMap, filter)) {
      return false;
    }
  }

  return true;
}

/**
 * Prune partitions based on zone maps and filters.
 *
 * @param partitions - Array of partitions with zone maps
 * @param filters - Filter predicates
 * @returns Partitions that may contain matching rows
 */
export function prunePartitionsByZoneMap<T extends { zoneMap: ZoneMap }>(
  partitions: T[],
  filters: FilterPredicate[]
): T[] {
  if (!filters || filters.length === 0) {
    return partitions;
  }

  return partitions.filter(p => canSatisfyAllFilters(p.zoneMap, filters));
}

// =============================================================================
// Batch Filtering
// =============================================================================

/**
 * Filter rows in batches for memory efficiency with large datasets.
 *
 * Processes rows in chunks to allow garbage collection between batches
 * and provides progress tracking via callback.
 *
 * @param rows - Source rows to filter
 * @param predicate - Filter function returning true for rows to keep
 * @param options - Batch processing options
 * @returns Filtered rows
 *
 * @example
 * const result = await filterRowsBatched(
 *   largeDataset,
 *   row => row.status === 'active',
 *   {
 *     batchSize: 10000,
 *     onProgress: (processed, total) => console.log(`${processed}/${total}`)
 *   }
 * );
 */
export async function filterRowsBatched<T>(
  rows: T[],
  predicate: (row: T) => boolean,
  options: {
    /** Number of rows to process per batch (default: 10000) */
    batchSize?: number;
    /** Progress callback */
    onProgress?: (processed: number, total: number) => void;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
  } = {}
): Promise<T[]> {
  const { batchSize = 10000, onProgress, signal } = options;
  const result: T[] = [];
  const total = rows.length;

  for (let i = 0; i < total; i += batchSize) {
    // Check for cancellation
    if (signal?.aborted) {
      throw new Error('Filter operation cancelled');
    }

    const batch = rows.slice(i, i + batchSize);
    const filtered = batch.filter(predicate);
    result.push(...filtered);

    // Report progress
    const processed = Math.min(i + batchSize, total);
    onProgress?.(processed, total);

    // Yield to event loop between batches
    if (i + batchSize < total) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return result;
}

/**
 * Apply filters to rows using the shared filter evaluation.
 *
 * @param rows - Source rows
 * @param filters - Filter predicates
 * @returns Filtered rows
 */
export function filterRows(
  rows: Record<string, unknown>[],
  filters: FilterPredicate[]
): Record<string, unknown>[] {
  if (!filters || filters.length === 0) {
    return rows;
  }

  return rows.filter(row => {
    for (const filter of filters) {
      const value = getNestedValue(row, filter.column);
      if (!evaluateFilter(value, filter)) {
        return false;
      }
    }
    return true;
  });
}

// =============================================================================
// Row Transformation
// =============================================================================

/**
 * Convert columnar data (column arrays) to row format.
 *
 * Takes a map of column names to value arrays and converts to an array
 * of row objects. All column arrays must have the same length.
 *
 * @param columnarData - Map of column name to value array
 * @returns Array of row objects
 *
 * @example
 * columnarToRows({
 *   id: [1, 2, 3],
 *   name: ['Alice', 'Bob', 'Carol']
 * })
 * // => [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Carol' }]
 */
export function columnarToRows(
  columnarData: Record<string, unknown[]>
): Record<string, unknown>[] {
  const columns = Object.keys(columnarData);
  if (columns.length === 0) {
    return [];
  }

  const rowCount = columnarData[columns[0]].length;
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, unknown> = {};
    for (const column of columns) {
      row[column] = columnarData[column][i];
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Convert row data to columnar format.
 *
 * @param rows - Array of row objects
 * @param columns - Columns to include (undefined = all columns from first row)
 * @returns Map of column name to value array
 *
 * @example
 * rowsToColumnar([
 *   { id: 1, name: 'Alice' },
 *   { id: 2, name: 'Bob' }
 * ])
 * // => { id: [1, 2], name: ['Alice', 'Bob'] }
 */
export function rowsToColumnar(
  rows: Record<string, unknown>[],
  columns?: string[]
): Record<string, unknown[]> {
  if (rows.length === 0) {
    return {};
  }

  const cols = columns ?? Object.keys(rows[0]);
  const result: Record<string, unknown[]> = {};

  for (const col of cols) {
    result[col] = [];
  }

  for (const row of rows) {
    for (const col of cols) {
      result[col].push(row[col]);
    }
  }

  return result;
}

/**
 * Extract a single column from rows as an array.
 *
 * @param rows - Source rows
 * @param column - Column name/path to extract
 * @returns Array of values for that column
 */
export function extractColumn<T = unknown>(
  rows: Record<string, unknown>[],
  column: string
): T[] {
  return rows.map(row => getNestedValue(row, column) as T);
}

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * All-in-one query utilities namespace
 */
export const queryUtils = {
  // Projection
  applyProjection,
  applyProjectionBatch,
  applyProjectionSpec,
  getColumnNames,

  // Zone map pruning
  canSatisfyFilter,
  canSatisfyAllFilters,
  prunePartitionsByZoneMap,

  // Filtering
  filterRows,
  filterRowsBatched,

  // Row transformation
  columnarToRows,
  rowsToColumnar,
  extractColumn,
};
