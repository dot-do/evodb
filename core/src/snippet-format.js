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
import { Type, Encoding as _Encoding } from './types.js';
// =============================================================================
// CONSTANTS
// =============================================================================
/** Chunk magic number: "SNIP" = Snippet Optimized */
export const SNIPPET_MAGIC = 0x50494E53; // "SNIP" in little-endian
/** Format version */
export const SNIPPET_VERSION = 1;
/** Target chunk size: 2MB (fits 16 chunks in 32MB) */
export const CHUNK_SIZE = 2 * 1024 * 1024;
/** Header size: 64 bytes fixed */
export const SNIPPET_HEADER_SIZE = 64;
/** Zone map size per column: 24 bytes (min f64, max f64, null count u32, bloom offset u32) */
export const ZONE_MAP_SIZE = 24;
/** Column directory entry size: 16 bytes (offset u32, size u32, encoding u8, type u8, flags u16, bloom_size u32) */
export const COLUMN_DIR_ENTRY_SIZE = 16;
/** Bloom filter bits per element (tuned for 1% false positive) */
export const BLOOM_BITS_PER_ELEMENT = 10;
/** Bloom filter hash count */
export const BLOOM_HASH_COUNT = 7;
/** Maximum dictionary size for fast lookup */
export const MAX_DICT_SIZE = 65535;
/** BitPacking bit widths */
export const BIT_WIDTHS = [1, 2, 4, 8, 16, 32];
/** Snippet-specific encodings optimized for 5ms decode */
export var SnippetEncoding;
(function (SnippetEncoding) {
    /** Raw bytes - zero copy read */
    SnippetEncoding[SnippetEncoding["Raw"] = 0] = "Raw";
    /** Delta encoding for sorted integers */
    SnippetEncoding[SnippetEncoding["Delta"] = 1] = "Delta";
    /** Delta + BitPacking for integers (no decompression needed) */
    SnippetEncoding[SnippetEncoding["DeltaBitPack"] = 2] = "DeltaBitPack";
    /** Dictionary encoding with binary search */
    SnippetEncoding[SnippetEncoding["Dict"] = 3] = "Dict";
    /** Run-length encoding */
    SnippetEncoding[SnippetEncoding["RLE"] = 4] = "RLE";
    /** Boolean bitmap */
    SnippetEncoding[SnippetEncoding["Bitmap"] = 5] = "Bitmap";
})(SnippetEncoding || (SnippetEncoding = {}));
// =============================================================================
// ENCODING HELPERS
// =============================================================================
/**
 * Compute minimum bit width needed to represent values
 */
export function computeBitWidth(values) {
    if (values.length === 0)
        return 0;
    let maxVal = 0;
    for (let i = 0; i < values.length; i++) {
        const absVal = Math.abs(values[i]);
        if (absVal > maxVal)
            maxVal = absVal;
    }
    if (maxVal === 0)
        return 1;
    const bits = Math.ceil(Math.log2(maxVal + 1));
    // Round up to nearest supported width
    for (const w of BIT_WIDTHS) {
        if (w >= bits)
            return w;
    }
    return 32;
}
/**
 * Pack integers using bit packing
 * Returns packed data and bit width used
 */
export function bitPack(values, bitWidth) {
    const totalBits = values.length * bitWidth;
    const bytes = new Uint8Array(Math.ceil(totalBits / 8) + 1);
    bytes[0] = bitWidth; // Store bit width in first byte
    let bitOffset = 8; // Start after bit width byte
    const mask = (1 << bitWidth) - 1;
    for (let i = 0; i < values.length; i++) {
        const value = values[i] & mask;
        const byteIndex = Math.floor(bitOffset / 8);
        const bitPos = bitOffset % 8;
        // Write value across bytes
        bytes[byteIndex] |= (value << bitPos) & 0xFF;
        if (bitPos + bitWidth > 8) {
            bytes[byteIndex + 1] |= value >> (8 - bitPos);
            if (bitPos + bitWidth > 16) {
                bytes[byteIndex + 2] |= value >> (16 - bitPos);
                if (bitPos + bitWidth > 24) {
                    bytes[byteIndex + 3] |= value >> (24 - bitPos);
                }
            }
        }
        bitOffset += bitWidth;
    }
    return bytes.slice(0, Math.ceil(totalBits / 8) + 1);
}
/**
 * Unpack bit-packed integers
 */
export function bitUnpack(data, count) {
    const bitWidth = data[0];
    const result = new Int32Array(count);
    const mask = (1 << bitWidth) - 1;
    let bitOffset = 8; // Start after bit width byte
    for (let i = 0; i < count; i++) {
        const byteIndex = Math.floor(bitOffset / 8);
        const bitPos = bitOffset % 8;
        // Read value across bytes
        let value = data[byteIndex] >> bitPos;
        if (bitPos + bitWidth > 8) {
            value |= (data[byteIndex + 1] << (8 - bitPos));
            if (bitPos + bitWidth > 16) {
                value |= (data[byteIndex + 2] << (16 - bitPos));
                if (bitPos + bitWidth > 24) {
                    value |= (data[byteIndex + 3] << (24 - bitPos));
                }
            }
        }
        result[i] = value & mask;
        bitOffset += bitWidth;
    }
    return result;
}
/**
 * Delta encode integers
 * First value stored as-is, subsequent values as deltas
 */
export function deltaEncode(values) {
    if (values.length === 0)
        return [];
    const deltas = new Array(values.length);
    deltas[0] = values[0];
    for (let i = 1; i < values.length; i++) {
        deltas[i] = values[i] - values[i - 1];
    }
    return deltas;
}
/**
 * Delta decode integers
 */
export function deltaDecode(deltas) {
    const result = new Int32Array(deltas.length);
    if (deltas.length === 0)
        return result;
    result[0] = deltas[0];
    for (let i = 1; i < deltas.length; i++) {
        result[i] = result[i - 1] + deltas[i];
    }
    return result;
}
/**
 * Calculate optimal bloom filter parameters for a target false positive rate.
 *
 * Formula:
 * - m (bits) = -n * ln(p) / (ln(2)^2)
 * - k (hashes) = (m/n) * ln(2)
 *
 * Where n = expected elements, p = false positive rate
 */
export function calculateBloomParams(expectedElements, falsePositiveRate = 0.01) {
    if (expectedElements <= 0) {
        return { numBits: 8, numHashes: 1 };
    }
    // Clamp FPR to reasonable range
    const p = Math.max(0.0001, Math.min(0.5, falsePositiveRate));
    // Optimal number of bits: m = -n * ln(p) / (ln(2)^2)
    const ln2Squared = Math.LN2 * Math.LN2; // ~0.4805
    const m = Math.ceil(-expectedElements * Math.log(p) / ln2Squared);
    // Optimal number of hash functions: k = (m/n) * ln(2)
    const k = Math.round((m / expectedElements) * Math.LN2);
    return {
        numBits: Math.max(8, m), // Minimum 8 bits (1 byte)
        numHashes: Math.max(1, Math.min(k, 20)), // Cap at 20 hashes for performance
    };
}
/**
 * Space-efficient bloom filter implementation using bit arrays.
 *
 * Uses Uint8Array for compact storage instead of Map<string, Set<string>>.
 * Achieves ~136x smaller memory footprint compared to Map-based approaches.
 *
 * Features:
 * - Configurable false positive rate (default ~1%)
 * - Optimal hash count based on target FPR
 * - Serializable to/from bytes for storage/caching
 * - No false negatives guaranteed
 */
export class BloomFilter {
    bits;
    size;
    hashCount;
    /**
     * Create a new bloom filter.
     *
     * @param expectedElements - Expected number of elements to add
     * @param configOrFpr - Optional: false positive rate (0-1) or full config object.
     *                      Default is ~1% FPR using BLOOM_BITS_PER_ELEMENT.
     *
     * @example
     * // Default 1% false positive rate
     * const bloom = new BloomFilter(1000);
     *
     * @example
     * // Custom 0.1% false positive rate
     * const bloom = new BloomFilter(1000, 0.001);
     *
     * @example
     * // Using config object
     * const bloom = new BloomFilter(1000, { falsePositiveRate: 0.001 });
     */
    constructor(expectedElements, configOrFpr) {
        // Parse configuration
        let falsePositiveRate;
        if (typeof configOrFpr === 'number') {
            falsePositiveRate = configOrFpr;
        }
        else if (configOrFpr && typeof configOrFpr.falsePositiveRate === 'number') {
            falsePositiveRate = configOrFpr.falsePositiveRate;
        }
        if (falsePositiveRate !== undefined) {
            // Use optimal parameters for target FPR
            const params = calculateBloomParams(expectedElements, falsePositiveRate);
            this.size = Math.ceil(params.numBits / 8);
            this.hashCount = params.numHashes;
        }
        else {
            // Use default constants (backwards compatible)
            const totalBits = expectedElements * BLOOM_BITS_PER_ELEMENT;
            this.size = Math.ceil(totalBits / 8);
            this.hashCount = BLOOM_HASH_COUNT;
        }
        this.bits = new Uint8Array(this.size);
    }
    /** Create from existing bytes */
    static fromBytes(bytes) {
        const filter = new BloomFilter(0);
        filter.bits = bytes;
        filter.size = bytes.length;
        return filter;
    }
    /**
     * Create a bloom filter with specific false positive rate.
     * Convenience factory method.
     *
     * @param expectedElements - Expected number of elements
     * @param falsePositiveRate - Target false positive rate (0-1)
     */
    static withFalsePositiveRate(expectedElements, falsePositiveRate) {
        return new BloomFilter(expectedElements, falsePositiveRate);
    }
    /** Add a value to the filter */
    add(value) {
        const hashes = this.getHashes(value);
        for (const h of hashes) {
            const bitIndex = h % (this.size * 8);
            this.bits[Math.floor(bitIndex / 8)] |= 1 << (bitIndex % 8);
        }
    }
    /** Check if value might be in the filter */
    mightContain(value) {
        const hashes = this.getHashes(value);
        for (const h of hashes) {
            const bitIndex = h % (this.size * 8);
            if ((this.bits[Math.floor(bitIndex / 8)] & (1 << (bitIndex % 8))) === 0) {
                return false;
            }
        }
        return true;
    }
    /** Get the underlying bytes */
    toBytes() {
        return this.bits;
    }
    /** Get the number of hash functions used */
    getHashCount() {
        return this.hashCount;
    }
    /** Get the size in bytes */
    getSizeBytes() {
        return this.size;
    }
    /** Get the size in bits */
    getSizeBits() {
        return this.size * 8;
    }
    /** Simple hash function (FNV-1a variant) */
    getHashes(value) {
        const str = String(value);
        let h1 = 0x811c9dc5; // FNV offset basis
        let h2 = 0x1000193; // FNV prime
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            h1 ^= c;
            h1 = Math.imul(h1, 0x01000193);
            h2 ^= c;
            h2 = Math.imul(h2, 0x01000193);
        }
        // Generate multiple hashes using double hashing
        const hashes = [];
        for (let i = 0; i < this.hashCount; i++) {
            hashes.push(Math.abs((h1 + i * h2) | 0));
        }
        return hashes;
    }
}
// =============================================================================
// ZONE MAP HELPERS
// =============================================================================
/**
 * Compute zone map for a column
 */
export function computeZoneMap(values, nulls, type) {
    let min = Number.MAX_VALUE;
    let max = -Number.MAX_VALUE;
    let nullCount = 0;
    for (let i = 0; i < values.length; i++) {
        if (nulls[i]) {
            nullCount++;
            continue;
        }
        const v = values[i];
        let numVal;
        switch (type) {
            case Type.Int32:
            case Type.Float64:
                numVal = v;
                break;
            case Type.Int64:
                numVal = Number(v);
                break;
            case Type.Timestamp:
                numVal = v.getTime();
                break;
            case Type.String:
                // Use string hash for zone map
                numVal = hashString(v);
                break;
            default:
                continue;
        }
        if (numVal < min)
            min = numVal;
        if (numVal > max)
            max = numVal;
    }
    // Handle empty or all-null columns
    if (min === Number.MAX_VALUE) {
        min = 0;
        max = 0;
    }
    return { min, max, nullCount, bloomOffset: 0 };
}
/**
 * Check if zone map allows skipping the chunk
 */
export function canSkipByZoneMap(zoneMap, filter) {
    // Skip if all nulls
    if (zoneMap.nullCount > 0 && zoneMap.min === 0 && zoneMap.max === 0) {
        return true;
    }
    // Skip if filter min > zone max
    if (filter.min !== undefined && filter.min > zoneMap.max) {
        return true;
    }
    // Skip if filter max < zone min
    if (filter.max !== undefined && filter.max < zoneMap.min) {
        return true;
    }
    return false;
}
/**
 * Simple string hash for zone maps
 */
function hashString(s) {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = Math.imul(31, hash) + s.charCodeAt(i) | 0;
    }
    return hash;
}
// =============================================================================
// DICTIONARY ENCODING (Binary Search Optimized)
// =============================================================================
/**
 * Build sorted dictionary from string values
 * Returns dictionary entries and indices
 */
export function buildSortedDict(values, nulls) {
    // Collect unique values
    const uniqueSet = new Set();
    for (let i = 0; i < values.length; i++) {
        if (!nulls[i] && values[i] !== null && values[i] !== undefined) {
            uniqueSet.add(values[i]);
        }
    }
    // Sort for binary search
    const dict = [...uniqueSet].sort();
    // Build index map
    const dictMap = new Map();
    for (let i = 0; i < dict.length; i++) {
        dictMap.set(dict[i], i);
    }
    // Create indices (0xFFFF for null)
    const indices = new Uint16Array(values.length);
    for (let i = 0; i < values.length; i++) {
        if (nulls[i]) {
            indices[i] = 0xFFFF;
        }
        else {
            indices[i] = dictMap.get(values[i]) ?? 0xFFFF;
        }
    }
    return { dict, indices };
}
/**
 * Binary search in sorted dictionary
 */
export function dictBinarySearch(dict, target) {
    let left = 0;
    let right = dict.length - 1;
    while (left <= right) {
        const mid = (left + right) >>> 1;
        const cmp = dict[mid].localeCompare(target);
        if (cmp === 0)
            return mid;
        if (cmp < 0)
            left = mid + 1;
        else
            right = mid - 1;
    }
    return -1; // Not found
}
/**
 * Encode dictionary to bytes
 */
export function encodeSortedDict(dict) {
    const encoder = new TextEncoder();
    const encoded = dict.map(s => encoder.encode(s));
    const totalLen = encoded.reduce((a, b) => a + 2 + b.length, 0);
    const result = new Uint8Array(4 + totalLen);
    const view = new DataView(result.buffer);
    let offset = 0;
    // Dict size
    view.setUint32(offset, dict.length, true);
    offset += 4;
    // Dict entries (length-prefixed)
    for (const e of encoded) {
        view.setUint16(offset, e.length, true);
        offset += 2;
        result.set(e, offset);
        offset += e.length;
    }
    return result;
}
/**
 * Decode dictionary from bytes
 */
export function decodeSortedDict(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const decoder = new TextDecoder();
    let offset = 0;
    const dictSize = view.getUint32(offset, true);
    offset += 4;
    const dict = [];
    for (let i = 0; i < dictSize; i++) {
        const len = view.getUint16(offset, true);
        offset += 2;
        dict.push(decoder.decode(data.subarray(offset, offset + len)));
        offset += len;
    }
    return dict;
}
// =============================================================================
// MAIN ENCODE/DECODE FUNCTIONS
// =============================================================================
/**
 * Encode a column using snippet-optimized format
 */
export function encodeSnippetColumn(path, type, values, nulls, options) {
    // Pack null bitmap
    const nullBitmap = packBitmap(nulls);
    // Compute zone map
    const zoneMap = computeZoneMap(values, nulls, type);
    // Check if sorted
    const sorted = isSorted(values, nulls, type);
    // Build bloom filter if requested
    let bloomFilter;
    if (options?.buildBloom && values.length > 0) {
        const bloom = new BloomFilter(values.length);
        for (let i = 0; i < values.length; i++) {
            if (!nulls[i]) {
                bloom.add(values[i]);
            }
        }
        bloomFilter = bloom.toBytes();
    }
    // Select encoding and encode
    const { encoding, data } = selectAndEncodeSnippet(type, values, nulls, sorted);
    return {
        path,
        type,
        encoding,
        data,
        nullBitmap,
        zoneMap,
        bloomFilter,
        sorted,
    };
}
/**
 * Select best encoding for snippet constraints
 */
function selectAndEncodeSnippet(type, values, nulls, sorted) {
    // Filter out nulls for encoding
    const nonNullValues = [];
    for (let i = 0; i < values.length; i++) {
        if (!nulls[i])
            nonNullValues.push(values[i]);
    }
    if (nonNullValues.length === 0) {
        return { encoding: SnippetEncoding.Raw, data: new Uint8Array(0) };
    }
    switch (type) {
        case Type.Bool:
            return { encoding: SnippetEncoding.Bitmap, data: packBitmap(nonNullValues) };
        case Type.Int32:
        case Type.Int64:
            return encodeIntegers(nonNullValues, sorted);
        case Type.Float64:
            return encodeFloats(nonNullValues);
        case Type.String:
            return encodeStrings(nonNullValues, nulls);
        default:
            return encodeRaw(nonNullValues, type);
    }
}
/**
 * Encode integers with Delta + BitPacking for sorted, or raw for unsorted
 */
function encodeIntegers(values, sorted) {
    if (sorted) {
        // Delta + BitPacking for sorted integers
        const deltas = deltaEncode(values);
        const bitWidth = computeBitWidth(deltas.slice(1)); // Skip first value
        // Store first value as int32, then bit-packed deltas
        const packedDeltas = bitPack(deltas.slice(1).map(d => d >= 0 ? d : 0), bitWidth);
        const result = new Uint8Array(4 + packedDeltas.length);
        const view = new DataView(result.buffer);
        view.setInt32(0, deltas[0], true);
        result.set(packedDeltas, 4);
        return { encoding: SnippetEncoding.DeltaBitPack, data: result };
    }
    else {
        // Raw Int32 array for unsorted
        const arr = new Int32Array(values);
        return { encoding: SnippetEncoding.Raw, data: new Uint8Array(arr.buffer) };
    }
}
/**
 * Encode floats as raw Float64 array (zero-copy friendly)
 */
function encodeFloats(values) {
    const arr = new Float64Array(values);
    return { encoding: SnippetEncoding.Raw, data: new Uint8Array(arr.buffer) };
}
/**
 * Encode strings with dictionary encoding
 * Note: values here are already filtered to non-null values
 */
function encodeStrings(values, _nulls) {
    // Check cardinality - use dictionary if < 50% unique
    const uniqueCount = new Set(values).size;
    const nonNullCount = values.length;
    if (uniqueCount < nonNullCount / 2 && uniqueCount <= MAX_DICT_SIZE) {
        // Dictionary encoding for non-null values only
        const fakeNulls = new Array(values.length).fill(false);
        const { dict, indices } = buildSortedDict(values, fakeNulls);
        const dictBytes = encodeSortedDict(dict);
        // Combine dict and indices
        const result = new Uint8Array(dictBytes.length + indices.length * 2);
        result.set(dictBytes, 0);
        new Uint8Array(indices.buffer).forEach((b, i) => result[dictBytes.length + i] = b);
        return { encoding: SnippetEncoding.Dict, data: result };
    }
    else {
        // Raw length-prefixed strings
        return encodeRaw(values, Type.String);
    }
}
/**
 * Raw encoding fallback
 */
function encodeRaw(values, type) {
    const encoder = new TextEncoder();
    const chunks = [];
    for (const v of values) {
        switch (type) {
            case Type.String: {
                const bytes = encoder.encode(v);
                const lenBuf = new Uint8Array(2);
                new DataView(lenBuf.buffer).setUint16(0, bytes.length, true);
                chunks.push(lenBuf);
                chunks.push(bytes);
                break;
            }
            case Type.Binary: {
                const bytes = v;
                const lenBuf = new Uint8Array(4);
                new DataView(lenBuf.buffer).setUint32(0, bytes.length, true);
                chunks.push(lenBuf);
                chunks.push(bytes);
                break;
            }
            default:
                break;
        }
    }
    // Concat chunks
    const total = chunks.reduce((a, b) => a + b.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return { encoding: SnippetEncoding.Raw, data: result };
}
/**
 * Pack boolean array to bitmap
 */
export function packBitmap(bits) {
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    for (let i = 0; i < bits.length; i++) {
        if (bits[i])
            bytes[i >>> 3] |= 1 << (i & 7);
    }
    return bytes;
}
/**
 * Unpack bitmap to boolean array
 */
export function unpackBitmap(bytes, count) {
    const bits = new Array(count);
    for (let i = 0; i < count; i++) {
        bits[i] = (bytes[i >>> 3] & (1 << (i & 7))) !== 0;
    }
    return bits;
}
/**
 * Check if values are sorted
 */
function isSorted(values, nulls, type) {
    let prev = null;
    for (let i = 0; i < values.length; i++) {
        if (nulls[i])
            continue;
        const v = values[i];
        if (prev !== null) {
            switch (type) {
                case Type.Int32:
                case Type.Int64:
                case Type.Float64:
                    if (v < prev)
                        return false;
                    break;
                case Type.String:
                    if (v < prev)
                        return false;
                    break;
                default:
                    return false;
            }
        }
        prev = v;
    }
    return true;
}
// =============================================================================
// ZERO-COPY DECODE
// =============================================================================
/**
 * Zero-copy decode for numeric types
 * Returns typed array view directly into the data buffer
 */
export function zeroCopyDecodeInt32(data, count) {
    // Ensure proper alignment
    if (data.byteOffset % 4 === 0) {
        return new Int32Array(data.buffer, data.byteOffset, count);
    }
    // Copy if not aligned
    const aligned = new Uint8Array(count * 4);
    aligned.set(data.subarray(0, count * 4));
    return new Int32Array(aligned.buffer, 0, count);
}
/**
 * Zero-copy decode for Float64
 */
export function zeroCopyDecodeFloat64(data, count) {
    if (data.byteOffset % 8 === 0) {
        return new Float64Array(data.buffer, data.byteOffset, count);
    }
    const aligned = new Uint8Array(count * 8);
    aligned.set(data.subarray(0, count * 8));
    return new Float64Array(aligned.buffer, 0, count);
}
/**
 * Decode snippet column with zero-copy support
 */
export function decodeSnippetColumn(col, rowCount, _options) {
    const nulls = unpackBitmap(col.nullBitmap, rowCount);
    const nonNullCount = nulls.filter(n => !n).length;
    let values;
    let isZeroCopy = false;
    switch (col.encoding) {
        case SnippetEncoding.Raw:
            if (col.type === Type.Int32) {
                values = zeroCopyDecodeInt32(col.data, nonNullCount);
                isZeroCopy = true;
            }
            else if (col.type === Type.Float64) {
                values = zeroCopyDecodeFloat64(col.data, nonNullCount);
                isZeroCopy = true;
            }
            else if (col.type === Type.String) {
                values = decodeRawStrings(col.data, nonNullCount);
            }
            else {
                values = [];
            }
            break;
        case SnippetEncoding.DeltaBitPack:
            values = decodeDeltaBitPack(col.data, nonNullCount);
            break;
        case SnippetEncoding.Dict:
            values = decodeDictColumn(col.data, nonNullCount, nulls);
            break;
        case SnippetEncoding.Bitmap:
            values = unpackBitmap(col.data, nonNullCount);
            break;
        default:
            values = [];
    }
    return {
        path: col.path,
        type: col.type,
        values,
        nullBitmap: col.nullBitmap,
        isZeroCopy,
    };
}
/**
 * Decode delta + bitpacked integers
 */
function decodeDeltaBitPack(data, count) {
    if (count === 0 || data.length === 0)
        return new Int32Array(0);
    if (data.length < 4)
        return new Int32Array(0);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const firstValue = view.getInt32(0, true);
    if (count === 1) {
        return new Int32Array([firstValue]);
    }
    // Unpack remaining deltas
    const packedDeltas = data.subarray(4);
    if (packedDeltas.length === 0) {
        return new Int32Array([firstValue]);
    }
    const deltas = bitUnpack(packedDeltas, count - 1);
    // Apply delta decode
    const result = new Int32Array(count);
    result[0] = firstValue;
    for (let i = 1; i < count; i++) {
        result[i] = result[i - 1] + deltas[i - 1];
    }
    return result;
}
/**
 * Decode dictionary-encoded column
 * Note: data contains indices for non-null values only
 */
function decodeDictColumn(data, nonNullCount, _nulls) {
    if (data.length === 0 || nonNullCount === 0) {
        return [];
    }
    const dict = decodeSortedDict(data);
    // Find where indices start
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const dictSize = view.getUint32(0, true);
    let offset = 4;
    for (let i = 0; i < dictSize; i++) {
        const len = view.getUint16(offset, true);
        offset += 2 + len;
    }
    // Calculate how many indices we can read
    const remainingBytes = data.byteLength - offset;
    const indexCount = Math.min(nonNullCount, Math.floor(remainingBytes / 2));
    // Read indices - need to handle alignment
    const values = [];
    for (let i = 0; i < indexCount; i++) {
        const idx = view.getUint16(offset + i * 2, true);
        if (idx === 0xFFFF || idx >= dict.length) {
            values.push('');
        }
        else {
            values.push(dict[idx]);
        }
    }
    return values;
}
/**
 * Decode raw length-prefixed strings
 */
function decodeRawStrings(data, count) {
    const decoder = new TextDecoder();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const values = [];
    let offset = 0;
    for (let i = 0; i < count; i++) {
        const len = view.getUint16(offset, true);
        offset += 2;
        values.push(decoder.decode(data.subarray(offset, offset + len)));
        offset += len;
    }
    return values;
}
// =============================================================================
// CHUNK WRITE/READ
// =============================================================================
/**
 * Write snippet chunk to bytes
 */
export function writeSnippetChunk(columns, rowCount, options) {
    // Calculate sizes
    const columnDirSize = columns.length * COLUMN_DIR_ENTRY_SIZE;
    const zoneMapSize = columns.length * ZONE_MAP_SIZE;
    const pathTableSize = columns.reduce((sum, col) => sum + 2 + new TextEncoder().encode(col.path).length, 0);
    let dataSize = 0;
    let bloomSize = 0;
    for (const col of columns) {
        dataSize += col.nullBitmap.length + col.data.length;
        if (col.bloomFilter)
            bloomSize += col.bloomFilter.length;
    }
    const headerSize = SNIPPET_HEADER_SIZE;
    const metaSize = columnDirSize + zoneMapSize + pathTableSize;
    const totalSize = headerSize + metaSize + dataSize + bloomSize;
    const result = new Uint8Array(totalSize);
    const view = new DataView(result.buffer);
    let offset = 0;
    // Write header (64 bytes total)
    // Layout:
    //   0-3:   magic (4B)
    //   4-5:   version (2B)
    //   6-7:   flags (2B)
    //   8-11:  rowCount (4B)
    //   12-13: columnCount (2B)
    //   14-17: schemaId (4B)
    //   18-25: minTimestamp (8B)
    //   26-33: maxTimestamp (8B)
    //   34-37: dataOffset (4B)
    //   38-41: bloomOffset (4B)
    //   42-45: checksum (4B)
    //   46-63: reserved (18B)
    view.setUint32(offset, SNIPPET_MAGIC, true);
    offset += 4; // 0
    view.setUint16(offset, SNIPPET_VERSION, true);
    offset += 2; // 4
    view.setUint16(offset, bloomSize > 0 ? 1 : 0, true);
    offset += 2; // 6
    view.setUint32(offset, rowCount, true);
    offset += 4; // 8
    view.setUint16(offset, columns.length, true);
    offset += 2; // 12
    view.setUint32(offset, options?.schemaId ?? 0, true);
    offset += 4; // 14
    view.setBigUint64(offset, options?.minTimestamp ?? 0n, true);
    offset += 8; // 18
    view.setBigUint64(offset, options?.maxTimestamp ?? 0n, true);
    offset += 8; // 26
    const dataOffset = headerSize + metaSize;
    view.setUint32(offset, dataOffset, true);
    offset += 4; // 34
    view.setUint32(offset, dataOffset + dataSize, true);
    offset += 4; // 38
    // checksumOffset would be at offset (42) for future use
    // Skip to end of header
    offset = SNIPPET_HEADER_SIZE;
    // Write path table
    const encoder = new TextEncoder();
    for (const col of columns) {
        const pathBytes = encoder.encode(col.path);
        view.setUint16(offset, pathBytes.length, true);
        offset += 2;
        result.set(pathBytes, offset);
        offset += pathBytes.length;
    }
    // Write column directory
    let colDataOffset = 0;
    let bloomOffset = 0;
    for (const col of columns) {
        const colSize = col.nullBitmap.length + col.data.length;
        view.setUint32(offset, colDataOffset, true);
        offset += 4;
        view.setUint32(offset, colSize, true);
        offset += 4;
        result[offset++] = col.encoding;
        result[offset++] = col.type;
        view.setUint16(offset, (col.bloomFilter ? 1 : 0) | (col.sorted ? 2 : 0), true);
        offset += 2;
        view.setUint32(offset, col.bloomFilter?.length ?? 0, true);
        offset += 4;
        colDataOffset += colSize;
        if (col.bloomFilter)
            bloomOffset += col.bloomFilter.length;
    }
    // Write zone maps
    for (const col of columns) {
        view.setFloat64(offset, col.zoneMap.min, true);
        offset += 8;
        view.setFloat64(offset, col.zoneMap.max, true);
        offset += 8;
        view.setUint32(offset, col.zoneMap.nullCount, true);
        offset += 4;
        view.setUint32(offset, col.zoneMap.bloomOffset, true);
        offset += 4;
    }
    // Write column data
    for (const col of columns) {
        result.set(col.nullBitmap, offset);
        offset += col.nullBitmap.length;
        result.set(col.data, offset);
        offset += col.data.length;
    }
    // Write bloom filters
    for (const col of columns) {
        if (col.bloomFilter) {
            result.set(col.bloomFilter, offset);
            offset += col.bloomFilter.length;
        }
    }
    // Compute and write checksum at offset 42
    const checksum = computeChecksum(result.subarray(SNIPPET_HEADER_SIZE));
    view.setUint32(42, checksum, true);
    return result.slice(0, offset);
}
/**
 * Read snippet chunk header only (for fast filtering)
 */
export function readSnippetHeader(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const magic = view.getUint32(0, true);
    if (magic !== SNIPPET_MAGIC) {
        throw new Error(`Invalid snippet magic: 0x${magic.toString(16)}`);
    }
    return {
        magic,
        version: view.getUint16(4, true),
        flags: view.getUint16(6, true),
        rowCount: view.getUint32(8, true),
        columnCount: view.getUint16(12, true),
        schemaId: view.getUint32(14, true),
        minTimestamp: view.getBigUint64(18, true),
        maxTimestamp: view.getBigUint64(26, true),
        dataOffset: view.getUint32(34, true),
        bloomOffset: view.getUint32(38, true),
        checksum: view.getUint32(42, true),
    };
}
/**
 * Read snippet chunk with optional projection
 */
export function readSnippetChunk(data, options) {
    const header = readSnippetHeader(data);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = SNIPPET_HEADER_SIZE;
    // Read path table
    const decoder = new TextDecoder();
    const paths = [];
    for (let i = 0; i < header.columnCount; i++) {
        const pathLen = view.getUint16(offset, true);
        offset += 2;
        paths.push(decoder.decode(data.subarray(offset, offset + pathLen)));
        offset += pathLen;
    }
    // Read column directory
    const colDir = [];
    for (let i = 0; i < header.columnCount; i++) {
        colDir.push({
            offset: view.getUint32(offset, true),
            size: view.getUint32(offset + 4, true),
            encoding: data[offset + 8],
            type: data[offset + 9],
            flags: view.getUint16(offset + 10, true),
            bloomSize: view.getUint32(offset + 12, true),
        });
        offset += COLUMN_DIR_ENTRY_SIZE;
    }
    // Read zone maps
    const zoneMaps = [];
    for (let i = 0; i < header.columnCount; i++) {
        zoneMaps.push({
            min: view.getFloat64(offset, true),
            max: view.getFloat64(offset + 8, true),
            nullCount: view.getUint32(offset + 16, true),
            bloomOffset: view.getUint32(offset + 20, true),
        });
        offset += ZONE_MAP_SIZE;
    }
    // Determine which columns to decode
    const requestedColumns = options?.columns;
    const columnsToRead = requestedColumns
        ? paths.map((p, i) => ({ path: p, index: i })).filter(c => requestedColumns.includes(c.path))
        : paths.map((p, i) => ({ path: p, index: i }));
    // Read and decode columns
    const columns = [];
    for (const { path, index } of columnsToRead) {
        const dir = colDir[index];
        const zoneMap = zoneMaps[index];
        // Check zone map for skip
        if (options?.skipByZoneMap && canSkipByZoneMap(zoneMap, options.skipByZoneMap)) {
            continue;
        }
        // Read column data
        const colDataStart = header.dataOffset + dir.offset;
        const nullBitmapSize = Math.ceil(header.rowCount / 8);
        const nullBitmap = data.subarray(colDataStart, colDataStart + nullBitmapSize);
        const colData = data.subarray(colDataStart + nullBitmapSize, colDataStart + dir.size);
        // Decode
        const snippetCol = {
            path,
            type: dir.type,
            encoding: dir.encoding,
            data: colData,
            nullBitmap,
            zoneMap,
            sorted: (dir.flags & 2) !== 0,
        };
        columns.push(decodeSnippetColumn(snippetCol, header.rowCount, options));
    }
    return { header, columns };
}
/**
 * Simple checksum (FNV-1a)
 */
function computeChecksum(data) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) {
        hash ^= data[i];
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}
//# sourceMappingURL=snippet-format.js.map