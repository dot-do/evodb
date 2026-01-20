// Encodings: RLE, Dictionary, Delta (~1.4KB budget combined)
// Optimized with TypedArrays for performance
//
// For Snippet-optimized format, see snippet-format.ts which provides:
// - Delta + BitPacking for sorted integers (no decompression needed)
// - Dictionary with binary search for strings
// - Bitmap for nulls and booleans
// - Zero-copy decode paths
// - Zone maps for chunk skipping
// - Bloom filters for fast lookups

import { type Column, type ColumnStats, type EncodedColumn, Encoding, Type, assertNever } from './types.js';
import { internString } from './string-intern-pool.js';

/** Encode column with automatic encoding selection */
export function encode(columns: Column[]): EncodedColumn[] {
  return columns.map(col => {
    const stats = computeStats(col);
    const nullBitmap = packBits(col.nulls);
    const { encoding, data } = selectAndEncode(col, stats);
    return { path: col.path, type: col.type, encoding, data, nullBitmap, stats };
  });
}

/** Compute column statistics */
function computeStats(col: Column): ColumnStats {
  let min: unknown = undefined, max: unknown = undefined, nullCount = 0;
  const seen = new Set<unknown>();

  for (let i = 0; i < col.values.length; i++) {
    if (col.nulls[i]) { nullCount++; continue; }
    const v = col.values[i];
    seen.add(v);
    if (min === undefined || (v as number) < (min as number)) min = v;
    if (max === undefined || (v as number) > (max as number)) max = v;
  }

  return { min, max, nullCount, distinctEst: seen.size };
}

/** Pack boolean array to bitmap */
function packBits(bits: boolean[]): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[i >>> 3] |= 1 << (i & 7);
  }
  return bytes;
}

/** Unpack bitmap to boolean array */
export function unpackBits(bytes: Uint8Array, count: number): boolean[] {
  const bits: boolean[] = new Array(count);
  for (let i = 0; i < count; i++) {
    bits[i] = (bytes[i >>> 3] & (1 << (i & 7))) !== 0;
  }
  return bits;
}

/** Select best encoding and encode data */
function selectAndEncode(col: Column, stats: ColumnStats): { encoding: Encoding; data: Uint8Array } {
  const nonNull = col.values.filter((_, i) => !col.nulls[i]);
  if (nonNull.length === 0) return { encoding: Encoding.Plain, data: new Uint8Array(0) };

  // Dictionary for low cardinality strings (use stricter threshold for better compression)
  if (col.type === Type.String && stats.distinctEst < nonNull.length / 2) {
    return { encoding: Encoding.Dict, data: encodeDictOptimized(nonNull as string[], col.nulls) };
  }

  // Delta for sorted integers - good for timestamps and sequential IDs
  if ((col.type === Type.Int32 || col.type === Type.Int64) && isSorted(nonNull as number[])) {
    return { encoding: Encoding.Delta, data: encodeDeltaTypedArray(nonNull as number[], col.type) };
  }

  // RLE for runs of same value
  const runs = countRuns(nonNull);
  if (runs < nonNull.length / 3) {
    return { encoding: Encoding.RLE, data: encodeRLE(col) };
  }

  // Plain encoding with TypedArray optimization for numeric types
  if (col.type === Type.Int32 || col.type === Type.Float64) {
    return { encoding: Encoding.Plain, data: encodePlainTypedArray(col) };
  }

  // Default: plain encoding
  return { encoding: Encoding.Plain, data: encodePlain(col) };
}

/** Check if array is sorted */
function isSorted(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) if (arr[i] < arr[i - 1]) return false;
  return true;
}

/** Count runs of consecutive equal values */
function countRuns(arr: unknown[]): number {
  let runs = 1;
  for (let i = 1; i < arr.length; i++) if (arr[i] !== arr[i - 1]) runs++;
  return runs;
}

/** Dictionary encoding - optimized with string interning */
function encodeDictOptimized(values: string[], nulls: boolean[]): Uint8Array {
  const dict = new Map<string, number>();
  const indices = new Uint16Array(values.length);
  let idx = 0;

  // Build dictionary with interned strings
  for (let i = 0; i < values.length; i++) {
    if (nulls[i]) { indices[i] = 0xFFFF; continue; }
    const v = internString(values[i]);
    if (!dict.has(v)) dict.set(v, idx++);
    indices[i] = dict.get(v)!;
  }

  const entries = [...dict.keys()];
  const encoder = new TextEncoder();
  const encoded = entries.map(s => encoder.encode(s));
  const totalLen = encoded.reduce((a, b) => a + b.length + 2, 0);

  const result = new Uint8Array(4 + totalLen + indices.length * 2);
  const view = new DataView(result.buffer);
  let offset = 0;

  // Dict size
  view.setUint32(offset, entries.length, true); offset += 4;

  // Dict entries
  for (const e of encoded) {
    view.setUint16(offset, e.length, true); offset += 2;
    result.set(e, offset); offset += e.length;
  }

  // Indices - copy from TypedArray
  new Uint8Array(result.buffer, offset, indices.length * 2).set(new Uint8Array(indices.buffer));

  return result.slice(0, offset + indices.length * 2);
}

// encodeDict is now an alias for encodeDictOptimized (kept for export if needed)
export { encodeDictOptimized as encodeDict };

/** Delta encoding for integers - TypedArray optimized */
function encodeDeltaTypedArray(values: number[], type: Type): Uint8Array {
  if (values.length === 0) return new Uint8Array(0);

  if (type === Type.Int32) {
    // Use Int32Array directly for better performance
    const deltas = new Int32Array(values.length);
    deltas[0] = values[0];
    for (let i = 1; i < values.length; i++) {
      deltas[i] = values[i] - values[i - 1];
    }
    return new Uint8Array(deltas.buffer);
  }

  // Int64 path - need DataView for BigInt
  const result = new Uint8Array(values.length * 8);
  const view = new DataView(result.buffer);
  view.setBigInt64(0, BigInt(values[0]), true);
  for (let i = 1; i < values.length; i++) {
    view.setBigInt64(i * 8, BigInt(values[i] - values[i - 1]), true);
  }
  return result;
}

// encodeDelta is now an alias for encodeDeltaTypedArray (kept for export if needed)
export { encodeDeltaTypedArray as encodeDelta };

/** RLE encoding */
function encodeRLE(col: Column): Uint8Array {
  const chunks: Uint8Array[] = [];
  let i = 0;
  const encoder = new TextEncoder();

  while (i < col.values.length) {
    const v = col.values[i];
    let count = 1;
    while (i + count < col.values.length && col.values[i + count] === v && col.nulls[i + count] === col.nulls[i]) {
      count++;
    }

    const valueBytes = encodeValue(v, col.type, encoder);
    const chunk = new Uint8Array(4 + 1 + valueBytes.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, count, true);
    chunk[4] = col.nulls[i] ? 1 : 0;
    chunk.set(valueBytes, 5);
    chunks.push(chunk);

    i += count;
  }

  return concatArrays(chunks);
}

/** Plain encoding - TypedArray optimized for numeric types */
function encodePlainTypedArray(col: Column): Uint8Array {
  const nonNullCount = col.nulls.filter(n => !n).length;

  if (col.type === Type.Int32) {
    const arr = new Int32Array(nonNullCount);
    let idx = 0;
    for (let i = 0; i < col.values.length; i++) {
      if (!col.nulls[i]) arr[idx++] = col.values[i] as number;
    }
    return new Uint8Array(arr.buffer);
  }

  if (col.type === Type.Float64) {
    const arr = new Float64Array(nonNullCount);
    let idx = 0;
    for (let i = 0; i < col.values.length; i++) {
      if (!col.nulls[i]) arr[idx++] = col.values[i] as number;
    }
    return new Uint8Array(arr.buffer);
  }

  // Fall back to generic encoding for other types
  return encodePlain(col);
}

/** Plain encoding */
function encodePlain(col: Column): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  for (let i = 0; i < col.values.length; i++) {
    if (col.nulls[i]) continue;
    chunks.push(encodeValue(col.values[i], col.type, encoder));
  }

  return concatArrays(chunks);
}

/** Encode single value */
function encodeValue(v: unknown, type: Type, encoder: InstanceType<typeof TextEncoder>): Uint8Array {
  if (v === null || v === undefined) return new Uint8Array(0);

  switch (type) {
    case Type.Null: return new Uint8Array(0);
    case Type.Bool: return new Uint8Array([v ? 1 : 0]);
    case Type.Int32: { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v as number, true); return b; }
    case Type.Int64: { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(v as number | bigint), true); return b; }
    case Type.Float64: { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v as number, true); return b; }
    case Type.String: { const e = encoder.encode(v as string); const b = new Uint8Array(2 + e.length); new DataView(b.buffer).setUint16(0, e.length, true); b.set(e, 2); return b; }
    case Type.Binary: { const d = v as Uint8Array; const b = new Uint8Array(4 + d.length); new DataView(b.buffer).setUint32(0, d.length, true); b.set(d, 4); return b; }
    case Type.Array: return new Uint8Array(0); // Complex types serialized as JSON in practice
    case Type.Object: return new Uint8Array(0);
    case Type.Timestamp: { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(v as number), true); return b; }
    case Type.Date: { const e = encoder.encode(v as string); const b = new Uint8Array(2 + e.length); new DataView(b.buffer).setUint16(0, e.length, true); b.set(e, 2); return b; }
    default:
      return assertNever(type, `Unhandled type in encodeValue: ${type}`);
  }
}

/** Concat Uint8Arrays */
function concatArrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((a, b) => a + b.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) { result.set(arr, offset); offset += arr.length; }
  return result;
}

/** Decode column data */
export function decode(encoded: EncodedColumn, rowCount: number): Column {
  const nulls = unpackBits(encoded.nullBitmap, rowCount);
  const values = decodeData(encoded.data, encoded.encoding, encoded.type, nulls, rowCount);
  return { path: encoded.path, type: encoded.type, nullable: nulls.some(n => n), values, nulls };
}

/** Decode data based on encoding */
function decodeData(data: Uint8Array, encoding: Encoding, type: Type, nulls: boolean[], rowCount: number): unknown[] {
  if (data.length === 0) return new Array(rowCount).fill(null);

  switch (encoding) {
    case Encoding.Plain: return decodePlain(data, type, nulls, rowCount);
    case Encoding.RLE: return decodeRLE(data, type, rowCount);
    case Encoding.Dict: return decodeDict(data, nulls, rowCount);
    case Encoding.Delta: return decodeDelta(data, type, nulls, rowCount);
    default:
      return assertNever(encoding, `Unhandled encoding in decodeData: ${encoding}`);
  }
}

/** Decode dictionary */
function decodeDict(data: Uint8Array, _nulls: boolean[], rowCount: number): unknown[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;

  // Bounds check for dictSize read - corrupt data should throw
  if (data.byteLength < 4) {
    throw new Error('Corrupt dictionary data: insufficient bytes for dictionary header');
  }

  const dictSize = view.getUint32(offset, true); offset += 4;
  const dict: string[] = [];

  for (let i = 0; i < dictSize; i++) {
    // Bounds check for entry length read
    if (offset + 2 > data.byteLength) break;
    const len = view.getUint16(offset, true); offset += 2;
    // Bounds check for entry content read
    if (offset + len > data.byteLength) break;
    dict.push(decoder.decode(data.subarray(offset, offset + len)));
    offset += len;
  }

  const values: unknown[] = [];
  for (let i = 0; i < rowCount; i++) {
    // Bounds check for index read
    if (offset + 2 > data.byteLength) {
      values.push(null);
      continue;
    }
    const idx = view.getUint16(offset, true); offset += 2;
    // Bounds check for dictionary access - treat out-of-bounds as null
    if (idx === 0xFFFF || idx >= dict.length) {
      values.push(null);
    } else {
      values.push(dict[idx]);
    }
  }

  return values;
}

/** Decode delta */
function decodeDelta(data: Uint8Array, type: Type, nulls: boolean[], rowCount: number): unknown[] {
  if (data.length === 0) return new Array(rowCount).fill(null);

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const byteSize = type === Type.Int64 ? 8 : 4;
  const values: unknown[] = [];
  let offset = 0;

  // Count non-null values
  const nonNullCount = nulls.filter(n => !n).length;
  if (nonNullCount === 0) return new Array(rowCount).fill(null);

  // Read first value
  let prev = type === Type.Int64 ? view.getBigInt64(offset, true) : view.getInt32(offset, true);
  offset += byteSize;

  let valueIdx = 0;
  for (let i = 0; i < rowCount; i++) {
    if (nulls[i]) {
      values.push(null);
      continue;
    }
    if (valueIdx === 0) {
      values.push(type === Type.Int64 ? prev : Number(prev));
    } else if (offset + byteSize <= data.length) {
      const delta = type === Type.Int64 ? view.getBigInt64(offset, true) : view.getInt32(offset, true);
      offset += byteSize;
      prev = type === Type.Int64 ? (prev as bigint) + (delta as bigint) : (prev as number) + (delta as number);
      values.push(type === Type.Int64 ? prev : Number(prev));
    }
    valueIdx++;
  }

  return values;
}

/** Decode RLE */
function decodeRLE(data: Uint8Array, type: Type, rowCount: number): unknown[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  const values: unknown[] = [];
  let offset = 0;

  while (values.length < rowCount && offset < data.length) {
    const count = view.getUint32(offset, true); offset += 4;
    const isNull = data[offset] === 1; offset += 1;
    const value = isNull ? null : decodeValue(data, offset, type, view, decoder);
    offset += isNull ? 0 : valueSize(type, data, offset, view);
    for (let i = 0; i < count && values.length < rowCount; i++) values.push(value);
  }

  return values;
}

/** Decode plain */
function decodePlain(data: Uint8Array, type: Type, nulls: boolean[], rowCount: number): unknown[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  const values: unknown[] = [];
  let offset = 0;

  for (let i = 0; i < rowCount; i++) {
    if (nulls[i]) { values.push(null); continue; }
    values.push(decodeValue(data, offset, type, view, decoder));
    offset += valueSize(type, data, offset, view);
  }

  return values;
}

/** Decode single value */
function decodeValue(data: Uint8Array, offset: number, type: Type, view: DataView, decoder: InstanceType<typeof TextDecoder>): unknown {
  switch (type) {
    case Type.Null: return null;
    case Type.Bool: return data[offset] === 1;
    case Type.Int32: return view.getInt32(offset, true);
    case Type.Int64: return view.getBigInt64(offset, true);
    case Type.Float64: return view.getFloat64(offset, true);
    case Type.String: { const len = view.getUint16(offset, true); return decoder.decode(data.subarray(offset + 2, offset + 2 + len)); }
    case Type.Binary: { const len = view.getUint32(offset, true); return data.slice(offset + 4, offset + 4 + len); }
    case Type.Array: return null; // Complex types not supported in direct decode
    case Type.Object: return null;
    case Type.Timestamp: return Number(view.getBigInt64(offset, true));
    case Type.Date: { const len = view.getUint16(offset, true); return decoder.decode(data.subarray(offset + 2, offset + 2 + len)); }
    default:
      return assertNever(type, `Unhandled type in decodeValue: ${type}`);
  }
}

/** Get value size for navigation */
function valueSize(type: Type, _data: Uint8Array, offset: number, view: DataView): number {
  switch (type) {
    case Type.Null: return 0;
    case Type.Bool: return 1;
    case Type.Int32: return 4;
    case Type.Int64: return 8;
    case Type.Float64: return 8;
    case Type.String: return 2 + view.getUint16(offset, true);
    case Type.Binary: return 4 + view.getUint32(offset, true);
    case Type.Array: return 0; // Complex types not supported
    case Type.Object: return 0;
    case Type.Timestamp: return 8;
    case Type.Date: return 2 + view.getUint16(offset, true);
    default:
      return assertNever(type, `Unhandled type in valueSize: ${type}`);
  }
}

// =============================================================================
// SNIPPET-OPTIMIZED FAST PATHS
// =============================================================================

/**
 * Fast decode options for snippet constraints
 */
export interface FastDecodeOptions {
  /** Return typed array instead of plain array for numeric types */
  useTypedArray?: boolean;
  /** Skip decoding and return raw buffer (zero-copy) */
  zeroCopy?: boolean;
  /** Only decode specific row range */
  rowRange?: [number, number];
}

/**
 * Fast decode for Int32 columns - returns typed array
 * Optimized for snippet 5ms CPU constraint
 */
export function fastDecodeInt32(
  data: Uint8Array,
  encoding: Encoding,
  nullBitmap: Uint8Array,
  rowCount: number,
  options?: FastDecodeOptions
): Int32Array | null {
  if (encoding !== Encoding.Plain) return null;

  const nonNullCount = countNonNull(nullBitmap, rowCount);

  // Zero-copy path for aligned data
  if (options?.zeroCopy && data.byteOffset % 4 === 0) {
    return new Int32Array(data.buffer, data.byteOffset, nonNullCount);
  }

  // Copy to aligned buffer
  if (data.length >= nonNullCount * 4) {
    const aligned = new Uint8Array(nonNullCount * 4);
    aligned.set(data.subarray(0, nonNullCount * 4));
    return new Int32Array(aligned.buffer);
  }

  return null;
}

/**
 * Fast decode for Float64 columns - returns typed array
 * Optimized for snippet 5ms CPU constraint
 */
export function fastDecodeFloat64(
  data: Uint8Array,
  encoding: Encoding,
  nullBitmap: Uint8Array,
  rowCount: number,
  options?: FastDecodeOptions
): Float64Array | null {
  if (encoding !== Encoding.Plain) return null;

  const nonNullCount = countNonNull(nullBitmap, rowCount);

  // Zero-copy path for aligned data
  if (options?.zeroCopy && data.byteOffset % 8 === 0) {
    return new Float64Array(data.buffer, data.byteOffset, nonNullCount);
  }

  // Copy to aligned buffer
  if (data.length >= nonNullCount * 8) {
    const aligned = new Uint8Array(nonNullCount * 8);
    aligned.set(data.subarray(0, nonNullCount * 8));
    return new Float64Array(aligned.buffer);
  }

  return null;
}

/**
 * Fast decode for Delta-encoded Int32 columns
 * Uses TypedArray for performance
 */
export function fastDecodeDeltaInt32(
  data: Uint8Array,
  rowCount: number
): Int32Array {
  const result = new Int32Array(rowCount);

  if (rowCount === 0) return result;

  // Bounds check: need at least 4 bytes for first Int32
  if (data.byteLength < 4) {
    // Return zero-filled array for insufficient data
    return result;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  result[0] = view.getInt32(0, true);

  for (let i = 1; i < rowCount; i++) {
    const offset = i * 4;
    // Bounds check for each subsequent Int32
    if (offset + 4 > data.byteLength) {
      // Fill remaining with last known value (delta of 0)
      result[i] = result[i - 1];
    } else {
      result[i] = result[i - 1] + view.getInt32(offset, true);
    }
  }

  return result;
}

/**
 * Fast null bitmap counting
 */
function countNonNull(bitmap: Uint8Array, count: number): number {
  let nonNull = 0;
  for (let i = 0; i < count; i++) {
    if ((bitmap[i >>> 3] & (1 << (i & 7))) === 0) nonNull++;
  }
  return nonNull;
}

/**
 * Fast null bitmap iteration - yields non-null indices
 */
export function* iterateNonNullIndices(
  bitmap: Uint8Array,
  count: number
): Generator<number> {
  for (let i = 0; i < count; i++) {
    if ((bitmap[i >>> 3] & (1 << (i & 7))) === 0) {
      yield i;
    }
  }
}

/**
 * Batch decode multiple columns for snippet efficiency
 * Minimizes overhead by processing all columns in one pass
 */
export function batchDecode(
  encoded: EncodedColumn[],
  rowCount: number,
  options?: FastDecodeOptions
): Column[] {
  return encoded.map(col => {
    // Try fast path for numeric types
    if (options?.useTypedArray) {
      if (col.type === Type.Int32 && col.encoding === Encoding.Plain) {
        const fast = fastDecodeInt32(col.data, col.encoding, col.nullBitmap, rowCount, options);
        if (fast) {
          const nulls = unpackBits(col.nullBitmap, rowCount);
          return {
            path: col.path,
            type: col.type,
            nullable: col.stats.nullCount > 0,
            values: Array.from(fast),
            nulls,
          };
        }
      }
      if (col.type === Type.Float64 && col.encoding === Encoding.Plain) {
        const fast = fastDecodeFloat64(col.data, col.encoding, col.nullBitmap, rowCount, options);
        if (fast) {
          const nulls = unpackBits(col.nullBitmap, rowCount);
          return {
            path: col.path,
            type: col.type,
            nullable: col.stats.nullCount > 0,
            values: Array.from(fast),
            nulls,
          };
        }
      }
    }

    // Fall back to standard decode
    return decode(col, rowCount);
  });
}
