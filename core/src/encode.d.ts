import { type Column, type EncodedColumn, Encoding, Type } from './types.js';
/** Encode column with automatic encoding selection */
export declare function encode(columns: Column[]): EncodedColumn[];
/** Unpack bitmap to boolean array */
export declare function unpackBits(bytes: Uint8Array, count: number): boolean[];
/** Dictionary encoding - optimized with string interning */
declare function encodeDictOptimized(values: string[], nulls: boolean[]): Uint8Array;
export { encodeDictOptimized as encodeDict };
/** Delta encoding for integers - TypedArray optimized */
declare function encodeDeltaTypedArray(values: number[], type: Type): Uint8Array;
export { encodeDeltaTypedArray as encodeDelta };
/** Decode column data */
export declare function decode(encoded: EncodedColumn, rowCount: number): Column;

// =============================================================================
// SPARSE NULL BITMAP OPTIMIZATION (Issue: evodb-qp6)
// =============================================================================

/**
 * Threshold for using sparse representation.
 * If null rate is below this threshold, use SparseNullSet instead of full array.
 */
export declare const SPARSE_NULL_THRESHOLD: number;

/**
 * Sparse representation of null indices for columns with few nulls.
 * Uses a Set internally for O(1) null checks with dramatically less memory for sparse data.
 */
export declare class SparseNullSet implements Iterable<boolean> {
    constructor(nullIndices: Set<number>, totalCount: number);
    /** Check if a specific index is null */
    isNull(index: number): boolean;
    /** Number of null values */
    get nullCount(): number;
    /** Total number of elements (including non-null) */
    get totalCount(): number;
    /** Alias for totalCount for array-like interface */
    get length(): number;
    /** Iterate over null indices only (efficient for sparse data) */
    nullIndices(): Generator<number>;
    /** Convert to full boolean array for compatibility */
    toArray(): boolean[];
    /** Iterable implementation for for...of loops */
    [Symbol.iterator](): Generator<boolean>;
}

/**
 * Unpack bitmap to sparse representation if null rate is below threshold.
 * Returns SparseNullSet for sparse data, boolean[] for dense data.
 */
export declare function unpackBitsSparse(bytes: Uint8Array, count: number): SparseNullSet | boolean[];

/**
 * Check if bitmap represents all-null data.
 * Early exits on first non-0xFF byte for efficiency.
 */
export declare function isAllNull(bytes: Uint8Array, count: number): boolean;

/**
 * Check if bitmap has no nulls.
 * Early exits on first non-zero byte for efficiency.
 */
export declare function hasNoNulls(bytes: Uint8Array, count: number): boolean;
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
export declare function fastDecodeInt32(data: Uint8Array, encoding: Encoding, nullBitmap: Uint8Array, rowCount: number, options?: FastDecodeOptions): Int32Array | null;
/**
 * Fast decode for Float64 columns - returns typed array
 * Optimized for snippet 5ms CPU constraint
 */
export declare function fastDecodeFloat64(data: Uint8Array, encoding: Encoding, nullBitmap: Uint8Array, rowCount: number, options?: FastDecodeOptions): Float64Array | null;
/**
 * Fast decode for Delta-encoded Int32 columns
 * Uses TypedArray for performance
 */
export declare function fastDecodeDeltaInt32(data: Uint8Array, rowCount: number): Int32Array;
/**
 * Fast null bitmap iteration - yields non-null indices
 */
export declare function iterateNonNullIndices(bitmap: Uint8Array, count: number): Generator<number>;
/**
 * Batch decode multiple columns for snippet efficiency
 * Minimizes overhead by processing all columns in one pass
 */
export declare function batchDecode(encoded: EncodedColumn[], rowCount: number, options?: FastDecodeOptions): Column[];
//# sourceMappingURL=encode.d.ts.map