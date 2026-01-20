/**
 * JSONBench Shredding Integration
 *
 * Integrates @evodb/core shredder with Bluesky event data for benchmarking.
 * Measures columnar shredding throughput for different data sizes.
 */

import { shred, encode, decode, type Column, type EncodedColumn } from '@evodb/core';
import type { BlueskyEventJson, DataSize, ShredResult, BenchmarkResult } from './types.js';
import { DATA_SIZES } from './types.js';
import { generateEvents } from './generator.js';

/**
 * Shredding options
 */
export interface ShredOptions {
  /** Column paths to extract (null for all columns) */
  columns?: string[];
  /** Whether to encode columns after shredding */
  encode?: boolean;
  /** Whether to write to block format */
  writeBlock?: boolean;
}

/**
 * Shred Bluesky events into columnar format
 *
 * @param events Array of Bluesky events
 * @param options Shredding options
 * @returns Shredded columns
 */
export function shredEvents(
  events: BlueskyEventJson[],
  options: ShredOptions = {}
): Column[] {
  return shred(events as unknown[], {
    columns: options.columns,
  });
}

/**
 * Benchmark shredding for a batch of events
 *
 * @param events Array of Bluesky events
 * @returns Shredding result with metrics
 */
export function benchmarkShred(events: BlueskyEventJson[]): ShredResult {
  const jsonSize = JSON.stringify(events).length;

  const start = performance.now();
  const columns = shred(events as unknown[]);
  const shredTimeMs = performance.now() - start;

  // Estimate column size
  let totalSizeBytes = 0;
  for (const col of columns) {
    // Rough estimate: path string + values + nulls bitmap
    totalSizeBytes += col.path.length * 2;
    totalSizeBytes += col.values.length * 8; // Average 8 bytes per value
    totalSizeBytes += Math.ceil(col.nulls.length / 8); // 1 bit per null flag
  }

  return {
    eventCount: events.length,
    columnCount: columns.length,
    shredTimeMs,
    throughput: events.length / (shredTimeMs / 1000),
    totalSizeBytes,
    compressionRatio: jsonSize / totalSizeBytes,
  };
}

/**
 * Full benchmark including encode and decode
 *
 * @param events Array of Bluesky events
 * @returns Complete benchmark result
 */
export function benchmarkFull(events: BlueskyEventJson[]): BenchmarkResult & { columns: Column[] } {
  const jsonSize = JSON.stringify(events).length;

  // Shred
  const shredStart = performance.now();
  const columns = shred(events as unknown[]);
  const shredTimeMs = performance.now() - shredStart;

  // Encode
  let encodeTimeMs = 0;
  let encodedSize = 0;
  let encoded: EncodedColumn[] = [];

  try {
    const encodeStart = performance.now();
    encoded = encode(columns);
    encodeTimeMs = performance.now() - encodeStart;
    encodedSize = encoded.reduce((sum, col) => sum + col.data.length + col.nullBitmap.length, 0);
  } catch (e) {
    // Encoding may fail for certain data types - skip silently
  }

  // Decode (may fail for dictionary-encoded columns with large cardinality)
  let decodeTimeMs = 0;
  if (encoded.length > 0) {
    try {
      const decodeStart = performance.now();
      encoded.map(col => decode(col, events.length));
      decodeTimeMs = performance.now() - decodeStart;
    } catch (e) {
      // Decode can fail for certain column types - skip silently
    }
  }

  // Estimate shredded column size
  let shredSizeBytes = 0;
  for (const col of columns) {
    shredSizeBytes += col.path.length * 2;
    shredSizeBytes += col.values.length * 8;
    shredSizeBytes += Math.ceil(col.nulls.length / 8);
  }

  const result: BenchmarkResult & { columns: Column[] } = {
    size: getSizeCategory(events.length),
    eventCount: events.length,
    columns,
    shred: {
      eventCount: events.length,
      columnCount: columns.length,
      shredTimeMs,
      throughput: events.length / (shredTimeMs / 1000),
      totalSizeBytes: shredSizeBytes,
      compressionRatio: jsonSize / shredSizeBytes,
    },
  };

  // Only include encode/decode metrics if they succeeded
  if (encodeTimeMs > 0) {
    result.encode = {
      timeMs: encodeTimeMs,
      outputSizeBytes: encodedSize,
      throughput: events.length / (encodeTimeMs / 1000),
    };
  }

  if (decodeTimeMs > 0) {
    result.decode = {
      timeMs: decodeTimeMs,
      throughput: events.length / (decodeTimeMs / 1000),
    };
  }

  return result;
}

/**
 * Get size category for event count
 */
function getSizeCategory(count: number): DataSize {
  if (count <= DATA_SIZES.tiny) return 'tiny';
  if (count <= DATA_SIZES.small) return 'small';
  if (count <= DATA_SIZES.medium) return 'medium';
  return 'large';
}

/**
 * Run comprehensive benchmark for all sizes
 *
 * @param sizes Sizes to benchmark (defaults to all)
 * @returns Map of size to benchmark results
 */
export async function runBenchmarks(
  sizes: DataSize[] = ['tiny', 'small']
): Promise<Map<DataSize, BenchmarkResult>> {
  const results = new Map<DataSize, BenchmarkResult>();

  for (const size of sizes) {
    const eventCount = DATA_SIZES[size];

    // Skip large benchmarks by default to avoid memory issues
    if (eventCount > 1_000_000) {
      console.warn(`Skipping ${size} benchmark (${eventCount} events) to avoid memory issues`);
      continue;
    }

    console.log(`Generating ${size} dataset (${eventCount.toLocaleString()} events)...`);
    const events = generateEvents(eventCount);

    console.log(`Running ${size} benchmark...`);
    const result = benchmarkFull(events);

    // Remove columns from result to avoid memory issues
    const { columns: _, ...benchResult } = result;
    results.set(size, benchResult);

    console.log(`  Shred: ${result.shred.throughput.toLocaleString()} events/s`);
    if (result.encode) {
      console.log(`  Encode: ${result.encode.throughput.toLocaleString()} events/s`);
    }
    if (result.decode) {
      console.log(`  Decode: ${result.decode.throughput.toLocaleString()} events/s`);
    }
  }

  return results;
}

/**
 * Benchmark shredding with streaming (for large datasets)
 *
 * @param eventIterator Async iterator of event batches
 * @param batchSize Events per batch
 * @returns Aggregate benchmark result
 */
export async function benchmarkStreaming(
  eventIterator: AsyncIterable<BlueskyEventJson[]>
): Promise<ShredResult> {
  let totalEvents = 0;
  let totalColumns = 0;
  let totalTimeMs = 0;
  let totalSizeBytes = 0;
  let totalJsonSize = 0;

  for await (const batch of eventIterator) {
    const jsonSize = JSON.stringify(batch).length;
    totalJsonSize += jsonSize;

    const start = performance.now();
    const columns = shred(batch as unknown[]);
    totalTimeMs += performance.now() - start;

    totalEvents += batch.length;
    totalColumns = Math.max(totalColumns, columns.length);

    for (const col of columns) {
      totalSizeBytes += col.path.length * 2;
      totalSizeBytes += col.values.length * 8;
      totalSizeBytes += Math.ceil(col.nulls.length / 8);
    }
  }

  return {
    eventCount: totalEvents,
    columnCount: totalColumns,
    shredTimeMs: totalTimeMs,
    throughput: totalEvents / (totalTimeMs / 1000),
    totalSizeBytes,
    compressionRatio: totalJsonSize / totalSizeBytes,
  };
}

/**
 * Get column path statistics from shredded events
 *
 * @param events Events to analyze
 * @returns Map of path to statistics
 */
export function getColumnStats(
  events: BlueskyEventJson[]
): Map<string, { nullCount: number; distinctCount: number }> {
  const columns = shred(events as unknown[]);
  const stats = new Map<string, { nullCount: number; distinctCount: number }>();

  for (const col of columns) {
    const nullCount = col.nulls.filter(n => n).length;
    const distinctSet = new Set(col.values.filter((_, i) => !col.nulls[i]));

    stats.set(col.path, {
      nullCount,
      distinctCount: distinctSet.size,
    });
  }

  return stats;
}

/**
 * Analyze schema from events
 *
 * @param events Events to analyze
 * @returns Schema analysis
 */
export function analyzeSchema(events: BlueskyEventJson[]): {
  paths: string[];
  types: Map<string, string>;
  nullability: Map<string, number>;
  cardinality: Map<string, number>;
} {
  const columns = shred(events as unknown[]);

  const paths = columns.map(c => c.path);
  const types = new Map<string, string>();
  const nullability = new Map<string, number>();
  const cardinality = new Map<string, number>();

  const typeNames = ['Null', 'Bool', 'Int32', 'Int64', 'Float64', 'String', 'Binary', 'Array', 'Object', 'Timestamp', 'Date'];

  for (const col of columns) {
    types.set(col.path, typeNames[col.type] || 'Unknown');

    const nullCount = col.nulls.filter(n => n).length;
    nullability.set(col.path, nullCount / col.nulls.length);

    const distinctSet = new Set(col.values.filter((_, i) => !col.nulls[i]));
    cardinality.set(col.path, distinctSet.size);
  }

  return { paths, types, nullability, cardinality };
}

/**
 * Format benchmark result as a string
 */
export function formatBenchmarkResult(result: BenchmarkResult): string {
  const lines: string[] = [
    `=== ${result.size.toUpperCase()} Benchmark (${result.eventCount.toLocaleString()} events) ===`,
    '',
    'Shredding:',
    `  Time: ${result.shred.shredTimeMs.toFixed(2)}ms`,
    `  Throughput: ${result.shred.throughput.toLocaleString()} events/s`,
    `  Columns: ${result.shred.columnCount}`,
    `  Size: ${formatBytes(result.shred.totalSizeBytes)}`,
    `  Compression: ${result.shred.compressionRatio.toFixed(2)}x`,
  ];

  if (result.encode) {
    lines.push(
      '',
      'Encoding:',
      `  Time: ${result.encode.timeMs.toFixed(2)}ms`,
      `  Throughput: ${result.encode.throughput.toLocaleString()} events/s`,
      `  Output size: ${formatBytes(result.encode.outputSizeBytes)}`
    );
  }

  if (result.decode) {
    lines.push(
      '',
      'Decoding:',
      `  Time: ${result.decode.timeMs.toFixed(2)}ms`,
      `  Throughput: ${result.decode.throughput.toLocaleString()} events/s`
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
 * Compare two benchmark results
 */
export function compareBenchmarks(
  baseline: BenchmarkResult,
  current: BenchmarkResult
): {
  shredSpeedup: number;
  encodeSpeedup?: number;
  decodeSpeedup?: number;
} {
  const result: {
    shredSpeedup: number;
    encodeSpeedup?: number;
    decodeSpeedup?: number;
  } = {
    shredSpeedup: current.shred.throughput / baseline.shred.throughput,
  };

  if (baseline.encode && current.encode) {
    result.encodeSpeedup = current.encode.throughput / baseline.encode.throughput;
  }

  if (baseline.decode && current.decode) {
    result.decodeSpeedup = current.decode.throughput / baseline.decode.throughput;
  }

  return result;
}
