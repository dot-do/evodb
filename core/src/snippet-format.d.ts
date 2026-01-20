/**
 * Snippet-Optimized Columnar Format
 *
 * Target constraints:
 * - Snippets: 5 subrequests, 5ms CPU, 32MB RAM
 * - Workers: More headroom but still constrained
 *
 * Design goals:
 * - 2MB chunk size (fits 16 in 32MB RAM)
 * - Zero-copy decode where possible
 * - Pre-computed zone maps in header
 * - Fast skip via bloom filters
 * - 50MB decode in 5ms target (10GB/s effective throughput)
 */
import { Type } from './types.js';
/** Chunk magic number: "SNIP" = Snippet Optimized */
export declare const SNIPPET_MAGIC = 1346981459;
/** Format version */
export declare const SNIPPET_VERSION = 1;
/** Target chunk size: 2MB (fits 16 chunks in 32MB) */
export declare const CHUNK_SIZE: number;
/** Header size: 64 bytes fixed */
export declare const SNIPPET_HEADER_SIZE = 64;
/** Zone map size per column: 24 bytes (min f64, max f64, null count u32, bloom offset u32) */
export declare const ZONE_MAP_SIZE = 24;
/** Column directory entry size: 16 bytes (offset u32, size u32, encoding u8, type u8, flags u16, bloom_size u32) */
export declare const COLUMN_DIR_ENTRY_SIZE = 16;
/** Bloom filter bits per element (tuned for 1% false positive) */
export declare const BLOOM_BITS_PER_ELEMENT = 10;
/** Bloom filter hash count */
export declare const BLOOM_HASH_COUNT = 7;
/** Maximum dictionary size for fast lookup */
export declare const MAX_DICT_SIZE = 65535;
/** BitPacking bit widths */
export declare const BIT_WIDTHS: readonly [1, 2, 4, 8, 16, 32];
/** Snippet chunk header (64 bytes) */
export interface SnippetHeader {
    magic: number;
    version: number;
    flags: number;
    rowCount: number;
    columnCount: number;
    schemaId: number;
    minTimestamp: bigint;
    maxTimestamp: bigint;
    dataOffset: number;
    bloomOffset: number;
    checksum: number;
}
/** Column directory entry */
export interface ColumnDirEntry {
    offset: number;
    size: number;
    encoding: SnippetEncoding;
    type: Type;
    flags: number;
    bloomSize: number;
}
/** Zone map for a column */
export interface ZoneMap {
    min: number;
    max: number;
    nullCount: number;
    bloomOffset: number;
}
/** Snippet-specific encodings optimized for 5ms decode */
export declare const enum SnippetEncoding {
    /** Raw bytes - zero copy read */
    Raw = 0,
    /** Delta encoding for sorted integers */
    Delta = 1,
    /** Delta + BitPacking for integers (no decompression needed) */
    DeltaBitPack = 2,
    /** Dictionary encoding with binary search */
    Dict = 3,
    /** Run-length encoding */
    RLE = 4,
    /** Boolean bitmap */
    Bitmap = 5
}
/** Encoded snippet column */
export interface SnippetColumn {
    path: string;
    type: Type;
    encoding: SnippetEncoding;
    data: Uint8Array;
    nullBitmap: Uint8Array;
    zoneMap: ZoneMap;
    bloomFilter?: Uint8Array;
    sorted: boolean;
}
/** Decode options for zero-copy paths */
export interface DecodeOptions {
    /** Skip decoding, return raw typed array view */
    zeroCopy?: boolean;
    /** Only decode rows in range [start, end) */
    rowRange?: [number, number];
    /** Column paths to decode (projection pushdown) */
    columns?: string[];
    /** Skip columns where zone map indicates no matching values */
    skipByZoneMap?: {
        min?: number;
        max?: number;
    };
}
/** Decoded column with zero-copy support */
export interface DecodedColumn {
    path: string;
    type: Type;
    /** Raw typed array view (zero-copy) or decoded values */
    values: ArrayLike<unknown>;
    /** Null bitmap as typed array */
    nullBitmap: Uint8Array;
    /** Whether values is a zero-copy view */
    isZeroCopy: boolean;
}
/**
 * Compute minimum bit width needed to represent values
 */
export declare function computeBitWidth(values: number[]): number;
/**
 * Pack integers using bit packing
 * Returns packed data and bit width used
 */
export declare function bitPack(values: number[], bitWidth: number): Uint8Array;
/**
 * Unpack bit-packed integers
 */
export declare function bitUnpack(data: Uint8Array, count: number): Int32Array;
/**
 * Delta encode integers
 * First value stored as-is, subsequent values as deltas
 */
export declare function deltaEncode(values: number[]): number[];
/**
 * Delta decode integers
 */
export declare function deltaDecode(deltas: ArrayLike<number>): Int32Array;
/**
 * Simple bloom filter implementation for fast skip
 */
export declare class BloomFilter {
    private bits;
    private size;
    constructor(expectedElements: number);
    /** Create from existing bytes */
    static fromBytes(bytes: Uint8Array): BloomFilter;
    /** Add a value to the filter */
    add(value: string | number): void;
    /** Check if value might be in the filter */
    mightContain(value: string | number): boolean;
    /** Get the underlying bytes */
    toBytes(): Uint8Array;
    /** Simple hash function (FNV-1a variant) */
    private getHashes;
}
/**
 * Compute zone map for a column
 */
export declare function computeZoneMap(values: unknown[], nulls: boolean[], type: Type): ZoneMap;
/**
 * Check if zone map allows skipping the chunk
 */
export declare function canSkipByZoneMap(zoneMap: ZoneMap, filter: {
    min?: number;
    max?: number;
}): boolean;
/**
 * Build sorted dictionary from string values
 * Returns dictionary entries and indices
 */
export declare function buildSortedDict(values: string[], nulls: boolean[]): {
    dict: string[];
    indices: Uint16Array;
};
/**
 * Binary search in sorted dictionary
 */
export declare function dictBinarySearch(dict: string[], target: string): number;
/**
 * Encode dictionary to bytes
 */
export declare function encodeSortedDict(dict: string[]): Uint8Array;
/**
 * Decode dictionary from bytes
 */
export declare function decodeSortedDict(data: Uint8Array): string[];
/**
 * Encode a column using snippet-optimized format
 */
export declare function encodeSnippetColumn(path: string, type: Type, values: unknown[], nulls: boolean[], options?: {
    buildBloom?: boolean;
}): SnippetColumn;
/**
 * Pack boolean array to bitmap
 */
export declare function packBitmap(bits: boolean[]): Uint8Array;
/**
 * Unpack bitmap to boolean array
 */
export declare function unpackBitmap(bytes: Uint8Array, count: number): boolean[];
/**
 * Zero-copy decode for numeric types
 * Returns typed array view directly into the data buffer
 */
export declare function zeroCopyDecodeInt32(data: Uint8Array, count: number): Int32Array;
/**
 * Zero-copy decode for Float64
 */
export declare function zeroCopyDecodeFloat64(data: Uint8Array, count: number): Float64Array;
/**
 * Decode snippet column with zero-copy support
 */
export declare function decodeSnippetColumn(col: SnippetColumn, rowCount: number, _options?: DecodeOptions): DecodedColumn;
/**
 * Write snippet chunk to bytes
 */
export declare function writeSnippetChunk(columns: SnippetColumn[], rowCount: number, options?: {
    schemaId?: number;
    minTimestamp?: bigint;
    maxTimestamp?: bigint;
}): Uint8Array;
/**
 * Read snippet chunk header only (for fast filtering)
 */
export declare function readSnippetHeader(data: Uint8Array): SnippetHeader;
/**
 * Read snippet chunk with optional projection
 */
export declare function readSnippetChunk(data: Uint8Array, options?: DecodeOptions): {
    header: SnippetHeader;
    columns: DecodedColumn[];
};
//# sourceMappingURL=snippet-format.d.ts.map