/**
 * ClickBench Query Definitions
 *
 * This file defines the standard 43 ClickBench queries adapted for EvoDB.
 * These queries test various database capabilities:
 * - Full table scans
 * - Filtered scans with predicates
 * - Aggregations (COUNT, SUM, AVG, MIN, MAX)
 * - GROUP BY operations
 * - DISTINCT counts
 * - String operations (LIKE)
 * - Sorting and LIMIT
 * - Multi-column aggregations
 *
 * @see https://github.com/ClickHouse/ClickBench
 */

import type { Column } from '@evodb/core';

/**
 * Query types for categorization
 */
export type QueryType =
  | 'count'
  | 'aggregation'
  | 'group_by'
  | 'distinct'
  | 'filter'
  | 'string_match'
  | 'sort'
  | 'complex';

/**
 * Query complexity levels
 */
export type QueryComplexity = 'simple' | 'medium' | 'complex';

/**
 * Query definition with metadata
 */
export interface ClickBenchQuery {
  /** Query ID (Q0-Q42) */
  id: string;
  /** SQL representation */
  sql: string;
  /** Query type for categorization */
  type: QueryType;
  /** Complexity level */
  complexity: QueryComplexity;
  /** Columns accessed by this query */
  columns: string[];
  /** Description of what the query tests */
  description: string;
  /** Whether this query can be parallelized */
  parallelizable: boolean;
  /** Expected ClickHouse baseline time (seconds) on c6a.4xlarge */
  clickhouseBaselineSec?: number;
}

/**
 * Aggregate function types
 */
export type AggregateFunction = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'countDistinct';

/**
 * Filter predicate for columnar execution
 */
export interface FilterPredicate {
  column: string;
  operator: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'like' | 'between';
  value: unknown;
  value2?: unknown; // For BETWEEN
}

/**
 * Aggregate specification for columnar execution
 */
export interface AggregateSpec {
  function: AggregateFunction;
  column?: string; // undefined for COUNT(*)
  alias?: string;
}

/**
 * Group by specification
 */
export interface GroupBySpec {
  columns: string[];
  aggregates: AggregateSpec[];
  orderBy?: { column: string; desc: boolean }[];
  limit?: number;
  offset?: number;
}

/**
 * Executable query plan for EvoDB
 */
export interface QueryPlan {
  /** Original query definition */
  query: ClickBenchQuery;
  /** Columns to project */
  projection: string[];
  /** Filter predicates (ANDed together) */
  filters: FilterPredicate[];
  /** Aggregations to compute */
  aggregates: AggregateSpec[];
  /** Group by specification */
  groupBy?: GroupBySpec;
  /** Result limit */
  limit?: number;
  /** Result offset */
  offset?: number;
}

/**
 * All 43 ClickBench queries
 */
export const CLICKBENCH_QUERIES: ClickBenchQuery[] = [
  // Q0: Simple count
  {
    id: 'Q0',
    sql: 'SELECT COUNT(*) FROM hits',
    type: 'count',
    complexity: 'simple',
    columns: [],
    description: 'Simple row count - tests metadata access',
    parallelizable: true,
    clickhouseBaselineSec: 0.003,
  },

  // Q1: Count with filter
  {
    id: 'Q1',
    sql: 'SELECT COUNT(*) FROM hits WHERE AdvEngineID <> 0',
    type: 'filter',
    complexity: 'simple',
    columns: ['AdvEngineID'],
    description: 'Filtered count - tests predicate evaluation',
    parallelizable: true,
    clickhouseBaselineSec: 0.021,
  },

  // Q2: Multiple aggregations
  {
    id: 'Q2',
    sql: 'SELECT SUM(AdvEngineID), COUNT(*), AVG(ResolutionWidth) FROM hits',
    type: 'aggregation',
    complexity: 'simple',
    columns: ['AdvEngineID', 'ResolutionWidth'],
    description: 'Multiple aggregations on full table',
    parallelizable: true,
    clickhouseBaselineSec: 0.039,
  },

  // Q3: Average on high cardinality column
  {
    id: 'Q3',
    sql: 'SELECT AVG(UserID) FROM hits',
    type: 'aggregation',
    complexity: 'simple',
    columns: ['UserID'],
    description: 'Average on 64-bit column',
    parallelizable: true,
    clickhouseBaselineSec: 0.024,
  },

  // Q4: Count distinct
  {
    id: 'Q4',
    sql: 'SELECT COUNT(DISTINCT UserID) FROM hits',
    type: 'distinct',
    complexity: 'medium',
    columns: ['UserID'],
    description: 'Distinct count on high cardinality column',
    parallelizable: true, // Can use HyperLogLog
    clickhouseBaselineSec: 0.182,
  },

  // Q5: Count distinct on string
  {
    id: 'Q5',
    sql: 'SELECT COUNT(DISTINCT SearchPhrase) FROM hits',
    type: 'distinct',
    complexity: 'medium',
    columns: ['SearchPhrase'],
    description: 'Distinct count on string column',
    parallelizable: true,
    clickhouseBaselineSec: 0.298,
  },

  // Q6: Min/Max on date
  {
    id: 'Q6',
    sql: 'SELECT MIN(EventDate), MAX(EventDate) FROM hits',
    type: 'aggregation',
    complexity: 'simple',
    columns: ['EventDate'],
    description: 'Date range - tests zone map usage',
    parallelizable: true,
    clickhouseBaselineSec: 0.002,
  },

  // Q7: Group by with order
  {
    id: 'Q7',
    sql: 'SELECT AdvEngineID, COUNT(*) FROM hits WHERE AdvEngineID <> 0 GROUP BY AdvEngineID ORDER BY COUNT(*) DESC',
    type: 'group_by',
    complexity: 'medium',
    columns: ['AdvEngineID'],
    description: 'Low cardinality GROUP BY with filter',
    parallelizable: true,
    clickhouseBaselineSec: 0.023,
  },

  // Q8: Group by with distinct and limit
  {
    id: 'Q8',
    sql: 'SELECT RegionID, COUNT(DISTINCT UserID) AS u FROM hits GROUP BY RegionID ORDER BY u DESC LIMIT 10',
    type: 'group_by',
    complexity: 'complex',
    columns: ['RegionID', 'UserID'],
    description: 'Group by with distinct count and top-K',
    parallelizable: true,
    clickhouseBaselineSec: 0.456,
  },

  // Q9: Multi-aggregate group by
  {
    id: 'Q9',
    sql: 'SELECT RegionID, SUM(AdvEngineID), COUNT(*) AS c, AVG(ResolutionWidth), COUNT(DISTINCT UserID) FROM hits GROUP BY RegionID ORDER BY c DESC LIMIT 10',
    type: 'group_by',
    complexity: 'complex',
    columns: ['RegionID', 'AdvEngineID', 'ResolutionWidth', 'UserID'],
    description: 'Multiple aggregations per group',
    parallelizable: true,
    clickhouseBaselineSec: 0.512,
  },

  // Q10: String filter group by
  {
    id: 'Q10',
    sql: "SELECT MobilePhoneModel, COUNT(DISTINCT UserID) AS u FROM hits WHERE MobilePhoneModel <> '' GROUP BY MobilePhoneModel ORDER BY u DESC LIMIT 10",
    type: 'group_by',
    complexity: 'complex',
    columns: ['MobilePhoneModel', 'UserID'],
    description: 'String non-empty filter with group by',
    parallelizable: true,
    clickhouseBaselineSec: 0.198,
  },

  // Q11: Two-column group by
  {
    id: 'Q11',
    sql: "SELECT MobilePhone, MobilePhoneModel, COUNT(DISTINCT UserID) AS u FROM hits WHERE MobilePhoneModel <> '' GROUP BY MobilePhone, MobilePhoneModel ORDER BY u DESC LIMIT 10",
    type: 'group_by',
    complexity: 'complex',
    columns: ['MobilePhone', 'MobilePhoneModel', 'UserID'],
    description: 'Multi-column group by with distinct',
    parallelizable: true,
    clickhouseBaselineSec: 0.234,
  },

  // Q12: Search phrase aggregation
  {
    id: 'Q12',
    sql: "SELECT SearchPhrase, COUNT(*) AS c FROM hits WHERE SearchPhrase <> '' GROUP BY SearchPhrase ORDER BY c DESC LIMIT 10",
    type: 'group_by',
    complexity: 'medium',
    columns: ['SearchPhrase'],
    description: 'High cardinality string group by',
    parallelizable: true,
    clickhouseBaselineSec: 0.387,
  },

  // Q13: Search phrase with distinct users
  {
    id: 'Q13',
    sql: "SELECT SearchPhrase, COUNT(DISTINCT UserID) AS u FROM hits WHERE SearchPhrase <> '' GROUP BY SearchPhrase ORDER BY u DESC LIMIT 10",
    type: 'group_by',
    complexity: 'complex',
    columns: ['SearchPhrase', 'UserID'],
    description: 'String group by with distinct count',
    parallelizable: true,
    clickhouseBaselineSec: 0.623,
  },

  // Q14: Two-column string group by
  {
    id: 'Q14',
    sql: "SELECT SearchEngineID, SearchPhrase, COUNT(*) AS c FROM hits WHERE SearchPhrase <> '' GROUP BY SearchEngineID, SearchPhrase ORDER BY c DESC LIMIT 10",
    type: 'group_by',
    complexity: 'complex',
    columns: ['SearchEngineID', 'SearchPhrase'],
    description: 'Mixed cardinality group by',
    parallelizable: true,
    clickhouseBaselineSec: 0.445,
  },

  // Q15: High cardinality group by
  {
    id: 'Q15',
    sql: 'SELECT UserID, COUNT(*) FROM hits GROUP BY UserID ORDER BY COUNT(*) DESC LIMIT 10',
    type: 'group_by',
    complexity: 'complex',
    columns: ['UserID'],
    description: 'Very high cardinality group by',
    parallelizable: true,
    clickhouseBaselineSec: 0.756,
  },

  // Q16: Two high cardinality columns
  {
    id: 'Q16',
    sql: 'SELECT UserID, SearchPhrase, COUNT(*) FROM hits GROUP BY UserID, SearchPhrase ORDER BY COUNT(*) DESC LIMIT 10',
    type: 'group_by',
    complexity: 'complex',
    columns: ['UserID', 'SearchPhrase'],
    description: 'Two high cardinality columns',
    parallelizable: true,
    clickhouseBaselineSec: 1.234,
  },

  // Q17: Without ordering
  {
    id: 'Q17',
    sql: 'SELECT UserID, SearchPhrase, COUNT(*) FROM hits GROUP BY UserID, SearchPhrase LIMIT 10',
    type: 'group_by',
    complexity: 'medium',
    columns: ['UserID', 'SearchPhrase'],
    description: 'Group by without sort',
    parallelizable: true,
    clickhouseBaselineSec: 0.987,
  },

  // Q18: Three columns with time extraction
  {
    id: 'Q18',
    sql: 'SELECT UserID, extract(minute FROM EventTime) AS m, SearchPhrase, COUNT(*) FROM hits GROUP BY UserID, m, SearchPhrase ORDER BY COUNT(*) DESC LIMIT 10',
    type: 'group_by',
    complexity: 'complex',
    columns: ['UserID', 'EventTime', 'SearchPhrase'],
    description: 'Time extraction in group by',
    parallelizable: true,
    clickhouseBaselineSec: 1.456,
  },

  // Q19: Point lookup
  {
    id: 'Q19',
    sql: 'SELECT UserID FROM hits WHERE UserID = 435090932899640449',
    type: 'filter',
    complexity: 'simple',
    columns: ['UserID'],
    description: 'Point lookup on primary key',
    parallelizable: true,
    clickhouseBaselineSec: 0.048,
  },

  // Q20: String LIKE filter
  {
    id: 'Q20',
    sql: "SELECT COUNT(*) FROM hits WHERE URL LIKE '%google%'",
    type: 'string_match',
    complexity: 'medium',
    columns: ['URL'],
    description: 'Substring match on URL',
    parallelizable: true,
    clickhouseBaselineSec: 0.126,
  },

  // Q21: LIKE with group by
  {
    id: 'Q21',
    sql: "SELECT SearchPhrase, MIN(URL), COUNT(*) AS c FROM hits WHERE URL LIKE '%google%' AND SearchPhrase <> '' GROUP BY SearchPhrase ORDER BY c DESC LIMIT 10",
    type: 'complex',
    complexity: 'complex',
    columns: ['SearchPhrase', 'URL'],
    description: 'LIKE filter with aggregation',
    parallelizable: true,
    clickhouseBaselineSec: 0.234,
  },

  // Q22: Multiple string conditions
  {
    id: 'Q22',
    sql: "SELECT SearchPhrase, MIN(URL), MIN(Title), COUNT(*) AS c, COUNT(DISTINCT UserID) FROM hits WHERE Title LIKE '%Google%' AND URL NOT LIKE '%.google.%' AND SearchPhrase <> '' GROUP BY SearchPhrase ORDER BY c DESC LIMIT 10",
    type: 'complex',
    complexity: 'complex',
    columns: ['SearchPhrase', 'URL', 'Title', 'UserID'],
    description: 'Complex string matching',
    parallelizable: true,
    clickhouseBaselineSec: 0.567,
  },

  // Q23: Full row fetch with string filter
  {
    id: 'Q23',
    sql: "SELECT * FROM hits WHERE URL LIKE '%google%' ORDER BY EventTime LIMIT 10",
    type: 'complex',
    complexity: 'complex',
    columns: ['*'],
    description: 'Wide projection with filter and sort',
    parallelizable: false, // Full row construction
    clickhouseBaselineSec: 0.345,
  },

  // Q24: String sort
  {
    id: 'Q24',
    sql: "SELECT SearchPhrase FROM hits WHERE SearchPhrase <> '' ORDER BY EventTime LIMIT 10",
    type: 'sort',
    complexity: 'medium',
    columns: ['SearchPhrase', 'EventTime'],
    description: 'Filter with time-based sort',
    parallelizable: false,
    clickhouseBaselineSec: 0.178,
  },

  // Q25: String column sort
  {
    id: 'Q25',
    sql: "SELECT SearchPhrase FROM hits WHERE SearchPhrase <> '' ORDER BY SearchPhrase LIMIT 10",
    type: 'sort',
    complexity: 'medium',
    columns: ['SearchPhrase'],
    description: 'Sort on string column',
    parallelizable: false,
    clickhouseBaselineSec: 0.234,
  },

  // Q26: Two-column sort
  {
    id: 'Q26',
    sql: "SELECT SearchPhrase FROM hits WHERE SearchPhrase <> '' ORDER BY EventTime, SearchPhrase LIMIT 10",
    type: 'sort',
    complexity: 'complex',
    columns: ['SearchPhrase', 'EventTime'],
    description: 'Multi-column sort',
    parallelizable: false,
    clickhouseBaselineSec: 0.289,
  },

  // Q27: HAVING clause
  {
    id: 'Q27',
    sql: "SELECT CounterID, AVG(length(URL)) AS l, COUNT(*) AS c FROM hits WHERE URL <> '' GROUP BY CounterID HAVING COUNT(*) > 100000 ORDER BY l DESC LIMIT 25",
    type: 'complex',
    complexity: 'complex',
    columns: ['CounterID', 'URL'],
    description: 'HAVING filter on aggregation',
    parallelizable: true,
    clickhouseBaselineSec: 0.678,
  },

  // Q28: Regex extraction
  {
    id: 'Q28',
    sql: "SELECT REGEXP_REPLACE(Referer, '^https?://(?:www\\.)?([^/]+)/.*$', '\\1') AS k, AVG(length(Referer)) AS l, COUNT(*) AS c, MIN(Referer) FROM hits WHERE Referer <> '' GROUP BY k HAVING COUNT(*) > 100000 ORDER BY l DESC LIMIT 25",
    type: 'complex',
    complexity: 'complex',
    columns: ['Referer'],
    description: 'Regex extraction with aggregation',
    parallelizable: true,
    clickhouseBaselineSec: 1.234,
  },

  // Q29: Wide aggregation (many SUM columns)
  {
    id: 'Q29',
    sql: 'SELECT SUM(ResolutionWidth), SUM(ResolutionWidth + 1), SUM(ResolutionWidth + 2) /* ... 90 more SUM expressions */ FROM hits',
    type: 'aggregation',
    complexity: 'complex',
    columns: ['ResolutionWidth'],
    description: '90+ column aggregation',
    parallelizable: true,
    clickhouseBaselineSec: 0.456,
  },

  // Q30: Search with multiple aggregates
  {
    id: 'Q30',
    sql: "SELECT SearchEngineID, ClientIP, COUNT(*) AS c, SUM(IsRefresh), AVG(ResolutionWidth) FROM hits WHERE SearchPhrase <> '' GROUP BY SearchEngineID, ClientIP ORDER BY c DESC LIMIT 10",
    type: 'group_by',
    complexity: 'complex',
    columns: ['SearchEngineID', 'ClientIP', 'SearchPhrase', 'IsRefresh', 'ResolutionWidth'],
    description: 'Multi-aggregate group by with filter',
    parallelizable: true,
    clickhouseBaselineSec: 0.567,
  },

  // Q31: Very high cardinality group by
  {
    id: 'Q31',
    sql: "SELECT WatchID, ClientIP, COUNT(*) AS c, SUM(IsRefresh), AVG(ResolutionWidth) FROM hits WHERE SearchPhrase <> '' GROUP BY WatchID, ClientIP ORDER BY c DESC LIMIT 10",
    type: 'group_by',
    complexity: 'complex',
    columns: ['WatchID', 'ClientIP', 'SearchPhrase', 'IsRefresh', 'ResolutionWidth'],
    description: 'Unique key group by',
    parallelizable: true,
    clickhouseBaselineSec: 1.789,
  },

  // Q32: Unique key group by no filter
  {
    id: 'Q32',
    sql: 'SELECT WatchID, ClientIP, COUNT(*) AS c, SUM(IsRefresh), AVG(ResolutionWidth) FROM hits GROUP BY WatchID, ClientIP ORDER BY c DESC LIMIT 10',
    type: 'group_by',
    complexity: 'complex',
    columns: ['WatchID', 'ClientIP', 'IsRefresh', 'ResolutionWidth'],
    description: 'Unique key group by full scan',
    parallelizable: true,
    clickhouseBaselineSec: 2.134,
  },

  // Q33: URL group by
  {
    id: 'Q33',
    sql: 'SELECT URL, COUNT(*) AS c FROM hits GROUP BY URL ORDER BY c DESC LIMIT 10',
    type: 'group_by',
    complexity: 'complex',
    columns: ['URL'],
    description: 'High cardinality string group by',
    parallelizable: true,
    clickhouseBaselineSec: 0.987,
  },

  // Q34: Constant with URL
  {
    id: 'Q34',
    sql: 'SELECT 1, URL, COUNT(*) AS c FROM hits GROUP BY 1, URL ORDER BY c DESC LIMIT 10',
    type: 'group_by',
    complexity: 'complex',
    columns: ['URL'],
    description: 'Group by with constant',
    parallelizable: true,
    clickhouseBaselineSec: 1.012,
  },

  // Q35: Expression in group by
  {
    id: 'Q35',
    sql: 'SELECT ClientIP, ClientIP - 1, ClientIP - 2, ClientIP - 3, COUNT(*) AS c FROM hits GROUP BY ClientIP, ClientIP - 1, ClientIP - 2, ClientIP - 3 ORDER BY c DESC LIMIT 10',
    type: 'group_by',
    complexity: 'complex',
    columns: ['ClientIP'],
    description: 'Expressions in group by',
    parallelizable: true,
    clickhouseBaselineSec: 0.876,
  },

  // Q36: Time range filter
  {
    id: 'Q36',
    sql: "SELECT URL, COUNT(*) AS PageViews FROM hits WHERE CounterID = 62 AND EventDate >= '2013-07-01' AND EventDate <= '2013-07-31' AND DontCountHits = 0 AND IsRefresh = 0 AND URL <> '' GROUP BY URL ORDER BY PageViews DESC LIMIT 10",
    type: 'complex',
    complexity: 'complex',
    columns: ['URL', 'CounterID', 'EventDate', 'DontCountHits', 'IsRefresh'],
    description: 'Time range with multiple filters',
    parallelizable: true,
    clickhouseBaselineSec: 0.034,
  },

  // Q37: Title aggregation
  {
    id: 'Q37',
    sql: "SELECT Title, COUNT(*) AS PageViews FROM hits WHERE CounterID = 62 AND EventDate >= '2013-07-01' AND EventDate <= '2013-07-31' AND DontCountHits = 0 AND IsRefresh = 0 AND Title <> '' GROUP BY Title ORDER BY PageViews DESC LIMIT 10",
    type: 'complex',
    complexity: 'complex',
    columns: ['Title', 'CounterID', 'EventDate', 'DontCountHits', 'IsRefresh'],
    description: 'Title aggregation with date range',
    parallelizable: true,
    clickhouseBaselineSec: 0.045,
  },

  // Q38: Link tracking
  {
    id: 'Q38',
    sql: "SELECT URL, COUNT(*) AS PageViews FROM hits WHERE CounterID = 62 AND EventDate >= '2013-07-01' AND EventDate <= '2013-07-31' AND IsRefresh = 0 AND IsLink <> 0 AND IsDownload = 0 GROUP BY URL ORDER BY PageViews DESC LIMIT 10 OFFSET 1000",
    type: 'complex',
    complexity: 'complex',
    columns: ['URL', 'CounterID', 'EventDate', 'IsRefresh', 'IsLink', 'IsDownload'],
    description: 'Link tracking with offset',
    parallelizable: true,
    clickhouseBaselineSec: 0.056,
  },

  // Q39: Traffic source analysis
  {
    id: 'Q39',
    sql: "SELECT TraficSourceID, SearchEngineID, AdvEngineID, CASE WHEN (SearchEngineID = 0 AND AdvEngineID = 0) THEN Referer ELSE '' END AS Src, URL AS Dst, COUNT(*) AS PageViews FROM hits WHERE CounterID = 62 AND EventDate >= '2013-07-01' AND EventDate <= '2013-07-31' AND IsRefresh = 0 GROUP BY TraficSourceID, SearchEngineID, AdvEngineID, Src, Dst ORDER BY PageViews DESC LIMIT 10 OFFSET 1000",
    type: 'complex',
    complexity: 'complex',
    columns: ['TraficSourceID', 'SearchEngineID', 'AdvEngineID', 'Referer', 'URL', 'CounterID', 'EventDate', 'IsRefresh'],
    description: 'Complex traffic source analysis',
    parallelizable: true,
    clickhouseBaselineSec: 0.123,
  },

  // Q40: URL hash grouping
  {
    id: 'Q40',
    sql: "SELECT URLHash, EventDate, COUNT(*) AS PageViews FROM hits WHERE CounterID = 62 AND EventDate >= '2013-07-01' AND EventDate <= '2013-07-31' AND IsRefresh = 0 AND TraficSourceID IN (-1, 6) AND RefererHash = 3594120000172545465 GROUP BY URLHash, EventDate ORDER BY PageViews DESC LIMIT 10 OFFSET 100",
    type: 'complex',
    complexity: 'complex',
    columns: ['URLHash', 'EventDate', 'CounterID', 'IsRefresh', 'TraficSourceID', 'RefererHash'],
    description: 'Hash-based grouping with IN clause',
    parallelizable: true,
    clickhouseBaselineSec: 0.012,
  },

  // Q41: Window dimensions
  {
    id: 'Q41',
    sql: "SELECT WindowClientWidth, WindowClientHeight, COUNT(*) AS PageViews FROM hits WHERE CounterID = 62 AND EventDate >= '2013-07-01' AND EventDate <= '2013-07-31' AND IsRefresh = 0 AND DontCountHits = 0 AND URLHash = 2868770270353813622 GROUP BY WindowClientWidth, WindowClientHeight ORDER BY PageViews DESC LIMIT 10 OFFSET 10000",
    type: 'complex',
    complexity: 'complex',
    columns: ['WindowClientWidth', 'WindowClientHeight', 'CounterID', 'EventDate', 'IsRefresh', 'DontCountHits', 'URLHash'],
    description: 'Window dimensions analysis',
    parallelizable: true,
    clickhouseBaselineSec: 0.008,
  },

  // Q42: Time truncation
  {
    id: 'Q42',
    sql: "SELECT DATE_TRUNC('minute', EventTime) AS M, COUNT(*) AS PageViews FROM hits WHERE CounterID = 62 AND EventDate >= '2013-07-14' AND EventDate <= '2013-07-15' AND IsRefresh = 0 AND DontCountHits = 0 GROUP BY DATE_TRUNC('minute', EventTime) ORDER BY DATE_TRUNC('minute', EventTime) LIMIT 10 OFFSET 1000",
    type: 'complex',
    complexity: 'complex',
    columns: ['EventTime', 'CounterID', 'EventDate', 'IsRefresh', 'DontCountHits'],
    description: 'Minute-level time series',
    parallelizable: true,
    clickhouseBaselineSec: 0.015,
  },
];

/**
 * Get query by ID
 */
export function getQuery(id: string): ClickBenchQuery | undefined {
  return CLICKBENCH_QUERIES.find(q => q.id === id);
}

/**
 * Get queries by type
 */
export function getQueriesByType(type: QueryType): ClickBenchQuery[] {
  return CLICKBENCH_QUERIES.filter(q => q.type === type);
}

/**
 * Get queries by complexity
 */
export function getQueriesByComplexity(complexity: QueryComplexity): ClickBenchQuery[] {
  return CLICKBENCH_QUERIES.filter(q => q.complexity === complexity);
}

/**
 * Get parallelizable queries
 */
export function getParallelizableQueries(): ClickBenchQuery[] {
  return CLICKBENCH_QUERIES.filter(q => q.parallelizable);
}

/**
 * Query execution result
 */
export interface QueryResult {
  /** Query ID */
  queryId: string;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Rows scanned */
  rowsScanned: number;
  /** Rows returned */
  rowsReturned: number;
  /** Result data */
  result: unknown;
  /** From cache */
  fromCache: boolean;
}

/**
 * Create a query plan from a ClickBench query
 */
export function createQueryPlan(query: ClickBenchQuery): QueryPlan {
  // This is a simplified plan - full SQL parsing would be more complex
  return {
    query,
    projection: query.columns.length > 0 ? query.columns : [],
    filters: [],
    aggregates: [],
    limit: undefined,
    offset: undefined,
  };
}

/**
 * Execute COUNT(*) on columns
 */
export function executeCount(columns: Column[]): number {
  if (columns.length === 0) return 0;
  return columns[0].values.length;
}

/**
 * Execute COUNT(*) with filter
 */
export function executeCountFiltered(
  columns: Column[],
  filterColumn: string,
  predicate: (value: unknown) => boolean
): number {
  const col = columns.find(c => c.path === filterColumn);
  if (!col) return 0;

  let count = 0;
  for (let i = 0; i < col.values.length; i++) {
    if (!col.nulls[i] && predicate(col.values[i])) {
      count++;
    }
  }
  return count;
}

/**
 * Execute SUM on a column
 */
export function executeSum(columns: Column[], columnName: string): number {
  const col = columns.find(c => c.path === columnName);
  if (!col) return 0;

  let sum = 0;
  for (let i = 0; i < col.values.length; i++) {
    if (!col.nulls[i]) {
      sum += Number(col.values[i]) || 0;
    }
  }
  return sum;
}

/**
 * Execute AVG on a column
 */
export function executeAvg(columns: Column[], columnName: string): number {
  const col = columns.find(c => c.path === columnName);
  if (!col) return 0;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < col.values.length; i++) {
    if (!col.nulls[i]) {
      sum += Number(col.values[i]) || 0;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Execute MIN on a column
 */
export function executeMin(columns: Column[], columnName: string): unknown {
  const col = columns.find(c => c.path === columnName);
  if (!col) return null;

  let min: unknown = null;
  for (let i = 0; i < col.values.length; i++) {
    if (!col.nulls[i]) {
      if (min === null || col.values[i] < (min as number | string)) {
        min = col.values[i];
      }
    }
  }
  return min;
}

/**
 * Execute MAX on a column
 */
export function executeMax(columns: Column[], columnName: string): unknown {
  const col = columns.find(c => c.path === columnName);
  if (!col) return null;

  let max: unknown = null;
  for (let i = 0; i < col.values.length; i++) {
    if (!col.nulls[i]) {
      if (max === null || col.values[i] > (max as number | string)) {
        max = col.values[i];
      }
    }
  }
  return max;
}

/**
 * Execute COUNT DISTINCT on a column
 */
export function executeCountDistinct(columns: Column[], columnName: string): number {
  const col = columns.find(c => c.path === columnName);
  if (!col) return 0;

  const seen = new Set<unknown>();
  for (let i = 0; i < col.values.length; i++) {
    if (!col.nulls[i]) {
      seen.add(col.values[i]);
    }
  }
  return seen.size;
}

/**
 * Execute GROUP BY with aggregation
 */
export function executeGroupBy(
  columns: Column[],
  groupColumns: string[],
  aggregates: AggregateSpec[]
): Map<string, Record<string, number>> {
  const groups = new Map<string, Record<string, { sum: number; count: number; values: Set<unknown> }>>();

  // Find required columns
  const groupCols = groupColumns.map(name => columns.find(c => c.path === name)).filter(Boolean) as Column[];
  const aggCols = aggregates
    .filter(a => a.column)
    .map(a => ({ spec: a, col: columns.find(c => c.path === a.column) }))
    .filter(a => a.col);

  if (groupCols.length === 0) return new Map();

  const rowCount = groupCols[0].values.length;

  // Group rows
  for (let i = 0; i < rowCount; i++) {
    // Build group key
    const keyParts = groupCols.map(col => String(col.nulls[i] ? 'NULL' : col.values[i]));
    const key = keyParts.join('|');

    // Initialize group
    if (!groups.has(key)) {
      const init: Record<string, { sum: number; count: number; values: Set<unknown> }> = {};
      for (const agg of aggregates) {
        init[agg.alias || agg.function] = { sum: 0, count: 0, values: new Set() };
      }
      groups.set(key, init);
    }

    const group = groups.get(key)!;

    // Aggregate values
    for (const { spec, col } of aggCols) {
      if (!col) continue;
      const agg = group[spec.alias || spec.function];
      if (!col.nulls[i]) {
        const val = col.values[i];
        agg.sum += Number(val) || 0;
        agg.count++;
        agg.values.add(val);
      }
    }

    // Handle COUNT(*)
    const countAllAgg = aggregates.find(a => a.function === 'count' && !a.column);
    if (countAllAgg) {
      const agg = group[countAllAgg.alias || 'count'];
      agg.count++;
    }
  }

  // Compute final results
  const results = new Map<string, Record<string, number>>();
  for (const [key, aggs] of groups) {
    const result: Record<string, number> = {};
    for (const spec of aggregates) {
      const agg = aggs[spec.alias || spec.function];
      switch (spec.function) {
        case 'count':
          result[spec.alias || 'count'] = agg.count;
          break;
        case 'sum':
          result[spec.alias || 'sum'] = agg.sum;
          break;
        case 'avg':
          result[spec.alias || 'avg'] = agg.count > 0 ? agg.sum / agg.count : 0;
          break;
        case 'countDistinct':
          result[spec.alias || 'countDistinct'] = agg.values.size;
          break;
      }
    }
    results.set(key, result);
  }

  return results;
}

/**
 * Subset of queries for quick benchmarks
 */
export const QUICK_BENCHMARK_QUERIES = [
  'Q0',  // COUNT(*)
  'Q1',  // COUNT with filter
  'Q2',  // Multiple aggregations
  'Q4',  // COUNT DISTINCT
  'Q7',  // GROUP BY with order
  'Q12', // String GROUP BY
  'Q20', // String LIKE
  'Q36', // Complex filter
];

/**
 * Get queries for quick benchmark
 */
export function getQuickBenchmarkQueries(): ClickBenchQuery[] {
  return QUICK_BENCHMARK_QUERIES
    .map(id => getQuery(id))
    .filter(Boolean) as ClickBenchQuery[];
}

/**
 * Queries suitable for parallel execution
 */
export const PARALLEL_BENCHMARK_QUERIES = CLICKBENCH_QUERIES
  .filter(q => q.parallelizable && q.complexity !== 'complex')
  .map(q => q.id);

/**
 * Get queries suitable for parallel benchmark
 */
export function getParallelBenchmarkQueries(): ClickBenchQuery[] {
  return PARALLEL_BENCHMARK_QUERIES
    .map(id => getQuery(id))
    .filter(Boolean) as ClickBenchQuery[];
}
