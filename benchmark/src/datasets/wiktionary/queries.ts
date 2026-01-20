/**
 * Wiktionary Benchmark Queries
 *
 * Dictionary-specific query implementations for benchmarking EvoDB
 * columnar storage with lexicon data patterns.
 *
 * Query Categories:
 * 1. Word Lookup - Exact match on word field (primary key pattern)
 * 2. Prefix Search - Autocomplete/suggestion pattern
 * 3. Filter Queries - Language, POS, category filtering
 * 4. Full-Text Search - Definition text search
 * 5. Translation Lookup - Cross-language queries
 * 6. Complex Aggregations - Statistics and analytics
 */

import { shred, encode, decode, type Column, type EncodedColumn } from '@evodb/core';
import type {
  WiktionaryEntry,
  WiktionaryDataSize,
  WiktionaryShredResult,
  WiktionaryBenchmarkResult,
  QueryBenchmarkResult,
  WordLookupQuery,
  PrefixSearchQuery,
  FilterQuery,
  FullTextQuery,
  TranslationQuery,
  LanguageCode,
  PartOfSpeech,
} from './schema.js';
import { WIKTIONARY_DATA_SIZES } from './schema.js';
import { generateEntries } from './loader.js';

// ============================================================================
// Shredding Integration
// ============================================================================

/**
 * Options for shredding Wiktionary entries
 */
export interface ShredOptions {
  /** Specific column paths to extract */
  columns?: string[];
  /** Whether to encode after shredding */
  encode?: boolean;
}

/**
 * Shred Wiktionary entries into columnar format
 */
export function shredEntries(
  entries: WiktionaryEntry[],
  options: ShredOptions = {}
): Column[] {
  return shred(entries as unknown[], {
    columns: options.columns,
  });
}

/**
 * Benchmark shredding performance
 */
export function benchmarkShred(entries: WiktionaryEntry[]): WiktionaryShredResult {
  const jsonSize = JSON.stringify(entries).length;

  const start = performance.now();
  const columns = shred(entries as unknown[]);
  const shredTimeMs = performance.now() - start;

  // Estimate column size
  let totalSizeBytes = 0;
  for (const col of columns) {
    totalSizeBytes += col.path.length * 2;
    totalSizeBytes += col.values.length * 8;
    totalSizeBytes += Math.ceil(col.nulls.length / 8);
  }

  return {
    entryCount: entries.length,
    columnCount: columns.length,
    shredTimeMs,
    throughput: entries.length / (shredTimeMs / 1000),
    totalSizeBytes,
    compressionRatio: jsonSize / totalSizeBytes,
  };
}

// ============================================================================
// In-Memory Query Implementations (for benchmarking)
// ============================================================================

/**
 * Build column index for faster lookups
 */
export interface ColumnIndex {
  /** Map from column path to column */
  byPath: Map<string, Column>;
  /** Row count */
  rowCount: number;
}

/**
 * Create column index from shredded data
 */
export function createColumnIndex(columns: Column[]): ColumnIndex {
  const byPath = new Map<string, Column>();
  for (const col of columns) {
    byPath.set(col.path, col);
  }
  return {
    byPath,
    rowCount: columns.length > 0 ? columns[0].values.length : 0,
  };
}

/**
 * Word lookup - exact match query
 *
 * Simulates: SELECT * FROM entries WHERE word = ?
 */
export function wordLookup(
  index: ColumnIndex,
  query: WordLookupQuery
): number[] {
  const wordCol = index.byPath.get('word');
  if (!wordCol) return [];

  const matches: number[] = [];
  const { word, langCode, pos } = query;

  // Get optional filter columns
  const langCol = langCode ? index.byPath.get('langCode') : null;
  const posCol = pos ? index.byPath.get('pos') : null;

  for (let i = 0; i < index.rowCount; i++) {
    if (wordCol.nulls[i]) continue;
    if (wordCol.values[i] !== word) continue;

    // Apply optional filters
    if (langCol && !langCol.nulls[i] && langCol.values[i] !== langCode) continue;
    if (posCol && !posCol.nulls[i] && posCol.values[i] !== pos) continue;

    matches.push(i);
  }

  return matches;
}

/**
 * Prefix search - autocomplete pattern
 *
 * Simulates: SELECT * FROM entries WHERE word LIKE 'prefix%' LIMIT n
 */
export function prefixSearch(
  index: ColumnIndex,
  query: PrefixSearchQuery
): number[] {
  const wordCol = index.byPath.get('word');
  if (!wordCol) return [];

  const matches: number[] = [];
  const { prefix, langCode, limit = 100 } = query;
  const prefixLower = prefix.toLowerCase();

  const langCol = langCode ? index.byPath.get('langCode') : null;

  for (let i = 0; i < index.rowCount && matches.length < limit; i++) {
    if (wordCol.nulls[i]) continue;

    const word = String(wordCol.values[i]).toLowerCase();
    if (!word.startsWith(prefixLower)) continue;

    if (langCol && !langCol.nulls[i] && langCol.values[i] !== langCode) continue;

    matches.push(i);
  }

  return matches;
}

/**
 * Filter query - multi-field filtering
 *
 * Simulates: SELECT * FROM entries WHERE langCode = ? AND pos = ? AND ...
 */
export function filterQuery(
  index: ColumnIndex,
  query: FilterQuery
): number[] {
  const matches: number[] = [];
  const { langCode, pos, category, tag, hasAudio, hasEtymology, limit = 1000 } = query;

  const langCol = langCode ? index.byPath.get('langCode') : null;
  const posCol = pos ? index.byPath.get('pos') : null;
  const categoriesCol = category ? index.byPath.get('categories') : null;
  const etymologyCol = hasEtymology !== undefined ? index.byPath.get('etymologyText') : null;
  // For hasAudio, we'd need to check sounds array - simplified here
  const soundsCol = hasAudio !== undefined ? index.byPath.get('sounds.0.audio') : null;

  for (let i = 0; i < index.rowCount && matches.length < limit; i++) {
    // Language filter
    if (langCol) {
      if (langCol.nulls[i] || langCol.values[i] !== langCode) continue;
    }

    // POS filter
    if (posCol) {
      if (posCol.nulls[i] || posCol.values[i] !== pos) continue;
    }

    // Category filter (simplified - checks if category is in the categories array)
    if (categoriesCol && category) {
      const cats = categoriesCol.values[i];
      if (!cats || !(Array.isArray(cats) ? cats.includes(category) : String(cats).includes(category))) {
        continue;
      }
    }

    // Etymology filter
    if (hasEtymology !== undefined && etymologyCol) {
      const hasEtym = !etymologyCol.nulls[i] && etymologyCol.values[i];
      if (hasEtymology !== !!hasEtym) continue;
    }

    // Audio filter
    if (hasAudio !== undefined && soundsCol) {
      const hasAud = !soundsCol.nulls[i] && soundsCol.values[i];
      if (hasAudio !== !!hasAud) continue;
    }

    matches.push(i);
  }

  return matches;
}

/**
 * Full-text search on definitions
 *
 * Simulates: SELECT * FROM entries WHERE definition LIKE '%text%'
 * Note: Real implementation would use inverted index
 */
export function fullTextSearch(
  index: ColumnIndex,
  query: FullTextQuery
): number[] {
  const matches: number[] = [];
  const { text, langCode, pos, limit = 100 } = query;
  const searchLower = text.toLowerCase();

  // Search in glosses - look for senses.N.glosses columns
  const glossColumns: Column[] = [];
  for (const [path, col] of index.byPath) {
    if (path.includes('glosses')) {
      glossColumns.push(col);
    }
  }

  if (glossColumns.length === 0) return [];

  const langCol = langCode ? index.byPath.get('langCode') : null;
  const posCol = pos ? index.byPath.get('pos') : null;

  const seen = new Set<number>();

  for (let i = 0; i < index.rowCount && matches.length < limit; i++) {
    if (seen.has(i)) continue;

    // Apply filters first
    if (langCol && !langCol.nulls[i] && langCol.values[i] !== langCode) continue;
    if (posCol && !posCol.nulls[i] && posCol.values[i] !== pos) continue;

    // Search in glosses
    let found = false;
    for (const glossCol of glossColumns) {
      if (glossCol.nulls[i]) continue;
      const gloss = String(glossCol.values[i]).toLowerCase();
      if (gloss.includes(searchLower)) {
        found = true;
        break;
      }
    }

    if (found) {
      matches.push(i);
      seen.add(i);
    }
  }

  return matches;
}

/**
 * Translation lookup
 *
 * Simulates: SELECT translations FROM entries WHERE word = ? AND langCode = ?
 * Then filter translations for target language
 */
export function translationLookup(
  index: ColumnIndex,
  entries: WiktionaryEntry[],
  query: TranslationQuery
): { sourceWord: string; translations: string[] }[] {
  const { word, fromLang, toLang } = query;

  // First find matching entries
  const matchingRows = wordLookup(index, { word, langCode: fromLang });

  const results: { sourceWord: string; translations: string[] }[] = [];

  for (const rowIdx of matchingRows) {
    const entry = entries[rowIdx];
    if (!entry.translations) continue;

    const targetTranslations = entry.translations
      .filter(t => t.code === toLang)
      .map(t => t.word);

    if (targetTranslations.length > 0) {
      results.push({
        sourceWord: entry.word,
        translations: targetTranslations,
      });
    }
  }

  return results;
}

// ============================================================================
// Aggregation Queries
// ============================================================================

/**
 * Count entries by language
 */
export function countByLanguage(index: ColumnIndex): Map<string, number> {
  const langCol = index.byPath.get('langCode');
  if (!langCol) return new Map();

  const counts = new Map<string, number>();
  for (let i = 0; i < index.rowCount; i++) {
    if (langCol.nulls[i]) continue;
    const lang = String(langCol.values[i]);
    counts.set(lang, (counts.get(lang) || 0) + 1);
  }

  return counts;
}

/**
 * Count entries by part of speech
 */
export function countByPos(index: ColumnIndex): Map<string, number> {
  const posCol = index.byPath.get('pos');
  if (!posCol) return new Map();

  const counts = new Map<string, number>();
  for (let i = 0; i < index.rowCount; i++) {
    if (posCol.nulls[i]) continue;
    const pos = String(posCol.values[i]);
    counts.set(pos, (counts.get(pos) || 0) + 1);
  }

  return counts;
}

/**
 * Calculate average senses per entry by language
 */
export function avgSensesByLanguage(
  index: ColumnIndex,
  entries: WiktionaryEntry[]
): Map<string, number> {
  const langCounts = new Map<string, { total: number; senseSum: number }>();

  for (const entry of entries) {
    const lang = entry.langCode;
    const existing = langCounts.get(lang) || { total: 0, senseSum: 0 };
    existing.total++;
    existing.senseSum += entry.senses.length;
    langCounts.set(lang, existing);
  }

  const averages = new Map<string, number>();
  for (const [lang, data] of langCounts) {
    averages.set(lang, data.senseSum / data.total);
  }

  return averages;
}

// ============================================================================
// Query Benchmark Runner
// ============================================================================

/**
 * Query benchmark configuration
 */
export interface QueryBenchmarkConfig {
  /** Number of iterations per query type */
  iterations?: number;
  /** Sample queries for lookup tests */
  sampleWords?: string[];
  /** Sample prefixes for prefix search */
  samplePrefixes?: string[];
  /** Sample search terms for full-text */
  sampleSearchTerms?: string[];
}

const DEFAULT_BENCHMARK_CONFIG: Required<QueryBenchmarkConfig> = {
  iterations: 100,
  sampleWords: [],
  samplePrefixes: ['a', 'be', 'con', 'de', 'ex', 'in', 'pre', 're', 'un'],
  sampleSearchTerms: ['action', 'person', 'place', 'thing', 'quality', 'state'],
};

/**
 * Run word lookup benchmark
 */
function benchmarkWordLookup(
  index: ColumnIndex,
  entries: WiktionaryEntry[],
  config: Required<QueryBenchmarkConfig>
): QueryBenchmarkResult {
  // Get sample words from actual data
  const sampleWords = config.sampleWords.length > 0
    ? config.sampleWords
    : entries.slice(0, Math.min(100, entries.length)).map(e => e.word);

  let totalResults = 0;
  const start = performance.now();

  for (let i = 0; i < config.iterations; i++) {
    const word = sampleWords[i % sampleWords.length];
    const results = wordLookup(index, { word });
    totalResults += results.length;
  }

  const totalTimeMs = performance.now() - start;

  return {
    queryType: 'wordLookup',
    iterations: config.iterations,
    totalTimeMs,
    avgTimeMs: totalTimeMs / config.iterations,
    throughput: config.iterations / (totalTimeMs / 1000),
    resultCount: totalResults,
  };
}

/**
 * Run prefix search benchmark
 */
function benchmarkPrefixSearch(
  index: ColumnIndex,
  config: Required<QueryBenchmarkConfig>
): QueryBenchmarkResult {
  let totalResults = 0;
  const start = performance.now();

  for (let i = 0; i < config.iterations; i++) {
    const prefix = config.samplePrefixes[i % config.samplePrefixes.length];
    const results = prefixSearch(index, { prefix, limit: 50 });
    totalResults += results.length;
  }

  const totalTimeMs = performance.now() - start;

  return {
    queryType: 'prefixSearch',
    iterations: config.iterations,
    totalTimeMs,
    avgTimeMs: totalTimeMs / config.iterations,
    throughput: config.iterations / (totalTimeMs / 1000),
    resultCount: totalResults,
  };
}

/**
 * Run filter query benchmark
 */
function benchmarkFilterQuery(index: ColumnIndex): QueryBenchmarkResult {
  const filters: FilterQuery[] = [
    { langCode: 'en', limit: 100 },
    { langCode: 'de', pos: 'noun' as PartOfSpeech, limit: 100 },
    { langCode: 'fr', pos: 'verb' as PartOfSpeech, limit: 100 },
    { hasEtymology: true, limit: 100 },
    { pos: 'adjective' as PartOfSpeech, limit: 100 },
  ];

  let totalResults = 0;
  const iterations = filters.length * 20;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const filter = filters[i % filters.length];
    const results = filterQuery(index, filter);
    totalResults += results.length;
  }

  const totalTimeMs = performance.now() - start;

  return {
    queryType: 'filterQuery',
    iterations,
    totalTimeMs,
    avgTimeMs: totalTimeMs / iterations,
    throughput: iterations / (totalTimeMs / 1000),
    resultCount: totalResults,
  };
}

/**
 * Run full-text search benchmark
 */
function benchmarkFullTextSearch(
  index: ColumnIndex,
  config: Required<QueryBenchmarkConfig>
): QueryBenchmarkResult {
  let totalResults = 0;
  const iterations = Math.min(config.iterations, 50); // Limit FTS iterations (expensive)
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const text = config.sampleSearchTerms[i % config.sampleSearchTerms.length];
    const results = fullTextSearch(index, { text, limit: 20 });
    totalResults += results.length;
  }

  const totalTimeMs = performance.now() - start;

  return {
    queryType: 'fullTextSearch',
    iterations,
    totalTimeMs,
    avgTimeMs: totalTimeMs / iterations,
    throughput: iterations / (totalTimeMs / 1000),
    resultCount: totalResults,
  };
}

/**
 * Run aggregation benchmark
 */
function benchmarkAggregations(index: ColumnIndex): QueryBenchmarkResult {
  const iterations = 10;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    countByLanguage(index);
    countByPos(index);
  }

  const totalTimeMs = performance.now() - start;

  return {
    queryType: 'aggregations',
    iterations: iterations * 2, // Two aggregations per iteration
    totalTimeMs,
    avgTimeMs: totalTimeMs / (iterations * 2),
    throughput: (iterations * 2) / (totalTimeMs / 1000),
    resultCount: 0, // Aggregations return maps, not counts
  };
}

// ============================================================================
// Full Benchmark Suite
// ============================================================================

/**
 * Run comprehensive Wiktionary benchmark
 */
export function benchmarkFull(
  entries: WiktionaryEntry[],
  queryConfig: QueryBenchmarkConfig = {}
): WiktionaryBenchmarkResult & { columns: Column[] } {
  const config: Required<QueryBenchmarkConfig> = {
    ...DEFAULT_BENCHMARK_CONFIG,
    ...queryConfig,
  };

  const jsonSize = JSON.stringify(entries).length;

  // Shred
  const shredStart = performance.now();
  const columns = shred(entries as unknown[]);
  const shredTimeMs = performance.now() - shredStart;

  // Build index
  const index = createColumnIndex(columns);

  // Estimate shredded column size
  let shredSizeBytes = 0;
  for (const col of columns) {
    shredSizeBytes += col.path.length * 2;
    shredSizeBytes += col.values.length * 8;
    shredSizeBytes += Math.ceil(col.nulls.length / 8);
  }

  // Run query benchmarks
  const queries: QueryBenchmarkResult[] = [
    benchmarkWordLookup(index, entries, config),
    benchmarkPrefixSearch(index, config),
    benchmarkFilterQuery(index),
    benchmarkFullTextSearch(index, config),
    benchmarkAggregations(index),
  ];

  // Encode benchmark
  let encodeTimeMs = 0;
  let encodedSize = 0;
  let encoded: EncodedColumn[] = [];

  try {
    const encodeStart = performance.now();
    encoded = encode(columns);
    encodeTimeMs = performance.now() - encodeStart;
    encodedSize = encoded.reduce((sum, col) => sum + col.data.length + col.nullBitmap.length, 0);
  } catch {
    // Encoding may fail for certain data types
  }

  // Decode benchmark
  let decodeTimeMs = 0;
  if (encoded.length > 0) {
    try {
      const decodeStart = performance.now();
      encoded.map(col => decode(col, entries.length));
      decodeTimeMs = performance.now() - decodeStart;
    } catch {
      // Decode can fail for certain column types
    }
  }

  const result: WiktionaryBenchmarkResult & { columns: Column[] } = {
    size: getSizeCategory(entries.length),
    entryCount: entries.length,
    columns,
    shred: {
      entryCount: entries.length,
      columnCount: columns.length,
      shredTimeMs,
      throughput: entries.length / (shredTimeMs / 1000),
      totalSizeBytes: shredSizeBytes,
      compressionRatio: jsonSize / shredSizeBytes,
    },
    queries,
  };

  if (encodeTimeMs > 0) {
    result.encode = {
      timeMs: encodeTimeMs,
      outputSizeBytes: encodedSize,
      throughput: entries.length / (encodeTimeMs / 1000),
    };
  }

  if (decodeTimeMs > 0) {
    result.decode = {
      timeMs: decodeTimeMs,
      throughput: entries.length / (decodeTimeMs / 1000),
    };
  }

  return result;
}

/**
 * Get size category for entry count
 */
function getSizeCategory(count: number): WiktionaryDataSize {
  if (count <= WIKTIONARY_DATA_SIZES.tiny) return 'tiny';
  if (count <= WIKTIONARY_DATA_SIZES.small) return 'small';
  if (count <= WIKTIONARY_DATA_SIZES.medium) return 'medium';
  return 'large';
}

/**
 * Run benchmarks for multiple sizes
 */
export async function runBenchmarks(
  sizes: WiktionaryDataSize[] = ['tiny', 'small']
): Promise<Map<WiktionaryDataSize, WiktionaryBenchmarkResult>> {
  const results = new Map<WiktionaryDataSize, WiktionaryBenchmarkResult>();

  for (const size of sizes) {
    const entryCount = WIKTIONARY_DATA_SIZES[size];

    // Skip large benchmarks by default
    if (entryCount > 500_000) {
      console.warn(`Skipping ${size} benchmark (${entryCount} entries) to avoid memory issues`);
      continue;
    }

    console.log(`Generating ${size} Wiktionary dataset (${entryCount.toLocaleString()} entries)...`);
    const entries = generateEntries(entryCount);

    console.log(`Running ${size} benchmark...`);
    const result = benchmarkFull(entries);

    // Remove columns from result
    const { columns: _, ...benchResult } = result;
    results.set(size, benchResult);

    console.log(`  Shred: ${result.shred.throughput.toLocaleString()} entries/s`);
    console.log(`  Queries:`);
    for (const q of result.queries) {
      console.log(`    ${q.queryType}: ${q.throughput.toFixed(0)} queries/s (${q.avgTimeMs.toFixed(3)}ms avg)`);
    }
  }

  return results;
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format benchmark result as string
 */
export function formatBenchmarkResult(result: WiktionaryBenchmarkResult): string {
  const lines: string[] = [
    `=== WIKTIONARY ${result.size.toUpperCase()} Benchmark (${result.entryCount.toLocaleString()} entries) ===`,
    '',
    'Shredding:',
    `  Time: ${result.shred.shredTimeMs.toFixed(2)}ms`,
    `  Throughput: ${result.shred.throughput.toLocaleString()} entries/s`,
    `  Columns: ${result.shred.columnCount}`,
    `  Size: ${formatBytes(result.shred.totalSizeBytes)}`,
    `  Compression: ${result.shred.compressionRatio.toFixed(2)}x`,
    '',
    'Queries:',
  ];

  for (const q of result.queries) {
    lines.push(`  ${q.queryType}:`);
    lines.push(`    Avg Time: ${q.avgTimeMs.toFixed(3)}ms`);
    lines.push(`    Throughput: ${q.throughput.toFixed(0)} queries/s`);
    lines.push(`    Results: ${q.resultCount}`);
  }

  if (result.encode) {
    lines.push(
      '',
      'Encoding:',
      `  Time: ${result.encode.timeMs.toFixed(2)}ms`,
      `  Throughput: ${result.encode.throughput.toLocaleString()} entries/s`,
      `  Output size: ${formatBytes(result.encode.outputSizeBytes)}`
    );
  }

  if (result.decode) {
    lines.push(
      '',
      'Decoding:',
      `  Time: ${result.decode.timeMs.toFixed(2)}ms`,
      `  Throughput: ${result.decode.throughput.toLocaleString()} entries/s`
    );
  }

  return lines.join('\n');
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

/**
 * Get column statistics for analysis
 */
export function getColumnStats(
  entries: WiktionaryEntry[]
): Map<string, { nullCount: number; distinctCount: number; type: string }> {
  const columns = shred(entries as unknown[]);
  const stats = new Map<string, { nullCount: number; distinctCount: number; type: string }>();

  const typeNames = ['Null', 'Bool', 'Int32', 'Int64', 'Float64', 'String', 'Binary', 'Array', 'Object', 'Timestamp', 'Date'];

  for (const col of columns) {
    const nullCount = col.nulls.filter(n => n).length;
    const distinctSet = new Set(col.values.filter((_, i) => !col.nulls[i]));

    stats.set(col.path, {
      nullCount,
      distinctCount: distinctSet.size,
      type: typeNames[col.type] || 'Unknown',
    });
  }

  return stats;
}

/**
 * Analyze schema complexity
 */
export function analyzeSchema(entries: WiktionaryEntry[]): {
  paths: string[];
  maxDepth: number;
  arrayPaths: string[];
  nullability: Map<string, number>;
} {
  const columns = shred(entries as unknown[]);
  const paths = columns.map(c => c.path);

  // Calculate max depth
  let maxDepth = 0;
  for (const path of paths) {
    const depth = path.split('.').length;
    maxDepth = Math.max(maxDepth, depth);
  }

  // Find array paths (contain numeric indices)
  const arrayPaths = paths.filter(p => /\.\d+\./.test(p) || /\.\d+$/.test(p));

  // Calculate nullability
  const nullability = new Map<string, number>();
  for (const col of columns) {
    const nullCount = col.nulls.filter(n => n).length;
    nullability.set(col.path, nullCount / col.nulls.length);
  }

  return { paths, maxDepth, arrayPaths, nullability };
}
