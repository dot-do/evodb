/**
 * @evodb/core - Query Engine Auto-Selection
 *
 * Automatically selects between Reader (basic) and Query (advanced) engines
 * based on query complexity analysis.
 *
 * ## Selection Criteria
 *
 * ### Reader Engine (Simple/Basic)
 * - No zone maps needed
 * - Less than 10 predicates
 * - No bloom filter hints
 * - Simple aggregations without complex grouping
 * - Small to medium result sets with LIMIT
 *
 * ### Query Engine (Complex/Advanced)
 * - Zone map optimization beneficial (range queries on large datasets)
 * - Bloom filter optimization beneficial (point lookups on high-cardinality columns)
 * - 10+ predicates
 * - Complex aggregations with multiple group by columns
 * - Large result sets without LIMIT
 * - Explicit hints requesting advanced features
 *
 * @example
 * ```typescript
 * import { selectQueryEngine, EngineType } from '@evodb/core';
 *
 * const query = {
 *   table: 'users',
 *   predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
 *   columns: ['id', 'name'],
 *   limit: 100,
 * };
 *
 * const result = selectQueryEngine(query);
 * if (result.engine === EngineType.Reader) {
 *   // Use @evodb/reader
 * } else {
 *   // Use @evodb/query
 * }
 * ```
 */

import type { ExecutorQuery, ExecutorPredicate } from './query-executor.js';

// Re-export ExecutorQuery for convenience
export type { ExecutorQuery } from './query-executor.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Threshold for predicate count to consider query complex
 */
const PREDICATE_COMPLEXITY_THRESHOLD = 10;

/**
 * Threshold for predicate count to consider query moderate
 */
const PREDICATE_MODERATE_THRESHOLD = 5;

/**
 * Threshold for aggregation count to consider query complex
 */
const AGGREGATION_COMPLEXITY_THRESHOLD = 4;

/**
 * Threshold for estimated rows to consider query complex
 */
const ESTIMATED_ROWS_COMPLEXITY_THRESHOLD = 100000;

/**
 * Threshold for group by columns to consider query complex
 */
const GROUP_BY_COMPLEXITY_THRESHOLD = 2;

// =============================================================================
// Types
// =============================================================================

/**
 * Query complexity levels
 */
export enum QueryComplexity {
  /** Simple query - few predicates, no advanced features */
  Simple = 0,
  /** Moderate query - some predicates, basic aggregations */
  Moderate = 1,
  /** Complex query - many predicates, advanced features needed */
  Complex = 2,
}

/**
 * Engine types for selection
 */
export enum EngineType {
  /** Basic reader engine - @evodb/reader */
  Reader = 'reader',
  /** Advanced query engine - @evodb/query */
  Query = 'query',
}

/**
 * Query complexity analysis result
 */
export interface QueryComplexityAnalysis {
  /** Overall complexity level */
  complexity: QueryComplexity;

  /** Number of filter predicates */
  predicateCount: number;

  /** Number of aggregations */
  aggregationCount: number;

  /** Whether query has GROUP BY */
  hasGroupBy: boolean;

  /** Number of GROUP BY columns */
  groupByCount: number;

  /** Whether query has range predicates (BETWEEN, GT, LT, etc.) */
  hasRangePredicates: boolean;

  /** Whether query has point lookup predicates (EQ on likely high-cardinality columns) */
  hasPointLookups: boolean;

  /** Whether query has negated predicates */
  hasNegatedPredicates: boolean;

  /** Whether zone maps would be beneficial */
  needsZoneMaps: boolean;

  /** Whether bloom filters would be beneficial */
  needsBloomFilters: boolean;

  /** Whether query has a LIMIT clause */
  hasLimit: boolean;

  /** Estimated result rows (if provided in hints) */
  estimatedRows?: number;

  /** Complexity score (0-100) */
  score: number;
}

/**
 * Engine selection result
 */
export interface EngineSelectionResult {
  /** Selected engine type */
  engine: EngineType;

  /** Whether selection was forced by hints */
  forced: boolean;

  /** Reason for selection */
  reason: string;

  /** Selection criteria that matched */
  criteria: string;

  /** Full complexity analysis */
  analysis: QueryComplexityAnalysis;

  /** Recommendations for query optimization */
  recommendations?: string[];
}

// =============================================================================
// Query Complexity Analysis
// =============================================================================

/**
 * Analyze query complexity to determine optimal engine selection.
 *
 * @param query - The query to analyze
 * @returns Complexity analysis result
 */
export function analyzeQueryComplexity(query: ExecutorQuery): QueryComplexityAnalysis {
  const predicates = query.predicates ?? [];
  const aggregations = query.aggregations ?? [];
  const groupBy = query.groupBy ?? [];
  const hints = query.hints ?? {};

  // Count predicates
  const predicateCount = predicates.length;

  // Count aggregations
  const aggregationCount = aggregations.length;

  // Check for GROUP BY
  const hasGroupBy = groupBy.length > 0;
  const groupByCount = groupBy.length;

  // Check for range predicates
  const hasRangePredicates = predicates.some(isRangePredicate);

  // Check for point lookups (equality on string columns, common for high-cardinality)
  const hasPointLookups = predicates.some(isPointLookup);

  // Check for negated predicates
  const hasNegatedPredicates = predicates.some((p) => p.not === true);

  // Check for LIMIT
  const hasLimit = query.limit !== undefined && query.limit > 0;

  // Get estimated rows from hints
  const estimatedRows = typeof hints.estimatedRows === 'number' ? hints.estimatedRows : undefined;

  // Determine if zone maps are needed (only when explicitly requested via hints)
  const needsZoneMaps = hints.useZoneMaps === true;

  // Determine if bloom filters are needed (only when explicitly requested via hints)
  const needsBloomFilters = hints.useBloomFilters === true;

  // Calculate complexity score (0-100)
  let score = 0;

  // Predicate count contribution (max 30) - reduced weight
  score += Math.min(30, predicateCount * 2.5);

  // Aggregation contribution (max 20) - complex aggregations add more
  if (aggregationCount >= AGGREGATION_COMPLEXITY_THRESHOLD) {
    score += 20;
  } else {
    score += Math.min(15, aggregationCount * 3);
  }

  // Group by contribution (max 15)
  score += Math.min(15, groupByCount * 5);

  // Multiple group by columns with aggregations = complex
  if (groupByCount >= GROUP_BY_COMPLEXITY_THRESHOLD && aggregationCount >= 3) {
    score += 15;
  }

  // Range predicate contribution (only moderate, not complex by itself)
  if (hasRangePredicates) score += 5;

  // No limit on large dataset contribution (25 - this is significant)
  if (!hasLimit && estimatedRows && estimatedRows > ESTIMATED_ROWS_COMPLEXITY_THRESHOLD) {
    score += 25;
  }

  // Explicit hints contribution (25 each - these push to complex)
  if (hints.useZoneMaps === true) score += 25;
  if (hints.useBloomFilters === true) score += 25;

  // Large estimated rows contribution (significant)
  if (estimatedRows && estimatedRows > ESTIMATED_ROWS_COMPLEXITY_THRESHOLD) {
    score += 20;
  }

  // Determine complexity level
  let complexity: QueryComplexity;

  // Complex: explicit hints, many predicates, or high score
  if (
    needsZoneMaps ||
    needsBloomFilters ||
    predicateCount >= PREDICATE_COMPLEXITY_THRESHOLD ||
    (aggregationCount >= AGGREGATION_COMPLEXITY_THRESHOLD && groupByCount >= GROUP_BY_COMPLEXITY_THRESHOLD) ||
    score >= 50
  ) {
    complexity = QueryComplexity.Complex;
  }
  // Moderate: several predicates, has group by, or range predicates
  else if (
    predicateCount >= PREDICATE_MODERATE_THRESHOLD ||
    (hasGroupBy && aggregationCount > 0) ||
    hasRangePredicates ||
    score >= 20
  ) {
    complexity = QueryComplexity.Moderate;
  }
  // Simple: everything else
  else {
    complexity = QueryComplexity.Simple;
  }

  return {
    complexity,
    predicateCount,
    aggregationCount,
    hasGroupBy,
    groupByCount,
    hasRangePredicates,
    hasPointLookups,
    hasNegatedPredicates,
    needsZoneMaps,
    needsBloomFilters,
    hasLimit,
    estimatedRows,
    score,
  };
}

/**
 * Check if a predicate is a range predicate (benefits from zone maps)
 */
function isRangePredicate(predicate: ExecutorPredicate): boolean {
  return (
    predicate.operator === 'between' ||
    predicate.operator === 'gt' ||
    predicate.operator === 'gte' ||
    predicate.operator === 'ge' ||
    predicate.operator === 'lt' ||
    predicate.operator === 'lte' ||
    predicate.operator === 'le'
  );
}

/**
 * Check if a predicate is a point lookup (benefits from bloom filters)
 */
function isPointLookup(predicate: ExecutorPredicate): boolean {
  return predicate.operator === 'eq' && predicate.value !== undefined;
}

// =============================================================================
// Engine Selection
// =============================================================================

/**
 * Select the optimal query engine based on query complexity.
 *
 * @param query - The query to analyze
 * @returns Engine selection result with analysis and recommendations
 */
export function selectQueryEngine(query: ExecutorQuery): EngineSelectionResult {
  const hints = query.hints ?? {};

  // Check for forced engine selection
  if (hints.forceEngine === 'reader') {
    return {
      engine: EngineType.Reader,
      forced: true,
      reason: 'Engine forced to Reader by query hint',
      criteria: 'forceEngine=reader hint',
      analysis: analyzeQueryComplexity(query),
      recommendations: ['Consider removing forceEngine hint to allow automatic selection'],
    };
  }

  if (hints.forceEngine === 'query') {
    return {
      engine: EngineType.Query,
      forced: true,
      reason: 'Engine forced to Query by query hint',
      criteria: 'forceEngine=query hint',
      analysis: analyzeQueryComplexity(query),
      recommendations: ['Consider removing forceEngine hint to allow automatic selection'],
    };
  }

  // Analyze query complexity
  const analysis = analyzeQueryComplexity(query);
  const recommendations: string[] = [];

  // Select engine based on analysis
  let engine: EngineType;
  let reason: string;
  let criteria: string;

  // Complex queries always use Query engine
  if (analysis.complexity === QueryComplexity.Complex) {
    engine = EngineType.Query;

    const reasons: string[] = [];
    if (analysis.predicateCount >= PREDICATE_COMPLEXITY_THRESHOLD) {
      reasons.push(`${analysis.predicateCount} predicates (threshold: ${PREDICATE_COMPLEXITY_THRESHOLD})`);
    }
    if (analysis.needsZoneMaps) {
      reasons.push('zone map optimization beneficial');
    }
    if (analysis.needsBloomFilters) {
      reasons.push('bloom filter optimization beneficial');
    }
    if (analysis.aggregationCount >= AGGREGATION_COMPLEXITY_THRESHOLD) {
      reasons.push(`${analysis.aggregationCount} aggregations`);
    }
    if (analysis.groupByCount >= GROUP_BY_COMPLEXITY_THRESHOLD) {
      reasons.push(`GROUP BY with ${analysis.groupByCount} columns`);
    }
    if (analysis.estimatedRows && analysis.estimatedRows > ESTIMATED_ROWS_COMPLEXITY_THRESHOLD) {
      reasons.push(`estimated ${analysis.estimatedRows.toLocaleString()} rows`);
    }

    reason = `Query is complex: ${reasons.join(', ')}`;
    criteria = reasons.join('; ');

    // Add recommendations
    if (!analysis.hasLimit && analysis.estimatedRows && analysis.estimatedRows > 10000) {
      recommendations.push('Consider adding LIMIT to reduce result set size');
    }
  }
  // Simple and moderate queries use Reader engine (unless advanced features needed)
  else {
    engine = EngineType.Reader;

    const simpleReasons: string[] = [];
    simpleReasons.push(`${analysis.predicateCount} predicate(s)`);
    if (analysis.hasLimit) {
      simpleReasons.push(`LIMIT ${query.limit}`);
    }
    if (analysis.aggregationCount > 0) {
      simpleReasons.push(`${analysis.aggregationCount} simple aggregation(s)`);
    }

    reason = `Query is simple/moderate: ${simpleReasons.join(', ')}`;
    criteria = simpleReasons.join('; ');

    // Add recommendations for moderate queries that could benefit from advanced features
    if (analysis.complexity === QueryComplexity.Moderate) {
      if (analysis.hasRangePredicates) {
        recommendations.push('Consider using Query engine with zone maps for range predicates on large datasets');
      }
      if (analysis.hasPointLookups && analysis.predicateCount > 2) {
        recommendations.push('Consider using Query engine with bloom filters for point lookups');
      }
      if (analysis.hasGroupBy && analysis.aggregationCount > 1) {
        recommendations.push('Consider using Query engine for complex aggregations');
      }
    }
  }

  return {
    engine,
    forced: false,
    reason,
    criteria,
    analysis,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a query would benefit from zone map optimization.
 *
 * Zone maps store min/max values per partition/block and allow
 * skipping entire partitions when the query range doesn't overlap.
 *
 * @param query - The query to check
 * @returns true if zone maps would be beneficial
 */
export function wouldBenefitFromZoneMaps(query: ExecutorQuery): boolean {
  const analysis = analyzeQueryComplexity(query);
  return analysis.needsZoneMaps;
}

/**
 * Check if a query would benefit from bloom filter optimization.
 *
 * Bloom filters allow quick "definitely not present" checks for
 * point lookups, avoiding unnecessary partition scans.
 *
 * @param query - The query to check
 * @returns true if bloom filters would be beneficial
 */
export function wouldBenefitFromBloomFilters(query: ExecutorQuery): boolean {
  const analysis = analyzeQueryComplexity(query);
  return analysis.needsBloomFilters;
}

/**
 * Get a human-readable description of why an engine was selected.
 *
 * @param result - The engine selection result
 * @returns Human-readable description
 */
export function getSelectionDescription(result: EngineSelectionResult): string {
  const lines: string[] = [];

  lines.push(`Selected Engine: ${result.engine === EngineType.Reader ? 'Reader (@evodb/reader)' : 'Query (@evodb/query)'}`);

  if (result.forced) {
    lines.push(`  (Forced by hint)`);
  }

  lines.push(`  Reason: ${result.reason}`);
  lines.push(`  Complexity: ${QueryComplexity[result.analysis.complexity]} (score: ${result.analysis.score}/100)`);

  if (result.recommendations && result.recommendations.length > 0) {
    lines.push('  Recommendations:');
    for (const rec of result.recommendations) {
      lines.push(`    - ${rec}`);
    }
  }

  return lines.join('\n');
}
