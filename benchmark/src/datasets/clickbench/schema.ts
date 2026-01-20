/**
 * ClickBench Schema Definition
 *
 * This file defines the schema for the ClickBench "hits" dataset,
 * which represents web analytics data with approximately 100 columns.
 *
 * The schema is based on the official ClickBench specification:
 * @see https://github.com/ClickHouse/ClickBench
 * @see https://clickhouse.com/benchmark/
 *
 * The hits table contains ~100 million records of web analytics data
 * representing typical clickstream and traffic analysis workloads.
 */

import type { ColumnDef, DataSchema } from '../../types.js';

/**
 * Column type mapping for ClickBench columns
 */
export type ClickBenchColumnType =
  | 'int32'
  | 'int64'
  | 'float64'
  | 'string'
  | 'bool'
  | 'timestamp'
  | 'date';

/**
 * ClickBench hits table column definitions
 *
 * The hits dataset has 100+ columns covering:
 * - User identification (WatchID, UserID, CounterID)
 * - Temporal data (EventTime, EventDate)
 * - User agent information (OS, Browser, Device)
 * - Geographic data (RegionID, ClientIP)
 * - Page data (URL, Title, Referer)
 * - Marketing attribution (UTM parameters)
 * - Performance metrics (timing data)
 * - Technical specifications (resolution, plugins)
 */
export const CLICKBENCH_COLUMNS: ColumnDef[] = [
  // Primary identifiers
  { name: 'WatchID', type: 'int64', nullable: false, primaryKey: true },
  { name: 'JavaEnable', type: 'int32', nullable: false },
  { name: 'Title', type: 'string', nullable: false },
  { name: 'GoodEvent', type: 'int32', nullable: false },
  { name: 'EventTime', type: 'timestamp', nullable: false },
  { name: 'EventDate', type: 'date', nullable: false, partitionKey: true },
  { name: 'CounterID', type: 'int32', nullable: false },
  { name: 'ClientIP', type: 'int32', nullable: false },
  { name: 'RegionID', type: 'int32', nullable: false },
  { name: 'UserID', type: 'int64', nullable: false },
  { name: 'CounterClass', type: 'int32', nullable: false },
  { name: 'OS', type: 'int32', nullable: false },
  { name: 'UserAgent', type: 'int32', nullable: false },
  { name: 'URL', type: 'string', nullable: false },
  { name: 'Referer', type: 'string', nullable: false },
  { name: 'IsRefresh', type: 'int32', nullable: false },
  { name: 'RefererCategoryID', type: 'int32', nullable: false },
  { name: 'RefererRegionID', type: 'int32', nullable: false },
  { name: 'URLCategoryID', type: 'int32', nullable: false },
  { name: 'URLRegionID', type: 'int32', nullable: false },
  { name: 'ResolutionWidth', type: 'int32', nullable: false },
  { name: 'ResolutionHeight', type: 'int32', nullable: false },
  { name: 'ResolutionDepth', type: 'int32', nullable: false },
  { name: 'FlashMajor', type: 'int32', nullable: false },
  { name: 'FlashMinor', type: 'int32', nullable: false },
  { name: 'FlashMinor2', type: 'string', nullable: false },
  { name: 'NetMajor', type: 'int32', nullable: false },
  { name: 'NetMinor', type: 'int32', nullable: false },
  { name: 'UserAgentMajor', type: 'int32', nullable: false },
  { name: 'UserAgentMinor', type: 'string', nullable: false },
  { name: 'CookieEnable', type: 'int32', nullable: false },
  { name: 'JavascriptEnable', type: 'int32', nullable: false },
  { name: 'IsMobile', type: 'int32', nullable: false },
  { name: 'MobilePhone', type: 'int32', nullable: false },
  { name: 'MobilePhoneModel', type: 'string', nullable: false },
  { name: 'Params', type: 'string', nullable: false },
  { name: 'IPNetworkID', type: 'int32', nullable: false },
  { name: 'TraficSourceID', type: 'int32', nullable: false },
  { name: 'SearchEngineID', type: 'int32', nullable: false },
  { name: 'SearchPhrase', type: 'string', nullable: false },
  { name: 'AdvEngineID', type: 'int32', nullable: false },
  { name: 'IsArtifical', type: 'int32', nullable: false },
  { name: 'WindowClientWidth', type: 'int32', nullable: false },
  { name: 'WindowClientHeight', type: 'int32', nullable: false },
  { name: 'ClientTimeZone', type: 'int32', nullable: false },
  { name: 'ClientEventTime', type: 'timestamp', nullable: false },
  { name: 'SilverlightVersion1', type: 'int32', nullable: false },
  { name: 'SilverlightVersion2', type: 'int32', nullable: false },
  { name: 'SilverlightVersion3', type: 'int32', nullable: false },
  { name: 'SilverlightVersion4', type: 'int32', nullable: false },
  { name: 'PageCharset', type: 'string', nullable: false },
  { name: 'CodeVersion', type: 'int32', nullable: false },
  { name: 'IsLink', type: 'int32', nullable: false },
  { name: 'IsDownload', type: 'int32', nullable: false },
  { name: 'IsNotBounce', type: 'int32', nullable: false },
  { name: 'FUniqID', type: 'int64', nullable: false },
  { name: 'OriginalURL', type: 'string', nullable: false },
  { name: 'HID', type: 'int32', nullable: false },
  { name: 'IsOldCounter', type: 'int32', nullable: false },
  { name: 'IsEvent', type: 'int32', nullable: false },
  { name: 'IsParameter', type: 'int32', nullable: false },
  { name: 'DontCountHits', type: 'int32', nullable: false },
  { name: 'WithHash', type: 'int32', nullable: false },
  { name: 'HitColor', type: 'string', nullable: false },
  { name: 'LocalEventTime', type: 'timestamp', nullable: false },
  { name: 'Age', type: 'int32', nullable: false },
  { name: 'Sex', type: 'int32', nullable: false },
  { name: 'Income', type: 'int32', nullable: false },
  { name: 'Interests', type: 'int32', nullable: false },
  { name: 'Robotness', type: 'int32', nullable: false },
  { name: 'RemoteIP', type: 'int32', nullable: false },
  { name: 'WindowName', type: 'int32', nullable: false },
  { name: 'OpenerName', type: 'int32', nullable: false },
  { name: 'HistoryLength', type: 'int32', nullable: false },
  { name: 'BrowserLanguage', type: 'string', nullable: false },
  { name: 'BrowserCountry', type: 'string', nullable: false },
  { name: 'SocialNetwork', type: 'string', nullable: false },
  { name: 'SocialAction', type: 'string', nullable: false },
  { name: 'HTTPError', type: 'int32', nullable: false },
  { name: 'SendTiming', type: 'int32', nullable: false },
  { name: 'DNSTiming', type: 'int32', nullable: false },
  { name: 'ConnectTiming', type: 'int32', nullable: false },
  { name: 'ResponseStartTiming', type: 'int32', nullable: false },
  { name: 'ResponseEndTiming', type: 'int32', nullable: false },
  { name: 'FetchTiming', type: 'int32', nullable: false },
  { name: 'SocialSourceNetworkID', type: 'int32', nullable: false },
  { name: 'SocialSourcePage', type: 'string', nullable: false },
  { name: 'ParamPrice', type: 'int64', nullable: false },
  { name: 'ParamOrderID', type: 'string', nullable: false },
  { name: 'ParamCurrency', type: 'string', nullable: false },
  { name: 'ParamCurrencyID', type: 'int32', nullable: false },
  { name: 'OpenstatServiceName', type: 'string', nullable: false },
  { name: 'OpenstatCampaignID', type: 'string', nullable: false },
  { name: 'OpenstatAdID', type: 'string', nullable: false },
  { name: 'OpenstatSourceID', type: 'string', nullable: false },
  { name: 'UTMSource', type: 'string', nullable: false },
  { name: 'UTMMedium', type: 'string', nullable: false },
  { name: 'UTMCampaign', type: 'string', nullable: false },
  { name: 'UTMContent', type: 'string', nullable: false },
  { name: 'UTMTerm', type: 'string', nullable: false },
  { name: 'FromTag', type: 'string', nullable: false },
  { name: 'HasGCLID', type: 'int32', nullable: false },
  { name: 'RefererHash', type: 'int64', nullable: false },
  { name: 'URLHash', type: 'int64', nullable: false },
  { name: 'CLID', type: 'int32', nullable: false },
];

/**
 * ClickBench hits table schema
 */
export const CLICKBENCH_HITS_SCHEMA: DataSchema = {
  name: 'hits',
  columns: CLICKBENCH_COLUMNS,
};

/**
 * Data size configurations for ClickBench benchmarks
 */
export type ClickBenchDataSize = 'tiny' | 'small' | 'medium' | 'large' | 'full';

/**
 * Size configurations mapping to row counts
 */
export const CLICKBENCH_SIZES: Record<ClickBenchDataSize, number> = {
  tiny: 10_000,        // 10K rows - quick tests
  small: 100_000,      // 100K rows - development
  medium: 1_000_000,   // 1M rows - validation
  large: 10_000_000,   // 10M rows - performance testing
  full: 100_000_000,   // 100M rows - full benchmark (matches ClickBench)
};

/**
 * Get column by name
 */
export function getColumn(name: string): ColumnDef | undefined {
  return CLICKBENCH_COLUMNS.find(c => c.name === name);
}

/**
 * Get primary key columns
 */
export function getPrimaryKeyColumns(): ColumnDef[] {
  return CLICKBENCH_COLUMNS.filter(c => c.primaryKey);
}

/**
 * Get partition key columns
 */
export function getPartitionKeyColumns(): ColumnDef[] {
  return CLICKBENCH_COLUMNS.filter(c => c.partitionKey);
}

/**
 * Get numeric columns (for aggregations)
 */
export function getNumericColumns(): ColumnDef[] {
  return CLICKBENCH_COLUMNS.filter(c =>
    c.type === 'int32' || c.type === 'int64' || c.type === 'float64'
  );
}

/**
 * Get string columns (for string operations)
 */
export function getStringColumns(): ColumnDef[] {
  return CLICKBENCH_COLUMNS.filter(c => c.type === 'string');
}

/**
 * Get timestamp columns (for time-based queries)
 */
export function getTimestampColumns(): ColumnDef[] {
  return CLICKBENCH_COLUMNS.filter(c =>
    c.type === 'timestamp' || c.type === 'date'
  );
}

/**
 * Column groups for common query patterns
 */
export const CLICKBENCH_COLUMN_GROUPS = {
  // Identity columns
  identity: ['WatchID', 'UserID', 'CounterID'],

  // Time columns
  temporal: ['EventTime', 'EventDate', 'ClientEventTime', 'LocalEventTime'],

  // User agent / device
  device: ['OS', 'UserAgent', 'IsMobile', 'MobilePhone', 'MobilePhoneModel'],

  // Geographic
  geographic: ['RegionID', 'ClientIP', 'RemoteIP'],

  // Page data
  page: ['URL', 'Title', 'Referer', 'URLCategoryID', 'RefererCategoryID'],

  // Search & marketing
  marketing: [
    'SearchEngineID', 'SearchPhrase', 'AdvEngineID',
    'UTMSource', 'UTMMedium', 'UTMCampaign', 'UTMContent', 'UTMTerm',
  ],

  // Screen resolution
  resolution: ['ResolutionWidth', 'ResolutionHeight', 'ResolutionDepth',
    'WindowClientWidth', 'WindowClientHeight'],

  // Performance timing
  timing: [
    'SendTiming', 'DNSTiming', 'ConnectTiming',
    'ResponseStartTiming', 'ResponseEndTiming', 'FetchTiming',
  ],

  // Boolean flags
  flags: [
    'IsRefresh', 'IsLink', 'IsDownload', 'IsNotBounce',
    'JavaEnable', 'CookieEnable', 'JavascriptEnable',
  ],
} as const;

/**
 * Cardinality estimates for columns (based on actual ClickBench data)
 * Lower cardinality columns benefit more from dictionary encoding
 */
export const CLICKBENCH_CARDINALITY: Record<string, number> = {
  // Very low cardinality (< 100)
  GoodEvent: 2,
  JavaEnable: 2,
  CookieEnable: 2,
  JavascriptEnable: 2,
  IsMobile: 2,
  IsRefresh: 2,
  IsLink: 2,
  IsDownload: 2,
  IsNotBounce: 2,
  Sex: 3,
  Income: 5,
  CounterClass: 10,
  OS: 50,

  // Low cardinality (100-1000)
  UserAgent: 500,
  ResolutionDepth: 20,
  MobilePhone: 200,
  AdvEngineID: 30,
  SearchEngineID: 100,
  TraficSourceID: 20,

  // Medium cardinality (1000-100000)
  RegionID: 10000,
  CounterID: 50000,
  URLCategoryID: 1000,
  RefererCategoryID: 1000,

  // High cardinality (> 100000)
  UserID: 10_000_000,
  WatchID: 100_000_000,
  URL: 5_000_000,
  Referer: 2_000_000,
  Title: 1_000_000,
  SearchPhrase: 500_000,
};

/**
 * Get estimated cardinality for a column
 */
export function getCardinality(columnName: string): number {
  return CLICKBENCH_CARDINALITY[columnName] ?? 1_000_000;
}

/**
 * Check if a column should use dictionary encoding
 * (cardinality < 1000 or cardinality/rowCount < 0.01)
 */
export function shouldUseDictionaryEncoding(
  columnName: string,
  rowCount: number
): boolean {
  const cardinality = getCardinality(columnName);
  return cardinality < 1000 || cardinality / rowCount < 0.01;
}

/**
 * Get recommended encoding for each column based on data characteristics
 */
export function getRecommendedEncoding(
  columnName: string,
  rowCount: number
): 'plain' | 'dict' | 'rle' | 'delta' {
  const col = getColumn(columnName);
  if (!col) return 'plain';

  const cardinality = getCardinality(columnName);

  // Very low cardinality -> RLE might be better
  if (cardinality < 10) {
    return 'rle';
  }

  // Low cardinality -> Dictionary encoding
  if (shouldUseDictionaryEncoding(columnName, rowCount)) {
    return 'dict';
  }

  // Sequential or sorted data -> Delta encoding
  if (['WatchID', 'EventTime', 'ClientEventTime'].includes(columnName)) {
    return 'delta';
  }

  // Default to plain encoding
  return 'plain';
}
