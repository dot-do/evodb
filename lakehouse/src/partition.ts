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
 * Filter files based on partition values
 */
export function pruneByPartition(
  files: ManifestFile[],
  filters: Record<string, PartitionFilter>
): ManifestFile[] {
  if (Object.keys(filters).length === 0) return files;

  return files.filter(file => matchesPartitionFilters(file.partitions, filters));
}

/**
 * Check if partition values match filters
 */
function matchesPartitionFilters(
  partitions: PartitionValue[],
  filters: Record<string, PartitionFilter>
): boolean {
  const partitionMap = new Map(partitions.map(p => [p.name, p.value]));

  for (const [name, filter] of Object.entries(filters)) {
    const value = partitionMap.get(name);
    if (!matchesPartitionFilter(value, filter)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a single partition value matches a filter
 */
function matchesPartitionFilter(
  value: string | number | null | undefined,
  filter: PartitionFilter
): boolean {
  if (value === null || value === undefined) {
    // Null values only match if specifically included
    if ('eq' in filter) return filter.eq === null;
    if ('in' in filter) return filter.in.includes(null as never);
    return false;
  }

  if ('eq' in filter) {
    return value === filter.eq;
  }

  if ('in' in filter) {
    return filter.in.includes(value);
  }

  if ('between' in filter) {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
    const [min, max] = filter.between;
    return numValue >= min && numValue <= max;
  }

  if ('gte' in filter) {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
    const gteFilter = filter as { gte: number; lte?: number };
    if (numValue < gteFilter.gte) return false;
    if (gteFilter.lte !== undefined && numValue > gteFilter.lte) return false;
    return true;
  }

  if ('lte' in filter) {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
    const lteFilter = filter as { lte: number; gte?: number };
    if (numValue > lteFilter.lte) return false;
    if (lteFilter.gte !== undefined && numValue < lteFilter.gte) return false;
    return true;
  }

  return true;
}

// =============================================================================
// Zone Map (Column Stats) Pruning
// =============================================================================

/**
 * Filter files based on column statistics (zone maps)
 */
export function pruneByColumnStats(
  files: ManifestFile[],
  filters: Record<string, ColumnFilter>
): ManifestFile[] {
  if (Object.keys(filters).length === 0) return files;

  return files.filter(file => matchesColumnFilters(file.stats.columnStats, filters));
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
 * Check if column stats could contain matching values
 */
function statsMatchFilter(stats: ColumnStats, filter: ColumnFilter): boolean {
  const { min, max, nullCount } = stats;

  // Handle null checks
  if ('isNull' in filter) {
    if (filter.isNull) {
      return nullCount > 0;
    } else {
      // Looking for non-null values
      const totalRows = stats.distinctCount ?? 1;
      return nullCount < totalRows;
    }
  }

  // Can't prune if no min/max stats
  if (min === undefined || max === undefined) return true;

  // Equality check
  if ('eq' in filter) {
    return compareValues(filter.eq, min) >= 0 && compareValues(filter.eq, max) <= 0;
  }

  // Not equal - can only prune if all values are the same
  if ('ne' in filter) {
    if (compareValues(min, max) === 0 && compareValues(min, filter.ne) === 0) {
      return false;
    }
    return true;
  }

  // Greater than
  if ('gt' in filter) {
    return compareValues(max, filter.gt) > 0;
  }

  // Greater than or equal
  if ('gte' in filter) {
    return compareValues(max, filter.gte) >= 0;
  }

  // Less than
  if ('lt' in filter) {
    return compareValues(min, filter.lt) < 0;
  }

  // Less than or equal
  if ('lte' in filter) {
    return compareValues(min, filter.lte) <= 0;
  }

  // Between
  if ('between' in filter) {
    const [filterMin, filterMax] = filter.between;
    return compareValues(max, filterMin) >= 0 && compareValues(min, filterMax) <= 0;
  }

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
 * Apply all filters to prune files
 */
export function pruneFiles(
  files: ManifestFile[],
  filter: QueryFilter
): ManifestFile[] {
  let result = files;

  // Apply partition pruning
  if (filter.partitions) {
    result = pruneByPartition(result, filter.partitions);
  }

  // Apply column stats pruning
  if (filter.columns) {
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
 * Partition index for efficient O(1) file lookups by partition value
 * Pre-builds indexes for fast repeated queries
 */
export class PartitionIndex {
  private readonly partitionMaps: Map<string, Map<string | number | null, ManifestFile[]>>;
  private readonly sortedValues: Map<string, (string | number)[]>;
  private readonly files: ManifestFile[];

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
   * Get files matching exact partition value - O(1)
   */
  getByValue(partitionName: string, value: string | number | null): ManifestFile[] {
    return this.partitionMaps.get(partitionName)?.get(value) ?? [];
  }

  /**
   * Get files matching any of the given values - O(k) where k is number of values
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
   * Get files in range - uses binary search for efficiency
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
   * Binary search for lower bound
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
   * Binary search for upper bound
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
   * Get all unique values for a partition
   */
  getUniqueValues(partitionName: string): (string | number | null)[] {
    const valueMap = this.partitionMaps.get(partitionName);
    return valueMap ? [...valueMap.keys()] : [];
  }

  /**
   * Get all files
   */
  getAllFiles(): ManifestFile[] {
    return this.files;
  }
}

/**
 * Create a partition index from files
 */
export function createPartitionIndex(files: ManifestFile[]): PartitionIndex {
  return new PartitionIndex(files);
}

// =============================================================================
// Optimized Combined Pruning
// =============================================================================

/**
 * Optimized pruning using partition index for large file sets
 * Falls back to linear scan for small sets
 */
export function pruneFilesOptimized(
  files: ManifestFile[],
  filter: QueryFilter,
  indexThreshold = 50
): ManifestFile[] {
  // For small file sets, use linear scan
  if (files.length < indexThreshold) {
    return pruneFiles(files, filter);
  }

  // Build partition index for large sets
  const index = createPartitionIndex(files);
  let result = files;

  // Apply partition filters using index
  if (filter.partitions) {
    result = pruneByPartitionWithIndex(index, filter.partitions);
  }

  // Apply column stats pruning (linear scan on reduced set)
  if (filter.columns) {
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
