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
import { EncodingValidationError } from './errors.js';
import {
  isArray,
  isRecord,
  isBoolean,
  isBigInt,
  isNumber,
  isString,
  isNullish,
  isUint8Array,
  isDate,
} from './type-guards.js';

// =============================================================================
// MODULE-LEVEL CONSTANTS
// =============================================================================

/**
 * Shared TextEncoder instance for all encoding operations.
 * TextEncoder is stateless and thread-safe, so reusing a single instance
 * avoids allocation overhead in hot paths.
 */
const sharedTextEncoder = new TextEncoder();

// =============================================================================
// DEBUG MODE RUNTIME CHECKS
// =============================================================================

/**
 * Enable debug assertions for type checking in performance-critical paths.
 * Set to true during development to catch type mismatches early.
 * Should be false in production for maximum performance.
 *
 * When enabled, type assertions are verified at runtime and throw descriptive
 * errors if the actual type doesn't match the expected type.
 */
export const DEBUG_ASSERTIONS = false;

/**
 * Assert that a value matches the expected type (debug mode only).
 * No-op when DEBUG_ASSERTIONS is false.
 *
 * @param value - The value to check
 * @param expectedType - The expected Type enum value
 * @param context - Description of where the assertion is being made
 * @throws Error if DEBUG_ASSERTIONS is true and type doesn't match
 */
export function assertType(value: unknown, expectedType: Type, context: string): void {
  if (!DEBUG_ASSERTIONS) return;

  const actualType = typeof value;
  let valid = false;

  switch (expectedType) {
    case Type.Null:
      valid = value === null || value === undefined;
      break;
    case Type.Bool:
      valid = actualType === 'boolean';
      break;
    case Type.Int32:
    case Type.Float64:
      valid = actualType === 'number';
      break;
    case Type.Int64:
      valid = actualType === 'bigint';
      break;
    case Type.String:
    case Type.Date:
      valid = actualType === 'string';
      break;
    case Type.Binary:
      valid = value instanceof Uint8Array;
      break;
    case Type.Timestamp:
      valid = value instanceof Date || actualType === 'number';
      break;
    case Type.Array:
      valid = Array.isArray(value);
      break;
    case Type.Object:
      valid = actualType === 'object' && value !== null && !Array.isArray(value);
      break;
  }

  if (!valid) {
    throw new EncodingValidationError(
      `Type assertion failed in ${context}: expected ${getTypeName(expectedType)}, got ${actualType}`,
      'TYPE_MISMATCH',
      {
        expectedType: getTypeName(expectedType),
        actualType,
        actualValue: typeof value === 'string' ? value.slice(0, 50) : value,
      }
    );
  }
}

/** Encode column with automatic encoding selection */
export function encode(columns: Column[]): EncodedColumn[] {
  return columns.map(col => {
    // Validate column before encoding
    validateColumn(col);

    const stats = computeStats(col);
    const nullBitmap = packBits(col.nulls);
    const { encoding, data } = selectAndEncode(col, stats);
    return { path: col.path, type: col.type, encoding, data, nullBitmap, stats };
  });
}

// =============================================================================
// RUNTIME TYPE VALIDATION
// =============================================================================

/**
 * Valid Type enum values for runtime validation.
 * This matches the Type enum from types.ts (values 0-10).
 * Used to validate that a column's type is a known Type enum value.
 */
export const VALID_TYPE_VALUES = new Set([
  Type.Null,      // 0
  Type.Bool,      // 1
  Type.Int32,     // 2
  Type.Int64,     // 3
  Type.Float64,   // 4
  Type.String,    // 5
  Type.Binary,    // 6
  Type.Array,     // 7
  Type.Object,    // 8
  Type.Timestamp, // 9
  Type.Date,      // 10
]);

/**
 * Get human-readable type name for a Type enum value.
 * Useful for error messages and debugging.
 *
 * @param type - The Type enum value
 * @returns Human-readable name (e.g., 'Int32', 'String')
 */
export function getTypeName(type: Type): string {
  switch (type) {
    case Type.Null: return 'Null';
    case Type.Bool: return 'Bool';
    case Type.Int32: return 'Int32';
    case Type.Int64: return 'Int64';
    case Type.Float64: return 'Float64';
    case Type.String: return 'String';
    case Type.Binary: return 'Binary';
    case Type.Array: return 'Array';
    case Type.Object: return 'Object';
    case Type.Timestamp: return 'Timestamp';
    case Type.Date: return 'Date';
    default: return `Unknown(${type})`;
  }
}

/**
 * Get human-readable type name for an actual runtime value.
 * Handles special cases like null, undefined, arrays, Uint8Array, Date.
 *
 * @param value - The value to describe
 * @returns Human-readable type name (e.g., 'string', 'number', 'array', 'null')
 */
export function getActualTypeName(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Uint8Array) return 'Uint8Array';
  if (value instanceof Date) return 'Date';
  return typeof value;
}

/**
 * Check if a runtime value matches the expected Type enum.
 * This is a type guard that validates values against the columnar type system.
 *
 * @param value - The value to check
 * @param expectedType - The expected Type enum value
 * @returns true if the value matches the expected type, false otherwise
 *
 * @example
 * ```typescript
 * isValueTypeValid(42, Type.Int32) // true
 * isValueTypeValid('hello', Type.String) // true
 * isValueTypeValid('hello', Type.Int32) // false
 * ```
 */
export function isValueTypeValid(value: unknown, expectedType: Type): boolean {
  // Null/undefined values are handled separately via nullability check
  if (isNullish(value)) {
    return expectedType === Type.Null;
  }

  switch (expectedType) {
    case Type.Null:
      return isNullish(value);
    case Type.Bool:
      return isBoolean(value);
    case Type.Int32:
    case Type.Float64:
      return isNumber(value);
    case Type.Int64:
      return isBigInt(value);
    case Type.String:
      return isString(value);
    case Type.Binary:
      return isUint8Array(value);
    case Type.Timestamp:
      // Timestamps accept both number (ms since epoch) and Date objects
      return isNumber(value) || isDate(value);
    case Type.Date:
      // Date column stores ISO date strings
      return isString(value);
    case Type.Array:
      return isArray(value);
    case Type.Object:
      return isRecord(value);
    default:
      return false;
  }
}

/**
 * Validate a column's type, nullability, and value types.
 * This function is called automatically by encode() but can also be used
 * independently for pre-validation.
 *
 * Validates:
 * 1. Column type is a valid Type enum value (0-10)
 * 2. Non-nullable columns have no null values
 * 3. All non-null values match the declared column type
 *
 * @param col - The column to validate
 * @throws EncodingValidationError with INVALID_TYPE code if type is invalid
 * @throws EncodingValidationError with NULLABLE_CONSTRAINT_VIOLATION code if nulls found in non-nullable column
 * @throws EncodingValidationError with TYPE_MISMATCH code if value type doesn't match column type
 *
 * @example
 * ```typescript
 * try {
 *   validateColumn({
 *     path: 'user.age',
 *     type: Type.Int32,
 *     nullable: false,
 *     values: [25, 'thirty'], // type mismatch!
 *     nulls: [false, false],
 *   });
 * } catch (error) {
 *   if (error instanceof EncodingValidationError) {
 *     console.log(error.details); // { path: 'user.age', index: 1, ... }
 *   }
 * }
 * ```
 */
export function validateColumn(col: Column): void {
  // 1. Validate column type is a known Type enum value
  if (!VALID_TYPE_VALUES.has(col.type)) {
    throw new EncodingValidationError(
      `Invalid column type: ${col.type} is not a valid Type enum value for column '${col.path}'`,
      'INVALID_TYPE',
      {
        path: col.path,
        expectedType: 'valid Type enum (0-10)',
        actualType: String(col.type),
      }
    );
  }

  // 2. Validate each value
  for (let i = 0; i < col.values.length; i++) {
    const value = col.values[i];
    const isNull = col.nulls[i];

    // 2a. Check nullability constraint
    if (isNull && !col.nullable) {
      throw new EncodingValidationError(
        `Null value at index ${i} in non-nullable column '${col.path}'`,
        'NULLABLE_CONSTRAINT_VIOLATION',
        {
          path: col.path,
          index: i,
          expectedType: getTypeName(col.type),
          actualType: 'null',
          actualValue: value,
        }
      );
    }

    // 2b. Skip type validation for null values (they're stored in the null bitmap)
    if (isNull) {
      continue;
    }

    // 2c. Validate value type matches column type
    if (!isValueTypeValid(value, col.type)) {
      throw new EncodingValidationError(
        `Type mismatch at index ${i} in column '${col.path}': expected ${getTypeName(col.type)}, got ${getActualTypeName(value)}`,
        'TYPE_MISMATCH',
        {
          path: col.path,
          index: i,
          expectedType: getTypeName(col.type),
          actualType: getActualTypeName(value),
          actualValue: typeof value === 'string' ? value.slice(0, 50) : value,
        }
      );
    }
  }
}

/**
 * Compute column statistics for encoding selection.
 *
 * Type assertions rationale:
 * - `v as number` / `min as number` / `max as number`: These assertions are safe because
 *   the comparison operators (<, >) work correctly for all primitive types in JavaScript.
 *   The assertion allows TypeScript to accept the comparison while the runtime behavior
 *   remains correct for strings (lexicographic), numbers, and bigints. For mixed types,
 *   the comparison may produce unexpected results but won't crash.
 */
function computeStats(col: Column): ColumnStats {
  let min: unknown = undefined, max: unknown = undefined, nullCount = 0;
  const seen = new Set<unknown>();

  for (let i = 0; i < col.values.length; i++) {
    if (col.nulls[i]) { nullCount++; continue; }
    const v = col.values[i];
    seen.add(v);
    // SAFETY: Comparison operators work for all comparable primitives (numbers, strings, bigints)
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

/**
 * Unpack bitmap to dense boolean array.
 * Use this when you need the full boolean array for backward compatibility.
 *
 * @param bytes - The packed bitmap
 * @param count - Total number of elements
 * @returns Dense boolean array where true means null
 */
export function unpackBitsDense(bytes: Uint8Array, count: number): boolean[] {
  const bits: boolean[] = new Array(count);
  for (let i = 0; i < count; i++) {
    bits[i] = (bytes[i >>> 3] & (1 << (i & 7))) !== 0;
  }
  return bits;
}

/**
 * Smart bitmap unpacking - automatically selects sparse or dense representation.
 * This is the DEFAULT unpacking function (Issue: evodb-80q).
 *
 * Selection logic:
 * - If null rate < 10% (SPARSE_NULL_THRESHOLD): returns SparseNullSet for memory efficiency
 * - Otherwise: returns dense boolean array for fast random access
 *
 * Memory comparison for 100K elements with 10 nulls:
 * - Dense boolean[]: ~100KB
 * - SparseNullSet: ~80 bytes
 *
 * @param bytes - The packed bitmap
 * @param count - Total number of elements
 * @returns SparseNullSet for sparse data, boolean[] for dense data
 */
export function unpackBits(bytes: Uint8Array, count: number): SparseNullSet | boolean[] {
  return unpackBitsSparse(bytes, count);
}

// =============================================================================
// LAZY BITMAP UNPACKING (Issue: evodb-a2x)
// =============================================================================

/**
 * Lazy bitmap interface for on-demand bit access.
 * Avoids allocating the full boolean array upfront - ideal for sparse access patterns
 * where only a subset of bits are needed.
 *
 * Memory comparison for 100K elements:
 * - Eager unpackBits: ~100KB (boolean array allocated upfront)
 * - LazyBitmap: ~0KB (no allocation until toArray() is called)
 *
 * Use cases:
 * - Checking specific indices without full unpacking
 * - Early termination in scan operations
 * - Memory-constrained environments (Cloudflare Snippets: 32MB RAM)
 */
export interface LazyBitmap {
  /** Get the boolean value at index i */
  get(i: number): boolean;
  /** Convert to full boolean array for dense access patterns */
  toArray(): boolean[];
  /** Total number of elements in the bitmap */
  readonly length: number;
}

/**
 * Create a lazy bitmap from packed bytes.
 * Returns an object with O(1) access without allocating the full array.
 *
 * Performance characteristics:
 * - get(i): O(1) time, O(1) space
 * - toArray(): O(n) time, O(n) space (delegates to unpackBits)
 *
 * @param bytes - The packed bitmap bytes
 * @param count - Total number of elements
 * @returns LazyBitmap with get(i) method for on-demand access
 *
 * @example
 * ```typescript
 * // Sparse access - only check specific indices
 * const lazy = unpackBitsLazy(bitmap, 100000);
 * if (lazy.get(42)) {
 *   // Index 42 is null
 * }
 *
 * // Dense access - convert to array when needed
 * const bits = lazy.toArray();
 * ```
 */
export function unpackBitsLazy(bytes: Uint8Array, count: number): LazyBitmap {
  return {
    length: count,
    get(i: number): boolean {
      return (bytes[i >>> 3] & (1 << (i & 7))) !== 0;
    },
    toArray(): boolean[] {
      return unpackBitsDense(bytes, count);
    },
  };
}

// =============================================================================
// SPARSE NULL BITMAP OPTIMIZATION (Issue: evodb-qp6)
// =============================================================================

/**
 * Threshold for using sparse representation.
 * If null rate is below this threshold, use SparseNullSet instead of full array.
 * 10% threshold: for 10K elements, sparse is better if < 1K nulls
 */
export const SPARSE_NULL_THRESHOLD = 0.1;

/**
 * Sparse representation of null indices for columns with few nulls.
 * Uses a Set internally for O(1) null checks instead of O(1) array access,
 * but with dramatically less memory for sparse data.
 *
 * Memory comparison for 100K elements with 10 nulls:
 * - Boolean array: ~100KB (1 byte per boolean in JS)
 * - SparseNullSet: ~80 bytes (Set overhead + 10 numbers)
 */
export class SparseNullSet implements Iterable<boolean> {
  private readonly _nullIndices: Set<number>;
  private readonly _totalCount: number;

  constructor(nullIndices: Set<number>, totalCount: number) {
    this._nullIndices = nullIndices;
    this._totalCount = totalCount;
  }

  /** Check if a specific index is null */
  isNull(index: number): boolean {
    return this._nullIndices.has(index);
  }

  /** Number of null values */
  get nullCount(): number {
    return this._nullIndices.size;
  }

  /** Total number of elements (including non-null) */
  get totalCount(): number {
    return this._totalCount;
  }

  /** Alias for totalCount for array-like interface */
  get length(): number {
    return this._totalCount;
  }

  /** Iterate over null indices only (efficient for sparse data) */
  *nullIndices(): Generator<number> {
    for (const idx of this._nullIndices) {
      yield idx;
    }
  }

  /** Convert to full boolean array for compatibility */
  toArray(): boolean[] {
    const result = new Array<boolean>(this._totalCount).fill(false);
    for (const idx of this._nullIndices) {
      result[idx] = true;
    }
    return result;
  }

  /** Iterable implementation for for...of loops */
  *[Symbol.iterator](): Generator<boolean> {
    for (let i = 0; i < this._totalCount; i++) {
      yield this._nullIndices.has(i);
    }
  }
}

// =============================================================================
// NULL BITMAP HELPER FUNCTIONS (Issue: evodb-80q)
// =============================================================================

/**
 * Type alias for null bitmap - can be sparse or dense representation.
 * Re-exported from types.ts for convenience.
 */
export type NullBitmap = SparseNullSet | boolean[];

/**
 * Check if a specific index is null in a NullBitmap.
 * Works with both SparseNullSet and boolean[] representations.
 *
 * @param nulls - The null bitmap (sparse or dense)
 * @param index - The index to check
 * @returns true if the value at index is null
 *
 * @example
 * ```typescript
 * const nulls = unpackBits(bitmap, count);
 * if (isNullAt(nulls, 42)) {
 *   // Value at index 42 is null
 * }
 * ```
 */
export function isNullAt(nulls: NullBitmap, index: number): boolean {
  if (nulls instanceof SparseNullSet) {
    return nulls.isNull(index);
  }
  return nulls[index];
}

/**
 * Convert a NullBitmap to a dense boolean array.
 * If already a boolean[], returns as-is. If SparseNullSet, converts to array.
 *
 * @param nulls - The null bitmap (sparse or dense)
 * @returns Dense boolean array
 */
export function toNullArray(nulls: NullBitmap): boolean[] {
  if (nulls instanceof SparseNullSet) {
    return nulls.toArray();
  }
  return nulls;
}

/**
 * Check if any value in the null bitmap is null.
 * Optimized for both sparse and dense representations.
 *
 * @param nulls - The null bitmap (sparse or dense)
 * @returns true if at least one value is null
 */
export function hasAnyNulls(nulls: NullBitmap): boolean {
  if (nulls instanceof SparseNullSet) {
    return nulls.nullCount > 0;
  }
  return nulls.some(n => n);
}

/**
 * Count the number of null values in a NullBitmap.
 * Optimized for both sparse and dense representations.
 *
 * @param nulls - The null bitmap (sparse or dense)
 * @returns Number of null values
 */
export function countNulls(nulls: NullBitmap): number {
  if (nulls instanceof SparseNullSet) {
    return nulls.nullCount;
  }
  return nulls.filter(n => n).length;
}

/**
 * Count nulls in bitmap efficiently (O(n/8) byte operations)
 */
function countNullsInBitmap(bytes: Uint8Array, count: number): number {
  let nullCount = 0;

  // Process full bytes
  const fullBytes = count >>> 3;
  for (let i = 0; i < fullBytes; i++) {
    // Count set bits using Brian Kernighan's algorithm
    let byte = bytes[i];
    while (byte) {
      nullCount++;
      byte &= byte - 1; // Clear lowest set bit
    }
  }

  // Process remaining bits in last partial byte
  const remainingBits = count & 7;
  if (remainingBits > 0 && fullBytes < bytes.length) {
    let byte = bytes[fullBytes] & ((1 << remainingBits) - 1); // Mask valid bits
    while (byte) {
      nullCount++;
      byte &= byte - 1;
    }
  }

  return nullCount;
}

/**
 * Unpack bitmap to sparse representation if null rate is below threshold.
 * Returns SparseNullSet for sparse data, boolean[] for dense data.
 *
 * @param bytes - The packed bitmap
 * @param count - Total number of elements
 * @returns SparseNullSet for sparse data (< SPARSE_NULL_THRESHOLD null rate),
 *          boolean[] for dense data
 */
export function unpackBitsSparse(bytes: Uint8Array, count: number): SparseNullSet | boolean[] {
  // Early exit for empty data
  if (count === 0) {
    return new SparseNullSet(new Set(), 0);
  }

  // Count nulls first (O(n/8) operation)
  const nullCount = countNullsInBitmap(bytes, count);
  const nullRate = nullCount / count;

  // Use sparse representation if below threshold
  if (nullRate <= SPARSE_NULL_THRESHOLD) {
    const nullIndices = new Set<number>();

    // Only iterate to find null positions if there are any
    if (nullCount > 0) {
      for (let i = 0; i < count; i++) {
        if ((bytes[i >>> 3] & (1 << (i & 7))) !== 0) {
          nullIndices.add(i);
        }
      }
    }

    return new SparseNullSet(nullIndices, count);
  }

  // Fall back to dense array for high null rates
  return unpackBitsDense(bytes, count);
}

/**
 * Check if bitmap represents all-null data.
 * Early exits on first non-0xFF byte for efficiency.
 *
 * @param bytes - The packed bitmap
 * @param count - Total number of elements
 * @returns true if all elements are null
 */
export function isAllNull(bytes: Uint8Array, count: number): boolean {
  if (count === 0) return true;

  // Check full bytes (all bits should be 1)
  const fullBytes = count >>> 3;
  for (let i = 0; i < fullBytes; i++) {
    if (bytes[i] !== 0xFF) return false;
  }

  // Check remaining bits in last partial byte
  const remainingBits = count & 7;
  if (remainingBits > 0) {
    const expectedMask = (1 << remainingBits) - 1;
    if ((bytes[fullBytes] & expectedMask) !== expectedMask) return false;
  }

  return true;
}

/**
 * Check if bitmap has no nulls.
 * Early exits on first non-zero byte for efficiency.
 *
 * @param bytes - The packed bitmap
 * @param count - Total number of elements
 * @returns true if no elements are null
 */
export function hasNoNulls(bytes: Uint8Array, count: number): boolean {
  if (count === 0) return true;

  // Check full bytes (all bits should be 0)
  const fullBytes = count >>> 3;
  for (let i = 0; i < fullBytes; i++) {
    if (bytes[i] !== 0) return false;
  }

  // Check remaining bits in last partial byte
  const remainingBits = count & 7;
  if (remainingBits > 0) {
    const validBitsMask = (1 << remainingBits) - 1;
    if ((bytes[fullBytes] & validBitsMask) !== 0) return false;
  }

  return true;
}

/**
 * Select best encoding and encode data.
 *
 * Type assertions rationale:
 * - `nonNull as string[]`: Safe because we check `col.type === Type.String` before the assertion.
 *   The type system tracks Column.values as unknown[], but the Type enum guarantees the actual
 *   runtime types of non-null values.
 * - `nonNull as number[]`: Safe because we check `col.type === Type.Int32 || Type.Int64` first.
 *   The Type enum constrains what values can be stored in the column.
 */
function selectAndEncode(col: Column, stats: ColumnStats): { encoding: Encoding; data: Uint8Array } {
  const nonNull = col.values.filter((_, i) => !col.nulls[i]);
  if (nonNull.length === 0) return { encoding: Encoding.Plain, data: new Uint8Array(0) };

  // Dictionary for low cardinality strings (use stricter threshold for better compression)
  if (col.type === Type.String && stats.distinctEst < nonNull.length / 2) {
    // SAFETY: col.type === Type.String guarantees all non-null values are strings
    return { encoding: Encoding.Dict, data: encodeDictOptimized(nonNull as string[], col.nulls) };
  }

  // Delta for sorted integers - good for timestamps and sequential IDs
  if ((col.type === Type.Int32 || col.type === Type.Int64) && isSorted(nonNull as number[])) {
    // SAFETY: col.type check above guarantees all non-null values are numbers
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
  const encoded = entries.map(s => sharedTextEncoder.encode(s));
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

  while (i < col.values.length) {
    const v = col.values[i];
    let count = 1;
    while (i + count < col.values.length && col.values[i + count] === v && col.nulls[i + count] === col.nulls[i]) {
      count++;
    }

    const valueBytes = encodeValue(v, col.type, sharedTextEncoder);
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

/**
 * Plain encoding - TypedArray optimized for numeric types.
 *
 * Type assertions rationale:
 * - `col.values[i] as number`: Safe because we check `col.type === Type.Int32` or
 *   `col.type === Type.Float64` before accessing values. The Type enum guarantees
 *   the runtime type of stored values matches the declared type. Additionally,
 *   we skip null values via the `!col.nulls[i]` check.
 */
function encodePlainTypedArray(col: Column): Uint8Array {
  const nonNullCount = col.nulls.filter(n => !n).length;

  if (col.type === Type.Int32) {
    const arr = new Int32Array(nonNullCount);
    let idx = 0;
    for (let i = 0; i < col.values.length; i++) {
      // SAFETY: col.type === Type.Int32 guarantees numeric values; nulls filtered by condition
      if (!col.nulls[i]) arr[idx++] = col.values[i] as number;
    }
    return new Uint8Array(arr.buffer);
  }

  if (col.type === Type.Float64) {
    const arr = new Float64Array(nonNullCount);
    let idx = 0;
    for (let i = 0; i < col.values.length; i++) {
      // SAFETY: col.type === Type.Float64 guarantees numeric values; nulls filtered by condition
      if (!col.nulls[i]) arr[idx++] = col.values[i] as number;
    }
    return new Uint8Array(arr.buffer);
  }

  // Fall back to generic encoding for other types
  return encodePlain(col);
}

/** Plain encoding */
function encodePlain(col: Column): Uint8Array {
  const chunks: Uint8Array[] = [];

  for (let i = 0; i < col.values.length; i++) {
    if (col.nulls[i]) continue;
    chunks.push(encodeValue(col.values[i], col.type, sharedTextEncoder));
  }

  return concatArrays(chunks);
}

/**
 * Encode single value based on type.
 *
 * Type assertions rationale:
 * Each case in the switch statement handles a specific Type enum value. The Type enum
 * acts as a discriminant that guarantees the runtime type of `v`. The assertions are
 * safe because:
 * - Type.Int32/Float64/Timestamp: value must be number (stored as numeric in shred.ts)
 * - Type.Int64: value must be number or bigint
 * - Type.String/Date: value must be string (Date stored as ISO string or ms epoch)
 * - Type.Binary: value must be Uint8Array
 *
 * This is a performance-critical path where we avoid runtime type checks in favor of
 * trusting the Type enum's contract. Invalid data would have been caught during shredding.
 */
function encodeValue(v: unknown, type: Type, encoder: InstanceType<typeof TextEncoder>): Uint8Array {
  if (v === null || v === undefined) return new Uint8Array(0);

  switch (type) {
    case Type.Null: return new Uint8Array(0);
    case Type.Bool: return new Uint8Array([v ? 1 : 0]);
    // SAFETY: Type.Int32 guarantees v is number (validated during shredding)
    case Type.Int32: { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v as number, true); return b; }
    // SAFETY: Type.Int64 guarantees v is number or bigint
    case Type.Int64: { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(v as number | bigint), true); return b; }
    // SAFETY: Type.Float64 guarantees v is number
    case Type.Float64: { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v as number, true); return b; }
    // SAFETY: Type.String guarantees v is string
    case Type.String: { const e = encoder.encode(v as string); const b = new Uint8Array(2 + e.length); new DataView(b.buffer).setUint16(0, e.length, true); b.set(e, 2); return b; }
    // SAFETY: Type.Binary guarantees v is Uint8Array
    case Type.Binary: { const d = v as Uint8Array; const b = new Uint8Array(4 + d.length); new DataView(b.buffer).setUint32(0, d.length, true); b.set(d, 4); return b; }
    case Type.Array: return new Uint8Array(0); // Complex types serialized as JSON in practice
    case Type.Object: return new Uint8Array(0);
    // SAFETY: Type.Timestamp stores ms-since-epoch as number (converted from Date in shred.ts)
    case Type.Timestamp: { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(v as number), true); return b; }
    // SAFETY: Type.Date stores ISO date string
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

// =============================================================================
// DECODE COUNT BOUNDS VALIDATION (Issue: evodb-imj)
// =============================================================================

/**
 * Maximum count for decode operations.
 * JavaScript arrays have a maximum length of 2^32 - 1 elements.
 * We use a lower bound to be safe and catch unreasonably large counts early,
 * preventing memory allocation failures with cryptic error messages.
 */
export const MAX_DECODE_COUNT = 2 ** 31 - 1; // ~2 billion, safe for typed arrays

/**
 * Validate count parameter for decode operations.
 * Ensures count is a valid non-negative integer within safe bounds.
 *
 * @param count - The count value to validate
 * @param context - Description of where the validation is occurring
 * @throws EncodingValidationError if count is invalid (negative, NaN, Infinity, or exceeds safe integer)
 */
export function validateDecodeCount(count: number, context: string): void {
  if (typeof count !== 'number') {
    throw new EncodingValidationError(
      `Invalid count in ${context}: expected number, got ${typeof count}`,
      'TYPE_MISMATCH',
      { expectedType: 'number', actualType: typeof count }
    );
  }
  if (Number.isNaN(count)) {
    throw new EncodingValidationError(
      `Invalid count in ${context}: count cannot be NaN`,
      'VALIDATION_ERROR',
      { actualValue: count }
    );
  }
  if (!Number.isFinite(count)) {
    throw new EncodingValidationError(
      `Invalid count in ${context}: count cannot be Infinity`,
      'VALIDATION_ERROR',
      { actualValue: count }
    );
  }
  if (count < 0) {
    throw new EncodingValidationError(
      `Invalid count in ${context}: count cannot be negative (got ${count})`,
      'VALIDATION_ERROR',
      { actualValue: count }
    );
  }
  // Check for counts that would exceed array capacity or cause memory issues
  if (count > MAX_DECODE_COUNT) {
    throw new EncodingValidationError(
      `Invalid count in ${context}: count ${count} exceeds maximum safe capacity ${MAX_DECODE_COUNT}`,
      'VALIDATION_ERROR',
      { actualValue: count, maxAllowed: MAX_DECODE_COUNT }
    );
  }
  // Ensure count is an integer
  if (!Number.isInteger(count)) {
    throw new EncodingValidationError(
      `Invalid count in ${context}: count must be an integer (got ${count})`,
      'TYPE_MISMATCH',
      { expectedType: 'integer', actualValue: count }
    );
  }
}

/**
 * Validate that buffer has sufficient capacity for the requested count.
 *
 * @param bufferLength - The length of the buffer in bytes
 * @param count - Number of elements to decode
 * @param bytesPerElement - Bytes required per element
 * @param context - Description of where the validation is occurring
 * @throws EncodingValidationError if buffer is too small for requested count
 */
export function validateBufferCapacity(
  bufferLength: number,
  count: number,
  bytesPerElement: number,
  context: string
): void {
  if (count === 0) return; // Zero count always valid

  const requiredBytes = count * bytesPerElement;
  if (requiredBytes > bufferLength) {
    throw new EncodingValidationError(
      `Buffer capacity exceeded in ${context}: requested ${count} elements (${requiredBytes} bytes) but buffer has ${bufferLength} bytes`,
      'VALIDATION_ERROR',
      {
        requestedCount: count,
        requiredBytes,
        availableBytes: bufferLength,
        bytesPerElement,
      }
    );
  }
}

/**
 * Decode column data.
 * Uses smart null bitmap unpacking - returns SparseNullSet for sparse data (Issue: evodb-80q).
 */
export function decode(encoded: EncodedColumn, rowCount: number): Column {
  // Validate count parameter (Issue: evodb-imj)
  validateDecodeCount(rowCount, 'decode');

  // Smart unpack: returns SparseNullSet for sparse data, boolean[] for dense (Issue: evodb-80q)
  const nulls = unpackBits(encoded.nullBitmap, rowCount);
  const values = decodeData(encoded.data, encoded.encoding, encoded.type, nulls, rowCount);
  return { path: encoded.path, type: encoded.type, nullable: hasAnyNulls(nulls), values, nulls };
}

/** Decode data based on encoding */
function decodeData(data: Uint8Array, encoding: Encoding, type: Type, nulls: NullBitmap, rowCount: number): unknown[] {
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
function decodeDict(data: Uint8Array, _nulls: NullBitmap, rowCount: number): unknown[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;

  // Bounds check for dictSize read - corrupt data should throw
  if (data.byteLength < 4) {
    throw new EncodingValidationError(
      'Corrupt dictionary data: insufficient bytes for dictionary header (need 4 bytes, got ' + data.byteLength + ')',
      'VALIDATION_ERROR',
      { expectedMinBytes: 4, actualBytes: data.byteLength, encoding: 'Dict' }
    );
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
function decodeDelta(data: Uint8Array, type: Type, nulls: NullBitmap, rowCount: number): unknown[] {
  if (data.length === 0) return new Array(rowCount).fill(null);

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const byteSize = type === Type.Int64 ? 8 : 4;
  const values: unknown[] = [];
  let offset = 0;

  // Count non-null values (use helper for NullBitmap compatibility)
  const nonNullCount = (nulls instanceof SparseNullSet)
    ? nulls.totalCount - nulls.nullCount
    : nulls.filter(n => !n).length;
  if (nonNullCount === 0) return new Array(rowCount).fill(null);

  // Read first value
  let prev = type === Type.Int64 ? view.getBigInt64(offset, true) : view.getInt32(offset, true);
  offset += byteSize;

  let valueIdx = 0;
  for (let i = 0; i < rowCount; i++) {
    if (isNullAt(nulls, i)) {
      values.push(null);
      continue;
    }
    if (valueIdx === 0) {
      values.push(type === Type.Int64 ? prev : Number(prev));
    } else if (offset + byteSize <= data.length) {
      const delta = type === Type.Int64 ? view.getBigInt64(offset, true) : view.getInt32(offset, true);
      offset += byteSize;
      // SAFETY: prev and delta are both bigint when type === Type.Int64 (getBigInt64 returns bigint),
      // and both are number when type !== Type.Int64 (getInt32 returns number).
      // The type check at line 344 determines which branch we're in, so the assertions are safe.
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
function decodePlain(data: Uint8Array, type: Type, nulls: NullBitmap, rowCount: number): unknown[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  const values: unknown[] = [];
  let offset = 0;

  for (let i = 0; i < rowCount; i++) {
    if (isNullAt(nulls, i)) { values.push(null); continue; }
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
  // Validate count parameter (Issue: evodb-imj)
  validateDecodeCount(rowCount, 'fastDecodeDeltaInt32');

  if (rowCount === 0) return new Int32Array(0);

  // Validate buffer capacity for requested count (Issue: evodb-imj)
  // Each Int32 requires 4 bytes in delta encoding
  validateBufferCapacity(data.byteLength, rowCount, 4, 'fastDecodeDeltaInt32');

  const result = new Int32Array(rowCount);

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  result[0] = view.getInt32(0, true);

  for (let i = 1; i < rowCount; i++) {
    const offset = i * 4;
    result[i] = result[i - 1] + view.getInt32(offset, true);
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
