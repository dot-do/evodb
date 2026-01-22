/**
 * Partition specification and pruning
 * Enables efficient file filtering based on partition values
 */

import type {
  PartitionSpec,
  PartitionField,
  PartitionTransform,
  PartitionValue,
  PartitionFilter,
  ManifestFile,
  ColumnStats,
  ColumnFilter,
  QueryFilter,
} from './types.js';

import { PARTITION_INDEX_THRESHOLD } from '@evodb/core';

// =============================================================================
// Exhaustiveness Check Helper
// =============================================================================

/**
 * Assert that a value is of type `never` at compile time.
 * Used in switch statements to ensure all cases of a discriminated union are handled.
 */
function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Safely parse a value to a number, returning null for invalid values.
 * Handles NaN, empty strings, and non-numeric strings gracefully.
 */
function safeParseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = String(value).trim();
  if (trimmed === '') return null;

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Log a warning for unknown filter types (only in development).
 * In production, silently returns true to avoid breaking queries.
 */
function warnUnknownFilterType(_filterType: string, _context: string): void {
  // Unknown filter types are silently ignored in production
  // to avoid breaking queries. The filter will pass all values.
  // Version mismatch detection should be handled at schema validation layer.
  // Enable structured logging via @evodb/observability for production monitoring.
}

// =============================================================================
// Partition Spec Creation
// =============================================================================

/**
 * Create a new partition specification
 */
export function createPartitionSpec(
  fields: Omit<PartitionField, 'fieldId'>[],
  specId = 0
): PartitionSpec {
  return {
    specId,
    fields: fields.map((f, idx) => ({
      ...f,
      fieldId: idx,
    })),
  };
}

/**
 * Create identity partition field
 */
export function identityField(sourceColumn: string, name?: string): Omit<PartitionField, 'fieldId'> {
  return {
    sourceColumn,
    transform: { type: 'identity' },
    name: name ?? sourceColumn,
  };
}

/**
 * Create year partition field
 */
export function yearField(sourceColumn: string, name = 'year'): Omit<PartitionField, 'fieldId'> {
  return {
    sourceColumn,
    transform: { type: 'year' },
    name,
  };
}

/**
 * Create month partition field
 */
export function monthField(sourceColumn: string, name = 'month'): Omit<PartitionField, 'fieldId'> {
  return {
    sourceColumn,
    transform: { type: 'month' },
    name,
  };
}

/**
 * Create day partition field
 */
export function dayField(sourceColumn: string, name = 'day'): Omit<PartitionField, 'fieldId'> {
  return {
    sourceColumn,
    transform: { type: 'day' },
    name,
  };
}

/**
 * Create hour partition field
 */
export function hourField(sourceColumn: string, name = 'hour'): Omit<PartitionField, 'fieldId'> {
  return {
    sourceColumn,
    transform: { type: 'hour' },
    name,
  };
}

/**
 * Create bucket partition field
 */
export function bucketField(
  sourceColumn: string,
  numBuckets: number,
  name?: string
): Omit<PartitionField, 'fieldId'> {
  return {
    sourceColumn,
    transform: { type: 'bucket', numBuckets },
    name: name ?? `${sourceColumn}_bucket`,
  };
}

/**
 * Create truncate partition field
 */
export function truncateField(
  sourceColumn: string,
  width: number,
  name?: string
): Omit<PartitionField, 'fieldId'> {
  return {
    sourceColumn,
    transform: { type: 'truncate', width },
    name: name ?? sourceColumn,
  };
}

// =============================================================================
// Partition Value Computation
// =============================================================================

/**
 * Compute partition values from a row
 */
export function computePartitionValues(
  row: Record<string, unknown>,
  spec: PartitionSpec
): PartitionValue[] {
  return spec.fields.map(field => ({
    name: field.name,
    value: applyTransform(getNestedValue(row, field.sourceColumn), field.transform),
  }));
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let value: unknown = obj;

  for (const part of parts) {
    if (value == null || typeof value !== 'object') return null;
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

/**
 * Apply partition transform to a value
 */
function applyTransform(
  value: unknown,
  transform: PartitionTransform
): string | number | null {
  if (value == null) return null;

  switch (transform.type) {
    case 'identity':
      return typeof value === 'number' ? value : String(value);

    case 'year':
      return extractYear(value);

    case 'month':
      return extractMonth(value);

    case 'day':
      return extractDay(value);

    case 'hour':
      return extractHour(value);

    case 'bucket':
      return computeBucket(value, transform.numBuckets);

    case 'truncate':
      return truncateValue(value, transform.width);

    default:
      return assertNever(transform, `Unhandled partition transform type: ${(transform as PartitionTransform).type}`);
  }
}

/**
 * Extract year from timestamp/date
 */
function extractYear(value: unknown): number | null {
  const date = toDate(value);
  return date ? date.getUTCFullYear() : null;
}

/**
 * Extract month from timestamp/date (1-12)
 */
function extractMonth(value: unknown): number | null {
  const date = toDate(value);
  return date ? date.getUTCMonth() + 1 : null;
}

/**
 * Extract day from timestamp/date (1-31)
 */
function extractDay(value: unknown): number | null {
  const date = toDate(value);
  return date ? date.getUTCDate() : null;
}

/**
 * Extract hour from timestamp (0-23)
 */
function extractHour(value: unknown): number | null {
  const date = toDate(value);
  return date ? date.getUTCHours() : null;
}

/**
 * Convert value to Date
 */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * Compute bucket for hash partitioning
 */
function computeBucket(value: unknown, numBuckets: number): number {
  const hash = simpleHash(String(value));
  return Math.abs(hash) % numBuckets;
}

/**
 * Simple hash function for bucket partitioning
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Truncate value to width
 */
function truncateValue(value: unknown, width: number): string | number | null {
  if (typeof value === 'number') {
    return Math.floor(value / width) * width;
  }
  if (typeof value === 'string') {
    return value.slice(0, width);
  }
  return null;
}

// =============================================================================
// Partition Pruning
// =============================================================================

/**
 * Filter files based on partition values.
 *
 * Edge cases handled:
 * - Empty files array: returns empty array
 * - Empty filters: returns all files unchanged
 * - Files with no partitions: won't match any partition filter
 * - Null/undefined partition values: only match if filter explicitly includes null
 * - Invalid numeric strings: treated as non-matching (NaN handling)
 */
export function pruneByPartition(
  files: ManifestFile[],
  filters: Record<string, PartitionFilter>,
): ManifestFile[] {
  // Handle empty/null files
  if (!files || files.length === 0) return [];

  // Handle empty/null filters - return all files
  if (!filters || Object.keys(filters).length === 0) return files;

  return files.filter(file => matchesPartitionFilters(file.partitions, filters));
}

/**
 * Check if partition values match filters.
 *
 * Edge cases:
 * - Empty partitions array: no partition name will be found, values default to undefined
 * - Missing partition name: value is undefined, treated as null
 */
function matchesPartitionFilters(
  partitions: PartitionValue[],
  filters: Record<string, PartitionFilter>,
): boolean {
  // Handle null/undefined partitions array
  const safePartitions = partitions || [];
  const partitionMap = new Map(safePartitions.map(p => [p.name, p.value]));

  for (const [name, filter] of Object.entries(filters)) {
    const value = partitionMap.get(name);
    if (!matchesPartitionFilter(value, filter)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a single partition value matches a filter.
 *
 * Edge cases handled:
 * - Null/undefined values: only match explicit null in eq/in filters
 * - NaN after parsing: treated as non-matching for numeric comparisons
 * - Unknown filter types: logged as warning, returns true (no pruning)
 */
function matchesPartitionFilter(
  value: string | number | null | undefined,
  filter: PartitionFilter,
): boolean {
  // Handle null/undefined values - only match if filter explicitly includes null
  if (value === null || value === undefined) {
    if ('eq' in filter) {
      return filter.eq === null || filter.eq === undefined;
    }
    if ('in' in filter) {
      return filter.in.some(v => v === null || v === undefined);
    }
    return false;
  }

  if ('eq' in filter) {
    return value === filter.eq;
  }

  if ('in' in filter) {
    return filter.in.includes(value);
  }

  if ('between' in filter) {
    const numValue = safeParseNumber(value);
    if (numValue === null) return false;

    const [min, max] = filter.between;
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      warnUnknownFilterType('between with invalid bounds', 'partition');
      return true;
    }
    return numValue >= min && numValue <= max;
  }

  if ('gte' in filter) {
    const numValue = safeParseNumber(value);
    if (numValue === null) return false;

    const gteFilter = filter as { gte: number; lte?: number };
    if (!Number.isFinite(gteFilter.gte)) {
      warnUnknownFilterType('gte with invalid value', 'partition');
      return true;
    }
    if (numValue < gteFilter.gte) return false;
    if (gteFilter.lte !== undefined) {
      if (!Number.isFinite(gteFilter.lte)) {
        warnUnknownFilterType('lte with invalid value', 'partition');
        return true;
      }
      if (numValue > gteFilter.lte) return false;
    }
    return true;
  }

  if ('lte' in filter) {
    const numValue = safeParseNumber(value);
    if (numValue === null) return false;

    const lteFilter = filter as { lte: number; gte?: number };
    if (!Number.isFinite(lteFilter.lte)) {
      warnUnknownFilterType('lte with invalid value', 'partition');
      return true;
    }
    if (numValue > lteFilter.lte) return false;
    if (lteFilter.gte !== undefined) {
      if (!Number.isFinite(lteFilter.gte)) {
        warnUnknownFilterType('gte with invalid value', 'partition');
        return true;
      }
      if (numValue < lteFilter.gte) return false;
    }
    return true;
  }

  // Unknown filter type - warn and don't prune
  warnUnknownFilterType(JSON.stringify(Object.keys(filter)), 'partition');
  return true;
}

// =============================================================================
// Zone Map (Column Stats) Pruning
// =============================================================================

/**
 * Filter files based on column statistics (zone maps).
 *
 * Edge cases handled:
 * - Empty files array: returns empty array
 * - Empty filters: returns all files
 * - Files with missing stats: not pruned (may contain matches)
 * - Files with null columnStats: not pruned
 */
export function pruneByColumnStats(
  files: ManifestFile[],
  filters: Record<string, ColumnFilter>,
): ManifestFile[] {
  // Handle empty/null files
  if (!files || files.length === 0) return [];

  // Handle empty/null filters
  if (!filters || Object.keys(filters).length === 0) return files;

  return files.filter(file => {
    // Handle files with missing or null stats - can't prune without stats
    if (!file.stats || !file.stats.columnStats) {
      return true;
    }
    return matchesColumnFilters(file.stats.columnStats, filters);
  });
}

/**
 * Check if column stats indicate possible matches
 */
function matchesColumnFilters(
  stats: Record<string, ColumnStats>,
  filters: Record<string, ColumnFilter>
): boolean {
  for (const [column, filter] of Object.entries(filters)) {
    const colStats = stats[column];
    if (!colStats) continue; // No stats, can't prune

    if (!statsMatchFilter(colStats, filter)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if column stats could contain matching values.
 *
 * Edge cases handled:
 * - Null/undefined stats: can't prune, returns true
 * - Missing min/max: can't prune for range queries
 * - NaN in comparisons: handled via compareValues
 * - Unknown filter types: logged and returns true (no pruning)
 */
function statsMatchFilter(stats: ColumnStats, filter: ColumnFilter): boolean {
  // Handle null/undefined stats object
  if (!stats) return true;

  const { min, max, nullCount = 0 } = stats;

  // Handle null checks
  if ('isNull' in filter) {
    if (filter.isNull) {
      return nullCount > 0;
    }
    // Looking for non-null values
    const totalRows = stats.distinctCount ?? 1;
    return nullCount < totalRows;
  }

  // Handle eq filter checking for null values (before min/max check)
  if ('eq' in filter) {
    if (filter.eq === null || filter.eq === undefined) {
      return nullCount > 0;
    }
    // Can't prune if no min/max stats for non-null eq filter
    if (min === undefined || max === undefined) return true;
    return compareValues(filter.eq, min) >= 0 && compareValues(filter.eq, max) <= 0;
  }

  // Handle ne filter - can check for null without min/max stats
  if ('ne' in filter) {
    if (filter.ne === null || filter.ne === undefined) {
      // Looking for non-null values: prune if all rows are null
      const totalRows = stats.distinctCount ?? 1;
      return nullCount < totalRows;
    }
    // For non-null ne values, can only prune if we have min/max and all values are the same
    if (min === undefined || max === undefined) return true;
    if (compareValues(min, max) === 0 && compareValues(min, filter.ne) === 0) {
      return false;
    }
    return true;
  }

  // Can't prune range queries if no min/max stats - file may contain matches
  if (min === undefined || max === undefined) return true;

  // Greater than
  if ('gt' in filter) {
    if (filter.gt === null || filter.gt === undefined) return true;
    return compareValues(max, filter.gt) > 0;
  }

  // Greater than or equal
  if ('gte' in filter) {
    if (filter.gte === null || filter.gte === undefined) return true;
    return compareValues(max, filter.gte) >= 0;
  }

  // Less than
  if ('lt' in filter) {
    if (filter.lt === null || filter.lt === undefined) return true;
    return compareValues(min, filter.lt) < 0;
  }

  // Less than or equal
  if ('lte' in filter) {
    if (filter.lte === null || filter.lte === undefined) return true;
    return compareValues(min, filter.lte) <= 0;
  }

  // Between
  if ('between' in filter) {
    const [filterMin, filterMax] = filter.between;
    if (filterMin === null || filterMin === undefined || filterMax === null || filterMax === undefined) {
      return true;
    }
    return compareValues(max, filterMin) >= 0 && compareValues(min, filterMax) <= 0;
  }

  // Unknown filter type - warn and don't prune
  warnUnknownFilterType(JSON.stringify(Object.keys(filter)), 'column');
  return true;
}

/**
 * Compare two values for ordering
 */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;

  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b);
  }

  // Fall back to string comparison
  return String(a).localeCompare(String(b));
}

// =============================================================================
// Combined Pruning
// =============================================================================

/**
 * Apply all filters to prune files.
 *
 * Edge cases handled:
 * - Null/undefined files: returns empty array
 * - Null/undefined filter: returns all files
 * - Empty partitions/columns in filter: skipped
 */
export function pruneFiles(
  files: ManifestFile[],
  filter: QueryFilter,
): ManifestFile[] {
  // Handle null/undefined files
  if (!files || files.length === 0) return [];

  // Handle null/undefined filter
  if (!filter) return files;

  let result = files;

  // Apply partition pruning
  if (filter.partitions && Object.keys(filter.partitions).length > 0) {
    result = pruneByPartition(result, filter.partitions);
  }

  // Apply column stats pruning
  if (filter.columns && Object.keys(filter.columns).length > 0) {
    result = pruneByColumnStats(result, filter.columns);
  }

  return result;
}

/**
 * Estimate selectivity of a filter (0-1)
 */
export function estimateSelectivity(
  files: ManifestFile[],
  filter: QueryFilter
): number {
  if (files.length === 0) return 0;

  const prunedFiles = pruneFiles(files, filter);
  const fileSelectivity = prunedFiles.length / files.length;

  // Rough estimate based on file-level pruning
  // Actual row-level selectivity would require scanning
  return fileSelectivity;
}

// =============================================================================
// Partition Statistics
// =============================================================================

/**
 * Get partition value distribution
 */
export function getPartitionDistribution(
  files: ManifestFile[],
  partitionName: string
): Map<string | number | null, number> {
  const distribution = new Map<string | number | null, number>();

  for (const file of files) {
    const partition = file.partitions.find(p => p.name === partitionName);
    const value = partition?.value ?? null;
    distribution.set(value, (distribution.get(value) ?? 0) + file.stats.rowCount);
  }

  return distribution;
}

/**
 * Get partition range
 */
export function getPartitionRange(
  files: ManifestFile[],
  partitionName: string
): { min: string | number | null; max: string | number | null } | null {
  let min: string | number | null = null;
  let max: string | number | null = null;

  for (const file of files) {
    const partition = file.partitions.find(p => p.name === partitionName);
    if (!partition || partition.value === null) continue;

    const value = partition.value;

    if (min === null || compareValues(value, min) < 0) {
      min = value;
    }
    if (max === null || compareValues(value, max) > 0) {
      max = value;
    }
  }

  if (min === null && max === null) return null;

  return { min, max };
}

// =============================================================================
// Optimized Partition Index
// =============================================================================

/**
 * A pre-built index for efficient O(1) file lookups by partition value.
 *
 * The PartitionIndex builds hash maps for each partition column, enabling
 * constant-time lookups by exact value or efficient range queries using
 * binary search on sorted values.
 *
 * Use this class when:
 * - You have many files (50+) and need to query them repeatedly
 * - You need fast exact-match lookups by partition value
 * - You need efficient range queries on numeric partition columns
 *
 * For small file sets (<50 files), use `pruneFiles()` directly as the
 * overhead of building the index is not worthwhile.
 *
 * @example Basic usage
 * ```typescript
 * import { PartitionIndex, createPartitionIndex } from '@evodb/lakehouse';
 *
 * // Build index from manifest files
 * const index = createPartitionIndex(manifestFiles);
 *
 * // O(1) lookup by exact partition value
 * const files2024 = index.getByValue('year', 2024);
 *
 * // O(k) lookup for multiple values
 * const recentFiles = index.getByValues('month', [11, 12]);
 *
 * // O(log n) range query with binary search
 * const q1Files = index.getByRange('month', 1, 3);
 * ```
 *
 * @example With QueryFilter
 * ```typescript
 * import { pruneFilesOptimized } from '@evodb/lakehouse';
 *
 * // Automatically uses index for large file sets
 * const result = pruneFilesOptimized(manifestFiles, {
 *   partitions: { year: { eq: 2024 }, month: { between: [1, 3] } },
 *   columns: { status: { eq: 'active' } }
 * });
 * ```
 */
export class PartitionIndex {
  private readonly partitionMaps: Map<string, Map<string | number | null, ManifestFile[]>>;
  private readonly sortedValues: Map<string, (string | number)[]>;
  private readonly files: ManifestFile[];

  /**
   * Create a new PartitionIndex from an array of manifest files.
   *
   * The constructor builds two data structures:
   * 1. Hash maps for O(1) exact-value lookups
   * 2. Sorted arrays for O(log n) range queries
   *
   * @param files - Array of ManifestFile objects to index
   *
   * @example
   * ```typescript
   * const index = new PartitionIndex(manifestFiles);
   * // Or use the factory function:
   * const index = createPartitionIndex(manifestFiles);
   * ```
   */
  constructor(files: ManifestFile[]) {
    this.files = files;
    this.partitionMaps = new Map();
    this.sortedValues = new Map();
    this.buildIndex();
  }

  /**
   * Build the partition index
   */
  private buildIndex(): void {
    // First pass: collect all partition names and values
    const valueCollector = new Map<string, Set<string | number | null>>();

    for (const file of this.files) {
      for (const partition of file.partitions) {
        // Initialize partition map if needed
        if (!this.partitionMaps.has(partition.name)) {
          this.partitionMaps.set(partition.name, new Map());
          valueCollector.set(partition.name, new Set());
        }

        const valueMap = this.partitionMaps.get(partition.name);
        const valueSet = valueCollector.get(partition.name);

        if (valueMap && valueSet) {
          if (!valueMap.has(partition.value)) {
            valueMap.set(partition.value, []);
          }
          const files = valueMap.get(partition.value);
          if (files) {
            files.push(file);
          }
          valueSet.add(partition.value);
        }
      }
    }

    // Second pass: sort numeric values for range queries
    for (const [partitionName, values] of valueCollector) {
      const nonNullValues = [...values].filter((v): v is string | number => v !== null);
      nonNullValues.sort((a, b) => compareValues(a, b));
      this.sortedValues.set(partitionName, nonNullValues);
    }
  }

  /**
   * Get files matching an exact partition value.
   *
   * Time Complexity: O(1) average case (hash map lookup)
   *
   * @param partitionName - The name of the partition column to filter on
   * @param value - The exact value to match (can be string, number, or null)
   * @returns Array of ManifestFile objects matching the partition value.
   *          Returns empty array if no files match or partition doesn't exist.
   *
   * @example
   * ```typescript
   * // Get all files for year 2024
   * const files = index.getByValue('year', 2024);
   *
   * // Get files with null partition value
   * const nullFiles = index.getByValue('region', null);
   * ```
   */
  getByValue(partitionName: string, value: string | number | null): ManifestFile[] {
    return this.partitionMaps.get(partitionName)?.get(value) ?? [];
  }

  /**
   * Get files matching any of the given partition values (IN clause semantics).
   *
   * Time Complexity: O(k) where k is the number of values in the input array.
   * Each value lookup is O(1), and results are deduplicated using a Set.
   *
   * @param partitionName - The name of the partition column to filter on
   * @param values - Array of values to match against (OR semantics)
   * @returns Array of unique ManifestFile objects matching any of the values.
   *          Files are deduplicated by path to avoid duplicates.
   *
   * @example
   * ```typescript
   * // Get files for Q4 months (IN clause)
   * const q4Files = index.getByValues('month', [10, 11, 12]);
   *
   * // Get files for specific regions
   * const files = index.getByValues('region', ['us-east', 'us-west']);
   * ```
   */
  getByValues(partitionName: string, values: (string | number | null)[]): ManifestFile[] {
    const valueMap = this.partitionMaps.get(partitionName);
    if (!valueMap) return [];

    const result: ManifestFile[] = [];
    const seen = new Set<string>();

    for (const value of values) {
      const files = valueMap.get(value);
      if (files) {
        for (const file of files) {
          if (!seen.has(file.path)) {
            seen.add(file.path);
            result.push(file);
          }
        }
      }
    }

    return result;
  }

  /**
   * Get files within a numeric range using binary search.
   *
   * Time Complexity: O(log n + m) where n is the number of unique partition values
   * and m is the number of matching files. Binary search finds the range bounds
   * in O(log n), then collects matching files in O(m).
   *
   * @param partitionName - The name of the partition column to filter on
   * @param min - Minimum value (inclusive/exclusive based on `inclusive` param).
   *              Pass null for no lower bound.
   * @param max - Maximum value (inclusive/exclusive based on `inclusive` param).
   *              Pass null for no upper bound.
   * @param inclusive - If true (default), range includes min and max values.
   *                    If false, range excludes min and max values.
   * @returns Array of unique ManifestFile objects within the range.
   *          Files are deduplicated by path.
   *
   * @example
   * ```typescript
   * // Get files for months 1-6 (inclusive)
   * const h1Files = index.getByRange('month', 1, 6);
   *
   * // Get files for year >= 2020
   * const recentFiles = index.getByRange('year', 2020, null);
   *
   * // Get files for month < 6 (exclusive upper bound)
   * const earlyMonths = index.getByRange('month', null, 6, false);
   * ```
   */
  getByRange(
    partitionName: string,
    min: number | null,
    max: number | null,
    inclusive = true
  ): ManifestFile[] {
    const sortedVals = this.sortedValues.get(partitionName);
    const valueMap = this.partitionMaps.get(partitionName);

    if (!sortedVals || !valueMap) return [];

    // Find range bounds using binary search
    let startIdx = 0;
    let endIdx = sortedVals.length - 1;

    if (min !== null) {
      startIdx = this.binarySearchLowerBound(sortedVals, min, inclusive);
    }
    if (max !== null) {
      endIdx = this.binarySearchUpperBound(sortedVals, max, inclusive);
    }

    if (startIdx > endIdx) return [];

    // Collect files in range
    const result: ManifestFile[] = [];
    const seen = new Set<string>();

    for (let i = startIdx; i <= endIdx; i++) {
      const files = valueMap.get(sortedVals[i]);
      if (files) {
        for (const file of files) {
          if (!seen.has(file.path)) {
            seen.add(file.path);
            result.push(file);
          }
        }
      }
    }

    return result;
  }

  /**
   * Binary search for the lower bound index in a sorted array.
   *
   * Finds the smallest index where the value is >= target (inclusive)
   * or > target (exclusive).
   *
   * @param arr - Sorted array of partition values
   * @param target - Target value to search for
   * @param inclusive - If true, find index of first value >= target.
   *                    If false, find index of first value > target.
   * @returns Index of the lower bound (0 to arr.length)
   */
  private binarySearchLowerBound(
    arr: (string | number)[],
    target: number,
    inclusive: boolean
  ): number {
    let left = 0;
    let right = arr.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const cmp = compareValues(arr[mid], target);

      if (inclusive ? cmp < 0 : cmp <= 0) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  /**
   * Binary search for the upper bound index in a sorted array.
   *
   * Finds the largest index where the value is <= target (inclusive)
   * or < target (exclusive).
   *
   * @param arr - Sorted array of partition values
   * @param target - Target value to search for
   * @param inclusive - If true, find index of last value <= target.
   *                    If false, find index of last value < target.
   * @returns Index of the upper bound (-1 to arr.length - 1)
   */
  private binarySearchUpperBound(
    arr: (string | number)[],
    target: number,
    inclusive: boolean
  ): number {
    let left = 0;
    let right = arr.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const cmp = compareValues(arr[mid], target);

      if (inclusive ? cmp <= 0 : cmp < 0) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left - 1;
  }

  /**
   * Get all unique values for a partition column.
   *
   * Useful for discovering the cardinality and distribution of partition values.
   *
   * @param partitionName - The name of the partition column
   * @returns Array of all unique partition values (including null if present).
   *          Returns empty array if the partition doesn't exist.
   *
   * @example
   * ```typescript
   * // Get all years in the dataset
   * const years = index.getUniqueValues('year');
   * console.log(years); // [2022, 2023, 2024]
   *
   * // Get all regions
   * const regions = index.getUniqueValues('region');
   * console.log(regions); // ['us-east', 'us-west', 'eu-west', null]
   * ```
   */
  getUniqueValues(partitionName: string): (string | number | null)[] {
    const valueMap = this.partitionMaps.get(partitionName);
    return valueMap ? [...valueMap.keys()] : [];
  }

  /**
   * Get all files in the index.
   *
   * Returns the original array of files passed to the constructor.
   *
   * @returns Array of all ManifestFile objects in the index
   *
   * @example
   * ```typescript
   * const allFiles = index.getAllFiles();
   * console.log(`Index contains ${allFiles.length} files`);
   * ```
   */
  getAllFiles(): ManifestFile[] {
    return this.files;
  }
}

/**
 * Factory function to create a PartitionIndex from manifest files.
 *
 * This is the recommended way to create a PartitionIndex as it provides
 * a more functional API and makes the code intention clearer.
 *
 * @param files - Array of ManifestFile objects to index
 * @returns A new PartitionIndex instance
 *
 * @example
 * ```typescript
 * import { createPartitionIndex } from '@evodb/lakehouse';
 *
 * const index = createPartitionIndex(manifestFiles);
 * const files2024 = index.getByValue('year', 2024);
 * ```
 */
export function createPartitionIndex(files: ManifestFile[]): PartitionIndex {
  return new PartitionIndex(files);
}

// =============================================================================
// Optimized Combined Pruning
// =============================================================================

/**
 * Optimized file pruning that automatically uses a partition index for large file sets.
 *
 * This function provides the best of both worlds:
 * - For small file sets (<threshold), uses linear scan (lower overhead)
 * - For large file sets (>=threshold), builds a partition index for O(1) lookups
 *
 * The function applies two phases of pruning:
 * 1. Partition pruning: Uses index for O(1) lookups on exact matches, O(log n) for ranges
 * 2. Column stats pruning: Linear scan on the reduced set using zone map statistics
 *
 * Edge cases handled:
 * - Null/undefined files: returns empty array
 * - Null/undefined filter: returns all files
 * - Very large partition counts: index provides O(1) lookup vs O(n) scan
 * - Single partition: index still works correctly
 *
 * @param files - Array of ManifestFile objects to filter
 * @param filter - QueryFilter containing partition and column filters
 * @param indexThreshold - Minimum file count to trigger index creation (default: 50).
 *                         Below this threshold, linear scan is used.
 * @returns Array of ManifestFile objects that match all filter criteria
 *
 * @example Basic usage
 * ```typescript
 * import { pruneFilesOptimized } from '@evodb/lakehouse';
 *
 * // Filter files for Q1 2024 with active status
 * const filtered = pruneFilesOptimized(manifestFiles, {
 *   partitions: {
 *     year: { eq: 2024 },
 *     month: { between: [1, 3] }
 *   },
 *   columns: {
 *     status: { eq: 'active' }
 *   }
 * });
 * ```
 *
 * @example Custom threshold for very large datasets
 * ```typescript
 * // Use index even for smaller file sets in hot paths
 * const filtered = pruneFilesOptimized(manifestFiles, filter, 20);
 * ```
 *
 * @example Performance comparison
 * ```typescript
 * // For 10,000 files with partition on year:
 * // - pruneFiles(): O(10,000) - scans all files
 * // - pruneFilesOptimized(): O(1) lookup + index build time
 * //
 * // For repeated queries, the index amortizes its build cost
 * ```
 */
export function pruneFilesOptimized(
  files: ManifestFile[],
  filter: QueryFilter,
  indexThreshold = PARTITION_INDEX_THRESHOLD,
): ManifestFile[] {
  // Handle null/undefined files
  if (!files || files.length === 0) return [];

  // Handle null/undefined filter
  if (!filter) return files;

  // For small file sets, use linear scan
  if (files.length < indexThreshold) {
    return pruneFiles(files, filter);
  }

  // Build partition index for large sets
  const index = createPartitionIndex(files);
  let result = files;

  // Apply partition filters using index
  if (filter.partitions && Object.keys(filter.partitions).length > 0) {
    result = pruneByPartitionWithIndex(index, filter.partitions);
  }

  // Apply column stats pruning (linear scan on reduced set)
  if (filter.columns && Object.keys(filter.columns).length > 0) {
    result = pruneByColumnStats(result, filter.columns);
  }

  return result;
}

/**
 * Partition pruning using pre-built index
 */
function pruneByPartitionWithIndex(
  index: PartitionIndex,
  filters: Record<string, PartitionFilter>
): ManifestFile[] {
  const filterEntries = Object.entries(filters);

  if (filterEntries.length === 0) {
    return index.getAllFiles();
  }

  // Start with files matching first filter
  const [firstName, firstFilter] = filterEntries[0];
  let result = applyPartitionFilterWithIndex(index, firstName, firstFilter);

  // Intersect with remaining filters
  for (let i = 1; i < filterEntries.length; i++) {
    const [name, partitionFilter] = filterEntries[i];
    const matching = applyPartitionFilterWithIndex(index, name, partitionFilter);
    const matchingPaths = new Set(matching.map(f => f.path));
    result = result.filter(f => matchingPaths.has(f.path));
  }

  return result;
}

/**
 * Apply a single partition filter using index
 */
function applyPartitionFilterWithIndex(
  index: PartitionIndex,
  partitionName: string,
  filter: PartitionFilter
): ManifestFile[] {
  if ('eq' in filter) {
    return index.getByValue(partitionName, filter.eq);
  }

  if ('in' in filter) {
    return index.getByValues(partitionName, filter.in);
  }

  if ('between' in filter) {
    const [min, max] = filter.between;
    return index.getByRange(partitionName, min, max, true);
  }

  if ('gte' in filter || 'lte' in filter) {
    const rangeFilter = filter as { gte?: number; lte?: number };
    return index.getByRange(
      partitionName,
      rangeFilter.gte ?? null,
      rangeFilter.lte ?? null,
      true
    );
  }

  // Fallback: return all files for unknown filter types
  return index.getAllFiles();
}

// =============================================================================
// Pruning Statistics and Analysis
// =============================================================================

/**
 * Analyze pruning effectiveness
 */
export interface PruningStats {
  totalFiles: number;
  filesAfterPartitionPruning: number;
  filesAfterColumnPruning: number;
  partitionSelectivity: number;
  columnSelectivity: number;
  overallSelectivity: number;
  prunedBytes: number;
  remainingBytes: number;
}

/**
 * Calculate detailed pruning statistics
 */
export function analyzePruning(
  files: ManifestFile[],
  filter: QueryFilter
): PruningStats {
  const totalFiles = files.length;
  const totalBytes = files.reduce((sum, f) => sum + f.length, 0);

  // After partition pruning
  let afterPartition = files;
  if (filter.partitions) {
    afterPartition = pruneByPartition(files, filter.partitions);
  }

  // After column pruning
  let afterColumn = afterPartition;
  if (filter.columns) {
    afterColumn = pruneByColumnStats(afterPartition, filter.columns);
  }

  const remainingBytes = afterColumn.reduce((sum, f) => sum + f.length, 0);

  return {
    totalFiles,
    filesAfterPartitionPruning: afterPartition.length,
    filesAfterColumnPruning: afterColumn.length,
    partitionSelectivity: totalFiles > 0 ? afterPartition.length / totalFiles : 0,
    columnSelectivity: afterPartition.length > 0 ? afterColumn.length / afterPartition.length : 0,
    overallSelectivity: totalFiles > 0 ? afterColumn.length / totalFiles : 0,
    prunedBytes: totalBytes - remainingBytes,
    remainingBytes,
  };
}
