/**
 * @evodb/core - Shared Query Operations
 *
 * Consolidated filter evaluation, sorting, and aggregation logic
 * used by both @evodb/query and @evodb/reader packages.
 *
 * This module reduces code duplication and ensures consistent behavior
 * across query engines.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Supported filter/predicate operators
 */
export type FilterOperator =
  | 'eq'       // =
  | 'ne'       // !=
  | 'gt'       // >
  | 'gte'      // >=
  | 'ge'       // >= (alias for gte)
  | 'lt'       // <
  | 'lte'      // <=
  | 'le'       // <= (alias for lte)
  | 'in'       // IN (...)
  | 'notIn'    // NOT IN (...)
  | 'between'  // BETWEEN ... AND ...
  | 'like'     // LIKE pattern
  | 'isNull'   // IS NULL
  | 'isNotNull'; // IS NOT NULL

/**
 * Filter predicate specification
 */
export interface FilterPredicate {
  /** Column name/path */
  column: string;
  /** Comparison operator */
  operator: FilterOperator;
  /** Value to compare against (for eq, ne, gt, gte, lt, lte, like) */
  value?: unknown;
  /** Array of values (for in, notIn) */
  values?: unknown[];
  /** Lower bound (for between) */
  lowerBound?: unknown;
  /** Upper bound (for between) */
  upperBound?: unknown;
  /** Negate the predicate */
  not?: boolean;
}

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort specification
 */
export interface SortSpec {
  /** Column to sort by */
  column: string;
  /** Sort direction */
  direction: SortDirection;
  /** Null handling - nullsFirst=true puts nulls first, false puts nulls last */
  nullsFirst?: boolean;
  /** Alias for compatibility: 'first' | 'last' */
  nulls?: 'first' | 'last';
}

/**
 * Aggregation function types
 */
export type AggregateFunction =
  | 'count'
  | 'countDistinct'
  | 'sum'
  | 'sumDistinct'
  | 'avg'
  | 'avgDistinct'
  | 'min'
  | 'max'
  | 'first'
  | 'last'
  | 'stddev'
  | 'variance';

/**
 * Aggregation specification
 */
export interface AggregateSpec {
  /** Aggregation function */
  function: AggregateFunction;
  /** Column to aggregate (null for COUNT(*)) */
  column?: string | null;
  /** Output alias */
  alias: string;
  /** Filter for conditional aggregation */
  filter?: FilterPredicate;
  /** DISTINCT modifier (can also be inferred from function name) */
  distinct?: boolean;
}

/**
 * Filter evaluator interface
 */
export interface FilterEvaluator {
  /**
   * Evaluate a single filter predicate against a value
   */
  evaluate(value: unknown, filter: FilterPredicate): boolean;

  /**
   * Evaluate multiple filters against a row (AND logic)
   */
  evaluateAll(row: Record<string, unknown>, filters: FilterPredicate[]): boolean;
}

/**
 * Aggregation engine interface
 */
export interface AggregationEngine {
  /**
   * Compute aggregations over rows
   */
  aggregate(
    rows: Record<string, unknown>[],
    aggregates: AggregateSpec[],
    groupBy?: string[]
  ): { columns: string[]; rows: unknown[][] };
}

/**
 * Result processor interface
 */
export interface ResultProcessor {
  /**
   * Sort rows by multiple columns
   */
  sort<T extends Record<string, unknown>>(rows: T[], orderBy: SortSpec[]): T[];

  /**
   * Apply limit and offset
   */
  limit<T>(rows: T[], limit: number, offset?: number): T[];
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Type guard: check if value is a plain object (not null, not array)
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Get nested value from object using dot notation
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (path.includes('.')) {
    // Check for flat key first (e.g., 'user.name' stored as flat key)
    if (path in obj) {
      return obj[path];
    }
    // Try nested path
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (!isRecord(current)) return undefined;
      current = current[part];
    }
    return current;
  }
  return obj[path];
}

/**
 * Set nested value in object using dot notation
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  // Store as flat key to preserve path format
  obj[path] = value;
}

/**
 * Convert SQL LIKE pattern to RegExp
 * % matches any sequence, _ matches single char
 */
export function likePatternToRegex(pattern: string): RegExp {
  // Escape special regex characters except % and _
  let regex = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Convert SQL wildcards to regex
  regex = regex.replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${regex}$`, 'i');
}

/**
 * Compare two values for sorting or filtering
 * Returns negative if a < b, positive if a > b, 0 if equal
 */
export function compareValues(a: unknown, b: unknown): number {
  // Handle nulls/undefined
  if (a === null || a === undefined) {
    return b === null || b === undefined ? 0 : -1;
  }
  if (b === null || b === undefined) {
    return 1;
  }

  // Number comparison
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  // String comparison
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b);
  }

  // Date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  // Fallback to string comparison
  return String(a).localeCompare(String(b));
}

// =============================================================================
// Filter Evaluation Implementation
// =============================================================================

/**
 * Evaluate a single filter predicate against a value
 */
export function evaluateFilter(value: unknown, filter: FilterPredicate): boolean {
  let matches = false;

  switch (filter.operator) {
    case 'eq':
      matches = value === filter.value;
      break;

    case 'ne':
      matches = value !== filter.value;
      break;

    case 'gt':
      matches = compareValues(value, filter.value) > 0;
      break;

    case 'gte':
    case 'ge':
      matches = compareValues(value, filter.value) >= 0;
      break;

    case 'lt':
      matches = compareValues(value, filter.value) < 0;
      break;

    case 'lte':
    case 'le':
      matches = compareValues(value, filter.value) <= 0;
      break;

    case 'in':
      matches = (filter.values ?? (Array.isArray(filter.value) ? filter.value : [])).includes(value);
      break;

    case 'notIn':
      matches = !(filter.values ?? (Array.isArray(filter.value) ? filter.value : [])).includes(value);
      break;

    case 'between':
      if (filter.lowerBound !== undefined && filter.upperBound !== undefined) {
        matches =
          compareValues(value, filter.lowerBound) >= 0 &&
          compareValues(value, filter.upperBound) <= 0;
      } else if (Array.isArray(filter.value) && filter.value.length === 2) {
        // Alternative format: value = [lower, upper]
        const [lo, hi] = filter.value;
        matches = compareValues(value, lo) >= 0 && compareValues(value, hi) <= 0;
      }
      break;

    case 'like':
      if (typeof filter.value === 'string' && typeof value === 'string') {
        const regex = likePatternToRegex(filter.value);
        matches = regex.test(value);
      } else {
        matches = false;
      }
      break;

    case 'isNull':
      matches = value === null || value === undefined;
      break;

    case 'isNotNull':
      matches = value !== null && value !== undefined;
      break;

    default: {
      // Exhaustiveness check - TypeScript will error if a case is missing
      const _exhaustiveCheck: never = filter.operator;
      throw new Error(`Unhandled filter operator: ${_exhaustiveCheck}`);
    }
  }

  // Apply negation if specified
  return filter.not ? !matches : matches;
}

/**
 * Evaluate all filters against a row (AND logic)
 */
export function evaluateFilters(
  row: Record<string, unknown>,
  filters: FilterPredicate[]
): boolean {
  if (!filters || filters.length === 0) {
    return true;
  }

  for (const filter of filters) {
    const value = getNestedValue(row, filter.column);
    if (!evaluateFilter(value, filter)) {
      return false;
    }
  }

  return true;
}

/**
 * Create a filter evaluator instance
 */
export function createFilterEvaluator(): FilterEvaluator {
  return {
    evaluate: evaluateFilter,
    evaluateAll: evaluateFilters,
  };
}

// =============================================================================
// Sorting Implementation
// =============================================================================

/**
 * Compare values for sorting with direction and null handling
 */
export function compareForSort(
  a: unknown,
  b: unknown,
  direction: SortDirection,
  nullsFirst?: boolean
): number {
  // Handle nulls
  const aIsNull = a === null || a === undefined;
  const bIsNull = b === null || b === undefined;

  if (aIsNull && bIsNull) return 0;

  // Default nulls handling: nulls go last in ASC, first in DESC
  const defaultNullsFirst = direction === 'desc';
  const effectiveNullsFirst = nullsFirst !== undefined ? nullsFirst : defaultNullsFirst;

  if (aIsNull) return effectiveNullsFirst ? -1 : 1;
  if (bIsNull) return effectiveNullsFirst ? 1 : -1;

  // Compare non-null values
  const cmp = compareValues(a, b);
  return direction === 'asc' ? cmp : -cmp;
}

/**
 * Sort rows by multiple columns
 */
export function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  orderBy: SortSpec[]
): T[] {
  if (!orderBy || orderBy.length === 0) {
    return rows;
  }

  return [...rows].sort((a, b) => {
    for (const spec of orderBy) {
      const aVal = getNestedValue(a, spec.column);
      const bVal = getNestedValue(b, spec.column);

      // Support both nullsFirst boolean and nulls string
      let nullsFirst: boolean | undefined;
      if (spec.nullsFirst !== undefined) {
        nullsFirst = spec.nullsFirst;
      } else if (spec.nulls !== undefined) {
        nullsFirst = spec.nulls === 'first';
      }

      const cmp = compareForSort(aVal, bVal, spec.direction, nullsFirst);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

/**
 * Apply limit and offset to rows
 */
export function limitRows<T>(rows: T[], limit: number, offset?: number): T[] {
  const start = offset || 0;
  return rows.slice(start, start + limit);
}

/**
 * Create a result processor instance
 */
export function createResultProcessor(): ResultProcessor {
  return {
    sort: sortRows,
    limit: limitRows,
  };
}

// =============================================================================
// Aggregation Implementation
// =============================================================================

/**
 * Compute a single aggregate value over rows
 */
export function computeAggregate(
  rows: Record<string, unknown>[],
  spec: AggregateSpec
): unknown {
  const { function: fn, column } = spec;

  // Handle count(*)
  if (fn === 'count' && (column === null || column === undefined)) {
    return rows.length;
  }

  // Get column values
  const getVal = (row: Record<string, unknown>): unknown =>
    column ? getNestedValue(row, column) : null;

  switch (fn) {
    case 'count': {
      // Count non-null values
      return rows.filter(r => {
        const val = getVal(r);
        return val !== null && val !== undefined;
      }).length;
    }

    case 'countDistinct': {
      const distinctValues = new Set<unknown>();
      for (const row of rows) {
        const val = getVal(row);
        if (val !== null && val !== undefined) {
          distinctValues.add(val);
        }
      }
      return distinctValues.size;
    }

    case 'sum':
    case 'sumDistinct': {
      const isDistinct = fn === 'sumDistinct' || spec.distinct;
      const seen = new Set<unknown>();
      let sum = 0;

      for (const row of rows) {
        const val = getVal(row);
        if (val !== null && val !== undefined && typeof val === 'number') {
          if (isDistinct) {
            if (!seen.has(val)) {
              seen.add(val);
              sum += val;
            }
          } else {
            sum += val;
          }
        }
      }
      return sum;
    }

    case 'avg':
    case 'avgDistinct': {
      const isDistinct = fn === 'avgDistinct' || spec.distinct;
      const seen = new Set<unknown>();
      let sum = 0;
      let count = 0;

      for (const row of rows) {
        const val = getVal(row);
        if (val !== null && val !== undefined && typeof val === 'number') {
          if (isDistinct) {
            if (!seen.has(val)) {
              seen.add(val);
              sum += val;
              count++;
            }
          } else {
            sum += val;
            count++;
          }
        }
      }
      return count > 0 ? sum / count : null;
    }

    case 'min': {
      let min: unknown = null;
      for (const row of rows) {
        const val = getVal(row);
        if (val !== null && val !== undefined) {
          if (min === null || compareValues(val, min) < 0) {
            min = val;
          }
        }
      }
      return min;
    }

    case 'max': {
      let max: unknown = null;
      for (const row of rows) {
        const val = getVal(row);
        if (val !== null && val !== undefined) {
          if (max === null || compareValues(val, max) > 0) {
            max = val;
          }
        }
      }
      return max;
    }

    case 'first': {
      for (const row of rows) {
        const val = getVal(row);
        if (val !== null && val !== undefined) {
          return val;
        }
      }
      return null;
    }

    case 'last': {
      for (let i = rows.length - 1; i >= 0; i--) {
        const val = getVal(rows[i]);
        if (val !== null && val !== undefined) {
          return val;
        }
      }
      return null;
    }

    case 'stddev': {
      const values: number[] = [];
      for (const row of rows) {
        const val = getVal(row);
        if (val !== null && val !== undefined && typeof val === 'number') {
          values.push(val);
        }
      }
      if (values.length < 2) return null;

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const squaredDiffs = values.map(v => (v - mean) ** 2);
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
      return Math.sqrt(variance);
    }

    case 'variance': {
      const values: number[] = [];
      for (const row of rows) {
        const val = getVal(row);
        if (val !== null && val !== undefined && typeof val === 'number') {
          values.push(val);
        }
      }
      if (values.length < 2) return null;

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const squaredDiffs = values.map(v => (v - mean) ** 2);
      return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }

    default:
      return null;
  }
}

/**
 * Compute aggregations over rows, optionally grouped
 */
export function computeAggregations(
  rows: Record<string, unknown>[],
  aggregates: AggregateSpec[],
  groupBy?: string[]
): { columns: string[]; rows: unknown[][] } {
  // Group rows
  const groups = new Map<string, Record<string, unknown>[]>();

  if (groupBy && groupBy.length > 0) {
    for (const row of rows) {
      const key = groupBy.map(col => String(getNestedValue(row, col))).join('|');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      const group = groups.get(key);
      if (group) {
        group.push(row);
      }
    }
  } else {
    // Single group (all rows)
    groups.set('__all__', rows);
  }

  // Build result columns
  const resultColumns: string[] = [];
  if (groupBy) {
    resultColumns.push(...groupBy);
  }
  resultColumns.push(...aggregates.map(a => a.alias));

  // Compute aggregates for each group
  const resultRows: unknown[][] = [];

  for (const [, groupRows] of groups) {
    const row: unknown[] = [];

    // Add group by values
    if (groupBy && groupRows.length > 0) {
      for (const col of groupBy) {
        row.push(getNestedValue(groupRows[0], col));
      }
    }

    // Add aggregate values
    for (const agg of aggregates) {
      row.push(computeAggregate(groupRows, agg));
    }

    resultRows.push(row);
  }

  return { columns: resultColumns, rows: resultRows };
}

/**
 * Create an aggregation engine instance
 */
export function createAggregationEngine(): AggregationEngine {
  return {
    aggregate: computeAggregations,
  };
}

// =============================================================================
// Convenience Exports
// =============================================================================

/**
 * All-in-one query operations for simple use cases
 */
export const queryOps = {
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
};
