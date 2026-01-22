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

// Import centralized type guard
import { isRecord } from './type-guards.js';

/**
 * Regex pattern for valid column names.
 * Allows: alphanumeric characters, underscores, and dots (for nested paths).
 * Each segment (between dots) must:
 * - Start with a letter, underscore, or digit
 * - Contain only letters, digits, and underscores
 * - Not be empty
 */
const VALID_COLUMN_SEGMENT = /^[a-zA-Z_][a-zA-Z0-9_]*$|^[0-9]+$/;

/**
 * Validate a column name to prevent injection attacks.
 *
 * Valid column names:
 * - Consist of alphanumeric characters, underscores, and dots
 * - Each segment (separated by dots) must start with a letter or underscore,
 *   or be a numeric index
 * - Cannot be empty, start with a dot, or end with a dot
 *
 * @throws Error if column name is invalid
 */
export function validateColumnName(name: string): void {
  // Check for empty or whitespace-only strings
  if (!name || name.trim() !== name || name.trim().length === 0) {
    throw new Error(`Invalid column name: "${name}" - column names cannot be empty or contain leading/trailing whitespace`);
  }

  // Check for whitespace within the name
  if (/\s/.test(name)) {
    throw new Error(`Invalid column name: "${name}" - column names cannot contain whitespace`);
  }

  // Check for control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) {
    throw new Error(`Invalid column name: "${name}" - column names cannot contain control characters`);
  }

  // Check for common SQL injection patterns and dangerous characters
  const dangerousPatterns = [
    /['"`;]/,           // Quote characters and semicolons
    /--/,               // SQL comment
    /\/\*/,             // C-style comment start
    /\*\//,             // C-style comment end
    /[()]/,             // Parentheses (function calls)
    /\\/,               // Backslash (escape sequences, path traversal)
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(name)) {
      throw new Error(`Invalid column name: "${name}" - contains potentially dangerous characters`);
    }
  }

  // Split by dots and validate each segment
  const segments = name.split('.');

  // Check for empty segments (consecutive dots, leading/trailing dots)
  if (segments.some(s => s === '')) {
    throw new Error(`Invalid column name: "${name}" - column names cannot have empty segments`);
  }

  // Validate each segment
  for (const segment of segments) {
    if (!VALID_COLUMN_SEGMENT.test(segment)) {
      throw new Error(`Invalid column name: "${name}" - segment "${segment}" contains invalid characters`);
    }
  }
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
 * Get nested value using pre-split path parts (fast path for compiled filters)
 * This avoids parsing the path string on every row access.
 */
export function getNestedValueFast(obj: Record<string, unknown>, path: string, pathParts: string[]): unknown {
  // For simple (non-dotted) paths, use direct access
  if (pathParts.length === 1) {
    return obj[path];
  }
  // Check for flat key first (e.g., 'user.name' stored as flat key)
  if (path in obj) {
    return obj[path];
  }
  // Traverse the nested path using pre-split parts
  let current: unknown = obj;
  for (const part of pathParts) {
    if (current === null || current === undefined) return undefined;
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
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
 * Check if a string contains only ASCII characters (code points 0-127)
 * Used for fast-path string comparison optimization
 */
export function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return false;
  }
  return true;
}

/**
 * Compare two strings with fast path for ASCII-only strings.
 * Uses simple < operator for ASCII (much faster than localeCompare),
 * falls back to localeCompare for unicode strings.
 */
export function compareStrings(a: string, b: string): number {
  // Fast path for ASCII strings (most common case)
  if (isAscii(a) && isAscii(b)) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  // Fall back to locale-aware comparison for unicode
  return a.localeCompare(b);
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

  // String comparison - uses fast path for ASCII
  if (typeof a === 'string' && typeof b === 'string') {
    return compareStrings(a, b);
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
    // Validate column name to prevent injection attacks
    validateColumnName(filter.column);

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
// Compiled Filter Implementation (Performance Optimization)
// =============================================================================

/**
 * Compiled filter with pre-validated column and pre-split path parts
 */
export interface CompiledFilter {
  /** Original filter predicate */
  filter: FilterPredicate;
  /** Pre-split path parts for fast nested access */
  pathParts: string[];
  /** Pre-compiled regex for LIKE operations */
  likeRegex?: RegExp;
}

/**
 * Compile filters for fast evaluation.
 * This validates column names and parses paths once, not per row.
 *
 * @example
 * // Compile once before iterating
 * const compiled = compileFilters(filters);
 *
 * // Use in tight loop
 * const results = rows.filter(row => evaluateCompiledFilters(row, compiled));
 */
export function compileFilters(filters: FilterPredicate[]): CompiledFilter[] {
  return filters.map(filter => {
    // Validate column name once at compile time
    validateColumnName(filter.column);

    // Pre-split the path for fast nested access
    const pathParts = filter.column.split('.');

    // Pre-compile LIKE patterns
    const likeRegex = filter.operator === 'like' && filter.value !== undefined
      ? likePatternToRegex(String(filter.value))
      : undefined;

    return {
      filter,
      pathParts,
      likeRegex,
    };
  });
}

/**
 * Evaluate a single compiled filter against a value.
 * Uses pre-compiled regex for LIKE operations.
 */
function evaluateCompiledFilter(value: unknown, compiled: CompiledFilter): boolean {
  const { filter, likeRegex } = compiled;
  let matches: boolean;

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
      matches = Array.isArray(filter.values) && filter.values.includes(value);
      break;

    case 'notIn':
      matches = !Array.isArray(filter.values) || !filter.values.includes(value);
      break;

    case 'between':
      matches =
        compareValues(value, filter.lowerBound) >= 0 &&
        compareValues(value, filter.upperBound) <= 0;
      break;

    case 'like':
      // Use pre-compiled regex
      if (likeRegex && typeof value === 'string') {
        matches = likeRegex.test(value);
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
      // Exhaustiveness check
      const _exhaustiveCheck: never = filter.operator;
      throw new Error(`Unhandled filter operator: ${_exhaustiveCheck}`);
    }
  }

  return filter.not ? !matches : matches;
}

/**
 * Evaluate all compiled filters against a row (AND logic).
 * Uses pre-compiled accessors for fast column value retrieval.
 *
 * @example
 * const compiled = compileFilters(filters);
 * const matchingRows = rows.filter(row => evaluateCompiledFilters(row, compiled));
 */
export function evaluateCompiledFilters(
  row: Record<string, unknown>,
  compiledFilters: CompiledFilter[]
): boolean {
  if (!compiledFilters || compiledFilters.length === 0) {
    return true;
  }

  for (const compiled of compiledFilters) {
    // Use fast getter with pre-split path parts
    const value = getNestedValueFast(row, compiled.filter.column, compiled.pathParts);
    if (!evaluateCompiledFilter(value, compiled)) {
      return false;
    }
  }

  return true;
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
 *
 * Uses slice() + in-place sort instead of [...rows].sort() to avoid
 * double memory allocation from spread operator creating intermediate array.
 */
export function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  orderBy: SortSpec[]
): T[] {
  if (!orderBy || orderBy.length === 0) {
    return rows;
  }

  // Clone once with slice(), then sort in-place
  // This avoids the double allocation from [...rows].sort()
  const result = rows.slice();
  result.sort((a, b) => {
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
  return result;
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
 * Aggregator state interface for single-pass aggregation.
 * Each aggregator accumulates values during iteration and computes final result.
 */
interface Aggregator {
  /** Process a value from a row */
  update(value: unknown): void;
  /** Compute the final aggregate result */
  finalize(): unknown;
}

/**
 * Create an aggregator for the given specification.
 * Uses the aggregator state pattern for efficient single-pass processing.
 */
function createAggregator(spec: AggregateSpec, isCountStar: boolean): Aggregator {
  const { function: fn } = spec;
  const isDistinct = fn.endsWith('Distinct') || spec.distinct;

  switch (fn) {
    case 'count': {
      if (isCountStar) {
        // count(*) - count all rows
        return {
          count: 0,
          update() {
            this.count++;
          },
          finalize() {
            return this.count;
          },
        };
      }
      // count(column) - count non-null values
      return {
        count: 0,
        update(v: unknown) {
          if (v !== null && v !== undefined) this.count++;
        },
        finalize() {
          return this.count;
        },
      };
    }

    case 'countDistinct': {
      return {
        seen: new Set<unknown>(),
        update(v: unknown) {
          if (v !== null && v !== undefined) this.seen.add(v);
        },
        finalize() {
          return this.seen.size;
        },
      };
    }

    case 'sum': {
      return {
        sum: 0,
        update(v: unknown) {
          if (typeof v === 'number') this.sum += v;
        },
        finalize() {
          return this.sum;
        },
      };
    }

    case 'sumDistinct': {
      return {
        sum: 0,
        seen: new Set<unknown>(),
        update(v: unknown) {
          if (typeof v === 'number' && !this.seen.has(v)) {
            this.seen.add(v);
            this.sum += v;
          }
        },
        finalize() {
          return this.sum;
        },
      };
    }

    case 'avg': {
      return {
        sum: 0,
        count: 0,
        update(v: unknown) {
          if (typeof v === 'number') {
            this.sum += v;
            this.count++;
          }
        },
        finalize() {
          return this.count > 0 ? this.sum / this.count : null;
        },
      };
    }

    case 'avgDistinct': {
      return {
        sum: 0,
        count: 0,
        seen: new Set<unknown>(),
        update(v: unknown) {
          if (typeof v === 'number' && !this.seen.has(v)) {
            this.seen.add(v);
            this.sum += v;
            this.count++;
          }
        },
        finalize() {
          return this.count > 0 ? this.sum / this.count : null;
        },
      };
    }

    case 'min': {
      return {
        min: null as unknown,
        update(v: unknown) {
          if (v !== null && v !== undefined) {
            if (this.min === null || compareValues(v, this.min) < 0) {
              this.min = v;
            }
          }
        },
        finalize() {
          return this.min;
        },
      };
    }

    case 'max': {
      return {
        max: null as unknown,
        update(v: unknown) {
          if (v !== null && v !== undefined) {
            if (this.max === null || compareValues(v, this.max) > 0) {
              this.max = v;
            }
          }
        },
        finalize() {
          return this.max;
        },
      };
    }

    case 'first': {
      return {
        first: null as unknown,
        found: false,
        update(v: unknown) {
          if (!this.found && v !== null && v !== undefined) {
            this.first = v;
            this.found = true;
          }
        },
        finalize() {
          return this.first;
        },
      };
    }

    case 'last': {
      return {
        last: null as unknown,
        update(v: unknown) {
          if (v !== null && v !== undefined) {
            this.last = v;
          }
        },
        finalize() {
          return this.last;
        },
      };
    }

    case 'stddev': {
      // Welford's online algorithm for numerically stable variance
      return {
        count: 0,
        mean: 0,
        m2: 0,
        update(v: unknown) {
          if (typeof v === 'number') {
            this.count++;
            const delta = v - this.mean;
            this.mean += delta / this.count;
            const delta2 = v - this.mean;
            this.m2 += delta * delta2;
          }
        },
        finalize() {
          if (this.count < 2) return null;
          return Math.sqrt(this.m2 / this.count);
        },
      };
    }

    case 'variance': {
      // Welford's online algorithm for numerically stable variance
      return {
        count: 0,
        mean: 0,
        m2: 0,
        update(v: unknown) {
          if (typeof v === 'number') {
            this.count++;
            const delta = v - this.mean;
            this.mean += delta / this.count;
            const delta2 = v - this.mean;
            this.m2 += delta * delta2;
          }
        },
        finalize() {
          if (this.count < 2) return null;
          return this.m2 / this.count;
        },
      };
    }

    default:
      // Return a no-op aggregator for unknown functions
      return {
        update() {},
        finalize() {
          return null;
        },
      };
  }
}

/**
 * Compute a single aggregate value over rows.
 * This function is kept for backward compatibility but now uses the aggregator pattern internally.
 */
export function computeAggregate(
  rows: Record<string, unknown>[],
  spec: AggregateSpec
): unknown {
  const { function: fn, column } = spec;
  const isCountStar = fn === 'count' && (column === null || column === undefined);

  const aggregator = createAggregator(spec, isCountStar);
  const getVal = (row: Record<string, unknown>): unknown =>
    column ? getNestedValue(row, column) : null;

  for (const row of rows) {
    aggregator.update(isCountStar ? undefined : getVal(row));
  }

  return aggregator.finalize();
}

/**
 * Compute multiple aggregates over rows in a single pass.
 * This is much more efficient than calling computeAggregate multiple times.
 */
function computeAggregatesSinglePass(
  rows: Record<string, unknown>[],
  specs: AggregateSpec[]
): unknown[] {
  // Create aggregators and column accessors for each spec
  const aggregators: Aggregator[] = [];
  const getters: Array<(row: Record<string, unknown>) => unknown> = [];
  const isCountStars: boolean[] = [];

  for (const spec of specs) {
    const isCountStar = spec.function === 'count' && (spec.column === null || spec.column === undefined);
    isCountStars.push(isCountStar);
    aggregators.push(createAggregator(spec, isCountStar));
    getters.push(
      isCountStar
        ? () => undefined
        : spec.column
          ? (row: Record<string, unknown>) => getNestedValue(row, spec.column!)
          : () => null
    );
  }

  // Single pass over all rows
  for (const row of rows) {
    for (let i = 0; i < aggregators.length; i++) {
      aggregators[i].update(getters[i](row));
    }
  }

  // Finalize all aggregators
  return aggregators.map(agg => agg.finalize());
}

/**
 * Compute aggregations over rows, optionally grouped.
 * Uses single-pass aggregation for efficiency - all aggregates are computed
 * in a single iteration over each group's rows.
 */
export function computeAggregations(
  rows: Record<string, unknown>[],
  aggregates: AggregateSpec[],
  groupBy?: string[]
): { columns: string[]; rows: unknown[][] } {
  // Build result columns
  const resultColumns: string[] = [];
  if (groupBy) {
    resultColumns.push(...groupBy);
  }
  resultColumns.push(...aggregates.map(a => a.alias));

  // Pre-compute aggregator setup (column accessors)
  const aggSetup = aggregates.map(spec => ({
    spec,
    isCountStar: spec.function === 'count' && (spec.column === null || spec.column === undefined),
    getter: spec.column
      ? (row: Record<string, unknown>) => getNestedValue(row, spec.column!)
      : () => null,
  }));

  if (groupBy && groupBy.length > 0) {
    // Grouped aggregation - compute aggregates per group in single pass
    // Map: groupKey -> { groupByValues, aggregators }
    const groups = new Map<string, {
      groupByValues: unknown[];
      aggregators: Aggregator[];
    }>();

    for (const row of rows) {
      const key = groupBy.map(col => String(getNestedValue(row, col))).join('|');

      if (!groups.has(key)) {
        // First row in this group - initialize aggregators
        groups.set(key, {
          groupByValues: groupBy.map(col => getNestedValue(row, col)),
          aggregators: aggSetup.map(({ spec, isCountStar }) =>
            createAggregator(spec, isCountStar)
          ),
        });
      }

      const group = groups.get(key)!;

      // Update all aggregators for this row
      for (let i = 0; i < aggSetup.length; i++) {
        const { isCountStar, getter } = aggSetup[i];
        group.aggregators[i].update(isCountStar ? undefined : getter(row));
      }
    }

    // Build result rows
    const resultRows: unknown[][] = [];
    for (const [, { groupByValues, aggregators }] of groups) {
      const resultRow: unknown[] = [...groupByValues];
      for (const agg of aggregators) {
        resultRow.push(agg.finalize());
      }
      resultRows.push(resultRow);
    }

    return { columns: resultColumns, rows: resultRows };
  } else {
    // No groupBy - single group, use optimized single-pass
    const values = computeAggregatesSinglePass(rows, aggregates);
    return { columns: resultColumns, rows: [values] };
  }
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
  validateColumnName,
};
