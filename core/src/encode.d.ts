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