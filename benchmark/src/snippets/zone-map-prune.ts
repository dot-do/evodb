/**
 * Zone Map Pruning Benchmark
 *
 * Tests zone map (min/max statistics) evaluation for partition pruning
 * within Snippets 5ms CPU constraint. Zone maps enable predicate pushdown
 * by quickly eliminating partitions that cannot contain matching rows.
 *
 * Target: Prune 100+ partitions within 1ms (budget allocation)
 *
 * @module @evodb/benchmark/snippets/zone-map-prune
 */

import {
  SNIPPETS_CONSTRAINTS,
  CPU_BUDGET,
  assertWithinConstraints,
  validateConstraints,
  runBenchmark,
  formatBytes,
  formatMs,
  type BenchmarkMetrics,
  type ConstraintValidationResult,
} from './constraints.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Statistics for a single column in a zone map
 */
export interface ColumnStats {
  /** Minimum value in the partition */
  min: number | bigint | string;
  /** Maximum value in the partition */
  max: number | bigint | string;
  /** Null count (for null-aware filtering) */
  nullCount: number;
  /** Distinct value count estimate (optional) */
  distinctCount?: number;
}

/**
 * Zone map for a single partition
 */
export interface ZoneMap {
  /** Partition ID */
  partitionId: string;
  /** Row count in partition */
  rowCount: number;
  /** Size in bytes */
  sizeBytes: number;
  /** Column statistics */
  columns: Map<string, ColumnStats>;
  /** Partition path for data access */
  path: string;
}

/**
 * Filter predicate for zone map evaluation
 */
export interface FilterPredicate {
  /** Column to filter on */
  column: string;
  /** Filter operator */
  op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'between' | 'in' | 'is_null' | 'is_not_null';
  /** Filter value(s) */
  value?: number | bigint | string | (number | bigint | string)[];
  /** Upper bound for 'between' operator */
  upperValue?: number | bigint | string;
}

/**
 * Result of zone map evaluation
 */
export interface ZoneMapPruneResult {
  /** Partitions that may contain matching rows */
  matchingPartitions: ZoneMap[];
  /** Partitions that definitely don't match */
  prunedPartitions: ZoneMap[];
  /** Total partitions evaluated */
  totalPartitions: number;
  /** Pruning ratio (0-1, higher is better) */
  pruneRatio: number;
  /** CPU time in milliseconds */
  cpuMs: number;
}

/**
 * Benchmark result for zone map pruning
 */
export interface ZoneMapPruneBenchmarkResult {
  /** Benchmark name */
  name: string;
  /** Number of partitions evaluated */
  partitionCount: number;
  /** Number of columns per zone map */
  columnsPerZoneMap: number;
  /** Number of predicates evaluated */
  predicateCount: number;
  /** CPU time in milliseconds */
  cpuMs: number;
  /** Partitions per millisecond */
  partitionsPerMs: number;
  /** Achieved prune ratio */
  pruneRatio: number;
  /** Whether within Snippets constraints */
  withinConstraints: boolean;
  /** Whether within CPU budget allocation */
  withinBudget: boolean;
  /** Detailed constraint validation */
  validation: ConstraintValidationResult;
  /** Timing breakdown */
  timing: {
    avgMs: number;
    minMs: number;
    maxMs: number;
    p50Ms: number;
    p99Ms: number;
  };
}

// =============================================================================
// Zone Map Generation
// =============================================================================

/**
 * Generate zone maps for benchmarking
 *
 * @param partitionCount - Number of partitions to generate
 * @param columnCount - Number of columns per zone map
 * @param rowsPerPartition - Rows per partition
 * @returns Array of generated zone maps
 */
export function generateZoneMaps(
  partitionCount: number,
  columnCount: number = 10,
  rowsPerPartition: number = 100_000
): ZoneMap[] {
  const zoneMaps: ZoneMap[] = [];

  // Generate with realistic value ranges that allow pruning
  const baseTimestamp = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago
  const timestampRangeMs = 7 * 24 * 60 * 60 * 1000; // 1 week per partition

  for (let i = 0; i < partitionCount; i++) {
    const columns = new Map<string, ColumnStats>();

    // id column (sequential ranges)
    columns.set('id', {
      min: BigInt(i * rowsPerPartition),
      max: BigInt((i + 1) * rowsPerPartition - 1),
      nullCount: 0,
      distinctCount: rowsPerPartition,
    });

    // timestamp column (time-partitioned)
    columns.set('timestamp', {
      min: baseTimestamp + i * timestampRangeMs,
      max: baseTimestamp + (i + 1) * timestampRangeMs - 1,
      nullCount: 0,
    });

    // user_id column (overlapping ranges for realistic scenarios)
    const userIdBase = Math.floor((i * 1000) / partitionCount);
    columns.set('user_id', {
      min: userIdBase,
      max: userIdBase + Math.floor(10000 / partitionCount),
      nullCount: Math.floor(rowsPerPartition * 0.01),
      distinctCount: 10000 / partitionCount,
    });

    // value column (numeric with overlapping ranges)
    columns.set('value', {
      min: Math.random() * 100,
      max: Math.random() * 100 + 900,
      nullCount: Math.floor(rowsPerPartition * 0.05),
    });

    // category column (string enum)
    const categoryBase = i % 10;
    columns.set('category', {
      min: `cat_${categoryBase.toString().padStart(3, '0')}`,
      max: `cat_${(categoryBase + 2).toString().padStart(3, '0')}`,
      nullCount: 0,
      distinctCount: 3,
    });

    // Add more columns as needed
    for (let c = 5; c < columnCount; c++) {
      columns.set(`col_${c}`, {
        min: i * 100,
        max: (i + 1) * 100,
        nullCount: Math.floor(rowsPerPartition * 0.02),
      });
    }

    zoneMaps.push({
      partitionId: `partition_${i.toString().padStart(6, '0')}`,
      rowCount: rowsPerPartition,
      sizeBytes: rowsPerPartition * 50, // ~50 bytes per row estimate
      columns,
      path: `data/partition_${i.toString().padStart(6, '0')}.parquet`,
    });
  }

  return zoneMaps;
}

/**
 * Generate filter predicates for benchmarking
 *
 * @param selectivity - Target selectivity (0-1, lower = more selective)
 * @returns Array of filter predicates
 */
export function generatePredicates(selectivity: number = 0.1): FilterPredicate[] {
  // Generate predicates that will match approximately `selectivity` of partitions
  const predicates: FilterPredicate[] = [];

  // Timestamp range predicate (common in analytics)
  const now = Date.now();
  const rangeStart = now - 30 * 24 * 60 * 60 * 1000 * selectivity; // Recent data
  predicates.push({
    column: 'timestamp',
    op: 'gte',
    value: rangeStart,
  });

  // User ID range (if selectivity < 0.5)
  if (selectivity < 0.5) {
    predicates.push({
      column: 'user_id',
      op: 'between',
      value: Math.floor(1000 * selectivity),
      upperValue: Math.floor(1000 * selectivity + 500),
    });
  }

  // Value threshold
  predicates.push({
    column: 'value',
    op: 'gt',
    value: 500,
  });

  return predicates;
}

// =============================================================================
// Zone Map Evaluation
// =============================================================================

/**
 * Evaluate zone maps against filter predicates
 * Returns partitions that may contain matching rows
 *
 * @param zoneMaps - Zone maps to evaluate
 * @param predicates - Filter predicates to apply
 * @returns Pruning result
 */
export function evaluateZoneMaps(
  zoneMaps: ZoneMap[],
  predicates: FilterPredicate[]
): ZoneMapPruneResult {
  const start = performance.now();

  const matchingPartitions: ZoneMap[] = [];
  const prunedPartitions: ZoneMap[] = [];

  for (const zoneMap of zoneMaps) {
    let matches = true;

    // Evaluate all predicates (AND semantics)
    for (const predicate of predicates) {
      if (!evaluatePredicate(zoneMap, predicate)) {
        matches = false;
        break; // Short-circuit on first non-match
      }
    }

    if (matches) {
      matchingPartitions.push(zoneMap);
    } else {
      prunedPartitions.push(zoneMap);
    }
  }

  const cpuMs = performance.now() - start;

  return {
    matchingPartitions,
    prunedPartitions,
    totalPartitions: zoneMaps.length,
    pruneRatio: prunedPartitions.length / zoneMaps.length,
    cpuMs,
  };
}

/**
 * Evaluate a single predicate against a zone map
 *
 * @param zoneMap - Zone map to evaluate
 * @param predicate - Filter predicate
 * @returns true if partition may contain matching rows
 */
function evaluatePredicate(zoneMap: ZoneMap, predicate: FilterPredicate): boolean {
  const stats = zoneMap.columns.get(predicate.column);

  // If column not in zone map, conservatively include
  if (!stats) return true;

  const { min, max, nullCount } = stats;
  const { op, value, upperValue } = predicate;

  // Extract scalar value for non-array operations
  const scalarValue = Array.isArray(value) ? undefined : value;

  switch (op) {
    case 'eq':
      // Partition matches if value is within [min, max] range
      return scalarValue !== undefined &&
        compareValues(scalarValue, min) >= 0 && compareValues(scalarValue, max) <= 0;

    case 'ne':
      // Partition matches unless min === max === value
      return scalarValue === undefined ||
        !(compareValues(min, max) === 0 && compareValues(min, scalarValue) === 0);

    case 'lt':
      // Partition matches if min < value
      return scalarValue !== undefined && compareValues(min, scalarValue) < 0;

    case 'lte':
      // Partition matches if min <= value
      return scalarValue !== undefined && compareValues(min, scalarValue) <= 0;

    case 'gt':
      // Partition matches if max > value
      return scalarValue !== undefined && compareValues(max, scalarValue) > 0;

    case 'gte':
      // Partition matches if max >= value
      return scalarValue !== undefined && compareValues(max, scalarValue) >= 0;

    case 'between':
      // Partition matches if ranges overlap: !(max < lower || min > upper)
      return scalarValue !== undefined && upperValue !== undefined && !(
        compareValues(max, scalarValue) < 0 || compareValues(min, upperValue) > 0
      );

    case 'in':
      // Partition matches if any value in list is within [min, max]
      if (!Array.isArray(value)) return true;
      const values = value as (number | bigint | string)[];
      return values.some(
        (v) => compareValues(v, min) >= 0 && compareValues(v, max) <= 0
      );

    case 'is_null':
      // Partition matches if it contains nulls
      return nullCount > 0;

    case 'is_not_null':
      // Partition matches if it contains non-null values
      return zoneMap.rowCount > nullCount;

    default:
      return true; // Unknown operator, conservatively include
  }
}

/**
 * Compare two values of potentially different types
 */
function compareValues(
  a: number | bigint | string | undefined,
  b: number | bigint | string | undefined
): number {
  if (a === undefined || b === undefined) return 0;

  // Handle bigint comparison
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    const aBig = typeof a === 'bigint' ? a : BigInt(Math.floor(Number(a)));
    const bBig = typeof b === 'bigint' ? b : BigInt(Math.floor(Number(b)));
    return aBig < bBig ? -1 : aBig > bBig ? 1 : 0;
  }

  // Handle string comparison
  if (typeof a === 'string' || typeof b === 'string') {
    const aStr = String(a);
    const bStr = String(b);
    return aStr.localeCompare(bStr);
  }

  // Numeric comparison
  return (a as number) - (b as number);
}

// =============================================================================
// Benchmark Functions
// =============================================================================

/**
 * Benchmark zone map pruning for a given configuration
 *
 * @param partitionCount - Number of partitions to evaluate
 * @param predicateCount - Number of predicates (default: 3)
 * @param selectivity - Target selectivity (default: 0.1)
 * @param iterations - Number of benchmark iterations
 * @returns Detailed benchmark result
 */
export async function benchmarkZoneMapPrune(
  partitionCount: number,
  predicateCount: number = 3,
  selectivity: number = 0.1,
  iterations: number = 20
): Promise<ZoneMapPruneBenchmarkResult> {
  // Generate test data
  const zoneMaps = generateZoneMaps(partitionCount, 10, 100_000);
  const predicates = generatePredicates(selectivity).slice(0, predicateCount);

  // Run benchmark
  const timing = runBenchmark(
    () => evaluateZoneMaps(zoneMaps, predicates),
    iterations,
    3 // warmup iterations
  );

  const cpuMs = timing.p99Ms;

  // Calculate zone map memory footprint
  const zoneMapMemoryKb = partitionCount * 10 * 40 / 1024; // ~40 bytes per column stat

  const metrics: BenchmarkMetrics = {
    cpuMs,
    memoryMb: zoneMapMemoryKb / 1024,
  };

  const validation = validateConstraints(metrics);

  // Check if within budget allocation for zone map pruning
  const withinBudget = cpuMs <= CPU_BUDGET.zoneMapPrune;

  // Get actual prune ratio from a single run
  const result = evaluateZoneMaps(zoneMaps, predicates);

  return {
    name: 'zone-map-prune',
    partitionCount,
    columnsPerZoneMap: 10,
    predicateCount,
    cpuMs,
    partitionsPerMs: partitionCount / timing.avgMs,
    pruneRatio: result.pruneRatio,
    withinConstraints: validation.withinConstraints,
    withinBudget,
    validation,
    timing,
  };
}

/**
 * Find maximum partition count that can be evaluated within budget
 *
 * @param targetMs - Target CPU time (default: 1ms budget allocation)
 * @returns Maximum partition count and results
 */
export async function findMaxPartitionCount(
  targetMs: number = CPU_BUDGET.zoneMapPrune
): Promise<{
  maxPartitionCount: number;
  results: ZoneMapPruneBenchmarkResult[];
}> {
  const results: ZoneMapPruneBenchmarkResult[] = [];
  const testCounts = [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

  let maxPartitionCount = 0;

  for (const count of testCounts) {
    const result = await benchmarkZoneMapPrune(count, 3, 0.1, 10);
    results.push(result);

    if (result.cpuMs <= targetMs) {
      maxPartitionCount = count;
    } else {
      break;
    }
  }

  return { maxPartitionCount, results };
}

// =============================================================================
// Reporting
// =============================================================================

/**
 * Format benchmark result for console output
 */
export function formatZoneMapPruneResult(
  result: ZoneMapPruneBenchmarkResult
): string {
  const lines: string[] = [];

  lines.push(`\n=== Zone Map Prune Benchmark ===`);
  lines.push(`Partitions: ${result.partitionCount.toLocaleString()}`);
  lines.push(`Columns per zone map: ${result.columnsPerZoneMap}`);
  lines.push(`Predicates: ${result.predicateCount}`);
  lines.push(`---`);
  lines.push(`CPU Time (p99): ${formatMs(result.cpuMs)}`);
  lines.push(`Partitions/ms: ${Math.floor(result.partitionsPerMs).toLocaleString()}`);
  lines.push(`Prune ratio: ${(result.pruneRatio * 100).toFixed(1)}%`);
  lines.push(`---`);
  lines.push(`Timing: avg=${formatMs(result.timing.avgMs)}, min=${formatMs(result.timing.minMs)}, max=${formatMs(result.timing.maxMs)}`);
  lines.push(`---`);
  lines.push(`Within 5ms constraint: ${result.withinConstraints ? 'YES' : 'NO'}`);
  lines.push(`Within ${CPU_BUDGET.zoneMapPrune}ms budget: ${result.withinBudget ? 'YES' : 'NO'}`);

  return lines.join('\n');
}
