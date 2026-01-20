/**
 * @evodb/core - Shared Query Operations
 *
 * Consolidated filter evaluation, sorting, and aggregation logic
 * used by both @evodb/query and @evodb/reader packages.
 *
 * This module reduces code duplication and ensures consistent behavior
 * across query engines.
 */
/**
 * Supported filter/predicate operators
 */
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'ge' | 'lt' | 'lte' | 'le' | 'in' | 'notIn' | 'between' | 'like' | 'isNull' | 'isNotNull';
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
export type AggregateFunction = 'count' | 'countDistinct' | 'sum' | 'sumDistinct' | 'avg' | 'avgDistinct' | 'min' | 'max' | 'first' | 'last' | 'stddev' | 'variance';
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
    aggregate(rows: Record<string, unknown>[], aggregates: AggregateSpec[], groupBy?: string[]): {
        columns: string[];
        rows: unknown[][];
    };
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
/**
 * Get nested value from object using dot notation
 */
export declare function getNestedValue(obj: Record<string, unknown>, path: string): unknown;
/**
 * Set nested value in object using dot notation
 */
export declare function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void;
/**
 * Convert SQL LIKE pattern to RegExp
 * % matches any sequence, _ matches single char
 */
export declare function likePatternToRegex(pattern: string): RegExp;
/**
 * Compare two values for sorting or filtering
 * Returns negative if a < b, positive if a > b, 0 if equal
 */
export declare function compareValues(a: unknown, b: unknown): number;
/**
 * Evaluate a single filter predicate against a value
 */
export declare function evaluateFilter(value: unknown, filter: FilterPredicate): boolean;
/**
 * Evaluate all filters against a row (AND logic)
 */
export declare function evaluateFilters(row: Record<string, unknown>, filters: FilterPredicate[]): boolean;
/**
 * Create a filter evaluator instance
 */
export declare function createFilterEvaluator(): FilterEvaluator;
/**
 * Compare values for sorting with direction and null handling
 */
export declare function compareForSort(a: unknown, b: unknown, direction: SortDirection, nullsFirst?: boolean): number;
/**
 * Sort rows by multiple columns
 */
export declare function sortRows<T extends Record<string, unknown>>(rows: T[], orderBy: SortSpec[]): T[];
/**
 * Apply limit and offset to rows
 */
export declare function limitRows<T>(rows: T[], limit: number, offset?: number): T[];
/**
 * Create a result processor instance
 */
export declare function createResultProcessor(): ResultProcessor;
/**
 * Compute a single aggregate value over rows
 */
export declare function computeAggregate(rows: Record<string, unknown>[], spec: AggregateSpec): unknown;
/**
 * Compute aggregations over rows, optionally grouped
 */
export declare function computeAggregations(rows: Record<string, unknown>[], aggregates: AggregateSpec[], groupBy?: string[]): {
    columns: string[];
    rows: unknown[][];
};
/**
 * Create an aggregation engine instance
 */
export declare function createAggregationEngine(): AggregationEngine;
/**
 * All-in-one query operations for simple use cases
 */
export declare const queryOps: {
    evaluateFilter: typeof evaluateFilter;
    evaluateFilters: typeof evaluateFilters;
    createFilterEvaluator: typeof createFilterEvaluator;
    sortRows: typeof sortRows;
    limitRows: typeof limitRows;
    compareForSort: typeof compareForSort;
    compareValues: typeof compareValues;
    createResultProcessor: typeof createResultProcessor;
    computeAggregate: typeof computeAggregate;
    computeAggregations: typeof computeAggregations;
    createAggregationEngine: typeof createAggregationEngine;
    getNestedValue: typeof getNestedValue;
    setNestedValue: typeof setNestedValue;
    likePatternToRegex: typeof likePatternToRegex;
};
//# sourceMappingURL=query-ops.d.ts.map