/**
 * Columnar Decode Benchmark
 *
 * Tests columnar data decoding performance within Snippets 5ms CPU constraint.
 * This is critical for query execution - we must be able to decode columnar
 * data (similar to Parquet/Arrow format) within the strict time limit.
 *
 * @module @evodb/benchmark/snippets/columnar-decode
 */

import {
  SNIPPETS_CONSTRAINTS,
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
 * Columnar data types supported
 */
export type ColumnarType = 'int32' | 'int64' | 'float32' | 'float64' | 'string' | 'bool';

/**
 * Column definition for generated data
 */
export interface ColumnDefinition {
  name: string;
  type: ColumnarType;
  nullable: boolean;
  cardinality?: number; // For dictionary encoding
}

/**
 * Generated columnar data
 */
export interface ColumnarData {
  /** Number of rows */
  rowCount: number;
  /** Column definitions */
  columns: ColumnDefinition[];
  /** Raw encoded bytes (simulating wire format) */
  encodedBytes: ArrayBuffer;
  /** Uncompressed size in bytes */
  uncompressedSize: number;
  /** Per-column data buffers */
  columnBuffers: Map<string, ArrayBuffer>;
}

/**
 * Decoded columnar result
 */
export interface DecodedResult {
  /** Number of rows decoded */
  rowCount: number;
  /** Decoded column values */
  columns: Map<string, TypedColumnData>;
  /** Total bytes decoded */
  bytesDecoded: number;
}

/**
 * Typed column data after decoding
 */
export type TypedColumnData =
  | { type: 'int32'; values: Int32Array; nullBitmap?: Uint8Array }
  | { type: 'int64'; values: BigInt64Array; nullBitmap?: Uint8Array }
  | { type: 'float32'; values: Float32Array; nullBitmap?: Uint8Array }
  | { type: 'float64'; values: Float64Array; nullBitmap?: Uint8Array }
  | { type: 'string'; values: string[]; nullBitmap?: Uint8Array }
  | { type: 'bool'; values: Uint8Array; nullBitmap?: Uint8Array };

/**
 * Benchmark result for columnar decode
 */
export interface ColumnarDecodeBenchmarkResult {
  /** Benchmark name */
  name: string;
  /** Data size in MB */
  dataSizeMb: number;
  /** Number of rows */
  rowCount: number;
  /** Number of columns */
  columnCount: number;
  /** CPU time in milliseconds */
  cpuMs: number;
  /** Throughput in MB/s */
  throughputMbps: number;
  /** Rows decoded per millisecond */
  rowsPerMs: number;
  /** Whether within Snippets constraints */
  withinConstraints: boolean;
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
// Data Generation
// =============================================================================

/**
 * Generate columnar data for benchmarking
 *
 * @param sizeMb - Target size in megabytes
 * @param columns - Column definitions (default: mixed types)
 * @returns Generated columnar data
 */
export function generateColumnarData(
  sizeMb: number,
  columns?: ColumnDefinition[]
): ColumnarData {
  const targetBytes = sizeMb * 1024 * 1024;

  // Default schema: mixed types typical of analytics workloads
  const defaultColumns: ColumnDefinition[] = columns ?? [
    { name: 'id', type: 'int64', nullable: false },
    { name: 'timestamp', type: 'int64', nullable: false },
    { name: 'user_id', type: 'int32', nullable: false },
    { name: 'value', type: 'float64', nullable: true },
    { name: 'category', type: 'string', nullable: true, cardinality: 100 },
    { name: 'is_valid', type: 'bool', nullable: false },
  ];

  // Calculate bytes per row based on column types
  const bytesPerRow = calculateBytesPerRow(defaultColumns);

  // Target row count
  const rowCount = Math.floor(targetBytes / bytesPerRow);

  // Generate column buffers
  const columnBuffers = new Map<string, ArrayBuffer>();
  let totalBytes = 0;

  for (const col of defaultColumns) {
    const buffer = generateColumnBuffer(col, rowCount);
    columnBuffers.set(col.name, buffer);
    totalBytes += buffer.byteLength;
  }

  // Combine into single encoded buffer (simulating wire format)
  const encodedBytes = combineColumnBuffers(columnBuffers, defaultColumns);

  return {
    rowCount,
    columns: defaultColumns,
    encodedBytes,
    uncompressedSize: totalBytes,
    columnBuffers,
  };
}

function calculateBytesPerRow(columns: ColumnDefinition[]): number {
  let bytes = 0;
  for (const col of columns) {
    switch (col.type) {
      case 'int32':
      case 'float32':
        bytes += 4;
        break;
      case 'int64':
      case 'float64':
        bytes += 8;
        break;
      case 'string':
        bytes += 16; // Average string length assumption
        break;
      case 'bool':
        bytes += 1;
        break;
    }
    if (col.nullable) {
      bytes += 0.125; // Null bitmap overhead
    }
  }
  return bytes;
}

function generateColumnBuffer(col: ColumnDefinition, rowCount: number): ArrayBuffer {
  switch (col.type) {
    case 'int32': {
      const data = new Int32Array(rowCount);
      for (let i = 0; i < rowCount; i++) {
        data[i] = Math.floor(Math.random() * 1_000_000);
      }
      return data.buffer;
    }
    case 'int64': {
      const data = new BigInt64Array(rowCount);
      for (let i = 0; i < rowCount; i++) {
        data[i] = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
      }
      return data.buffer;
    }
    case 'float32': {
      const data = new Float32Array(rowCount);
      for (let i = 0; i < rowCount; i++) {
        data[i] = Math.random() * 1000;
      }
      return data.buffer;
    }
    case 'float64': {
      const data = new Float64Array(rowCount);
      for (let i = 0; i < rowCount; i++) {
        data[i] = Math.random() * 1000000;
      }
      return data.buffer;
    }
    case 'string': {
      // Dictionary-encode strings for efficiency
      const cardinality = col.cardinality ?? 100;
      const dictionary: string[] = [];
      for (let i = 0; i < cardinality; i++) {
        dictionary.push(`category_${i.toString().padStart(4, '0')}`);
      }
      // Store indices as int32
      const indices = new Int32Array(rowCount);
      for (let i = 0; i < rowCount; i++) {
        indices[i] = Math.floor(Math.random() * cardinality);
      }
      return indices.buffer;
    }
    case 'bool': {
      const data = new Uint8Array(Math.ceil(rowCount / 8));
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.floor(Math.random() * 256);
      }
      return data.buffer;
    }
  }
}

function combineColumnBuffers(
  buffers: Map<string, ArrayBuffer>,
  columns: ColumnDefinition[]
): ArrayBuffer {
  // Calculate total size
  let totalSize = 0;
  for (const col of columns) {
    const buffer = buffers.get(col.name);
    if (buffer) {
      totalSize += buffer.byteLength;
    }
  }

  // Combine into single buffer
  const combined = new ArrayBuffer(totalSize);
  const view = new Uint8Array(combined);

  let offset = 0;
  for (const col of columns) {
    const buffer = buffers.get(col.name);
    if (buffer) {
      view.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }
  }

  return combined;
}

// =============================================================================
// Columnar Decode Implementation
// =============================================================================

/**
 * Decode columnar data from encoded bytes
 * This simulates the actual decode path used in Snippets
 *
 * @param data - Encoded columnar data
 * @returns Decoded result with typed arrays
 */
export function decodeColumnar(data: ColumnarData): DecodedResult {
  const columns = new Map<string, TypedColumnData>();
  let bytesDecoded = 0;

  // Decode each column
  for (const colDef of data.columns) {
    const buffer = data.columnBuffers.get(colDef.name);
    if (!buffer) continue;

    const decoded = decodeColumn(buffer, colDef, data.rowCount);
    columns.set(colDef.name, decoded);
    bytesDecoded += buffer.byteLength;
  }

  return {
    rowCount: data.rowCount,
    columns,
    bytesDecoded,
  };
}

function decodeColumn(
  buffer: ArrayBuffer,
  def: ColumnDefinition,
  rowCount: number
): TypedColumnData {
  switch (def.type) {
    case 'int32':
      return {
        type: 'int32',
        values: new Int32Array(buffer.slice(0)),
      };
    case 'int64':
      return {
        type: 'int64',
        values: new BigInt64Array(buffer.slice(0)),
      };
    case 'float32':
      return {
        type: 'float32',
        values: new Float32Array(buffer.slice(0)),
      };
    case 'float64':
      return {
        type: 'float64',
        values: new Float64Array(buffer.slice(0)),
      };
    case 'string': {
      // Dictionary-encoded: decode indices and lookup
      const indices = new Int32Array(buffer.slice(0));
      const cardinality = def.cardinality ?? 100;
      const dictionary: string[] = [];
      for (let i = 0; i < cardinality; i++) {
        dictionary.push(`category_${i.toString().padStart(4, '0')}`);
      }
      const values: string[] = new Array(rowCount);
      for (let i = 0; i < rowCount; i++) {
        values[i] = dictionary[indices[i]];
      }
      return {
        type: 'string',
        values,
      };
    }
    case 'bool':
      return {
        type: 'bool',
        values: new Uint8Array(buffer.slice(0)),
      };
  }
}

/**
 * Decode with column projection (only decode selected columns)
 * This is more efficient when queries only need subset of columns
 *
 * @param data - Encoded columnar data
 * @param projectedColumns - Names of columns to decode
 * @returns Decoded result with only projected columns
 */
export function decodeColumnarProjected(
  data: ColumnarData,
  projectedColumns: string[]
): DecodedResult {
  const columns = new Map<string, TypedColumnData>();
  let bytesDecoded = 0;

  const projectedSet = new Set(projectedColumns);

  for (const colDef of data.columns) {
    if (!projectedSet.has(colDef.name)) continue;

    const buffer = data.columnBuffers.get(colDef.name);
    if (!buffer) continue;

    const decoded = decodeColumn(buffer, colDef, data.rowCount);
    columns.set(colDef.name, decoded);
    bytesDecoded += buffer.byteLength;
  }

  return {
    rowCount: data.rowCount,
    columns,
    bytesDecoded,
  };
}

// =============================================================================
// Benchmark Functions
// =============================================================================

/**
 * Benchmark columnar decode for a given data size
 *
 * @param dataSizeMb - Data size in megabytes
 * @param iterations - Number of benchmark iterations
 * @returns Detailed benchmark result
 */
export async function benchmarkColumnarDecode(
  dataSizeMb: number,
  iterations: number = 20
): Promise<ColumnarDecodeBenchmarkResult> {
  // Generate test data
  const data = generateColumnarData(dataSizeMb);

  // Run benchmark
  const timing = runBenchmark(
    () => decodeColumnar(data),
    iterations,
    3 // warmup iterations
  );

  const cpuMs = timing.p99Ms; // Use p99 for constraint validation (worst case)

  const metrics: BenchmarkMetrics = {
    cpuMs,
    memoryMb: dataSizeMb * 2, // Approximate: input + output buffers
  };

  const validation = validateConstraints(metrics);

  return {
    name: 'columnar-decode',
    dataSizeMb,
    rowCount: data.rowCount,
    columnCount: data.columns.length,
    cpuMs,
    throughputMbps: dataSizeMb / (timing.avgMs / 1000),
    rowsPerMs: data.rowCount / timing.avgMs,
    withinConstraints: validation.withinConstraints,
    validation,
    timing,
  };
}

/**
 * Benchmark columnar decode with column projection
 *
 * @param dataSizeMb - Data size in megabytes
 * @param projectedColumnRatio - Ratio of columns to project (0-1)
 * @param iterations - Number of benchmark iterations
 * @returns Detailed benchmark result
 */
export async function benchmarkColumnarDecodeProjected(
  dataSizeMb: number,
  projectedColumnRatio: number = 0.5,
  iterations: number = 20
): Promise<ColumnarDecodeBenchmarkResult> {
  const data = generateColumnarData(dataSizeMb);

  // Select subset of columns
  const numColumnsToProject = Math.max(
    1,
    Math.floor(data.columns.length * projectedColumnRatio)
  );
  const projectedColumns = data.columns
    .slice(0, numColumnsToProject)
    .map((c) => c.name);

  const timing = runBenchmark(
    () => decodeColumnarProjected(data, projectedColumns),
    iterations,
    3
  );

  const cpuMs = timing.p99Ms;

  const metrics: BenchmarkMetrics = {
    cpuMs,
    memoryMb: (dataSizeMb * projectedColumnRatio) * 2,
  };

  const validation = validateConstraints(metrics);

  return {
    name: 'columnar-decode-projected',
    dataSizeMb: dataSizeMb * projectedColumnRatio,
    rowCount: data.rowCount,
    columnCount: numColumnsToProject,
    cpuMs,
    throughputMbps: (dataSizeMb * projectedColumnRatio) / (timing.avgMs / 1000),
    rowsPerMs: data.rowCount / timing.avgMs,
    withinConstraints: validation.withinConstraints,
    validation,
    timing,
  };
}

/**
 * Find maximum data size that can be decoded within 5ms constraint
 *
 * @returns Maximum safe data size in MB
 */
export async function findMaxDecodeSizeMb(): Promise<{
  maxSizeMb: number;
  results: ColumnarDecodeBenchmarkResult[];
}> {
  const results: ColumnarDecodeBenchmarkResult[] = [];

  // Test increasing sizes
  const testSizes = [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];

  let maxSizeMb = 0;

  for (const size of testSizes) {
    const result = await benchmarkColumnarDecode(size, 10);
    results.push(result);

    if (result.withinConstraints) {
      maxSizeMb = size;
    } else {
      break;
    }
  }

  return { maxSizeMb, results };
}

// =============================================================================
// Reporting
// =============================================================================

/**
 * Format benchmark result for console output
 */
export function formatColumnarDecodeResult(
  result: ColumnarDecodeBenchmarkResult
): string {
  const lines: string[] = [];

  lines.push(`\n=== Columnar Decode Benchmark ===`);
  lines.push(`Data size: ${formatBytes(result.dataSizeMb * 1024 * 1024)}`);
  lines.push(`Rows: ${result.rowCount.toLocaleString()}`);
  lines.push(`Columns: ${result.columnCount}`);
  lines.push(`---`);
  lines.push(`CPU Time (p99): ${formatMs(result.cpuMs)}`);
  lines.push(`Throughput: ${result.throughputMbps.toFixed(1)} MB/s`);
  lines.push(`Rows/ms: ${Math.floor(result.rowsPerMs).toLocaleString()}`);
  lines.push(`---`);
  lines.push(`Timing: avg=${formatMs(result.timing.avgMs)}, min=${formatMs(result.timing.minMs)}, max=${formatMs(result.timing.maxMs)}`);
  lines.push(`p50=${formatMs(result.timing.p50Ms)}, p99=${formatMs(result.timing.p99Ms)}`);
  lines.push(`---`);
  lines.push(`Within 5ms constraint: ${result.withinConstraints ? 'YES' : 'NO'}`);
  lines.push(`CPU margin: ${formatMs(result.validation.margins.cpuMarginMs)}`);

  return lines.join('\n');
}
