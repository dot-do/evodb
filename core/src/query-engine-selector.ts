/**
 * @evodb/core - Query Engine Auto-Selection
 *
 * Selects between Reader (basic) and Query (advanced) engines based on simple heuristics.
 *
 * Query Engine: >5 predicates, aggregations, GROUP BY, or explicit hints
 * Reader Engine: Everything else (simple lookups)
 */

import type { ExecutorQuery } from './query-executor.js';

export type { ExecutorQuery } from './query-executor.js';

/** Engine types for selection */
export enum EngineType {
  Reader = 'reader',
  Query = 'query',
}

/** Engine selection result with reason */
export interface EngineSelectionResult {
  engine: EngineType;
  reason: string;
}

/** Threshold for predicate count to use query engine */
const PREDICATE_THRESHOLD = 5;

/**
 * Select the optimal query engine based on simple heuristics.
 */
export function selectQueryEngine(query: ExecutorQuery): EngineSelectionResult {
  const hints = query.hints ?? {};

  // Forced engine selection
  if (hints.forceEngine === 'reader') {
    return { engine: EngineType.Reader, reason: 'Forced by forceEngine hint' };
  }
  if (hints.forceEngine === 'query') {
    return { engine: EngineType.Query, reason: 'Forced by forceEngine hint' };
  }

  // Explicit optimization hints
  if (hints.useZoneMaps === true) {
    return { engine: EngineType.Query, reason: 'Zone maps requested via hint' };
  }
  if (hints.useBloomFilters === true) {
    return { engine: EngineType.Query, reason: 'Bloom filters requested via hint' };
  }

  const predicates = query.predicates ?? [];
  const aggregations = query.aggregations ?? [];
  const groupBy = query.groupBy ?? [];

  // Complex operations need Query engine
  if (predicates.length > PREDICATE_THRESHOLD) {
    return { engine: EngineType.Query, reason: `Many predicates (${predicates.length} > ${PREDICATE_THRESHOLD})` };
  }
  if (aggregations.length > 0) {
    return { engine: EngineType.Query, reason: `Has aggregations (${aggregations.length})` };
  }
  if (groupBy.length > 0) {
    return { engine: EngineType.Query, reason: `Has GROUP BY (${groupBy.length} columns)` };
  }

  // Simple lookups use Reader
  return { engine: EngineType.Reader, reason: 'Simple query' };
}

/** Check if query needs advanced engine */
export function needsQueryEngine(query: ExecutorQuery): boolean {
  return selectQueryEngine(query).engine === EngineType.Query;
}
