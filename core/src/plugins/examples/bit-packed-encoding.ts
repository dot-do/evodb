/**
 * BitPackedEncoding Plugin
 *
 * TDD Issue: evodb-w1m
 *
 * Example encoding plugin that packs integers using minimal bits based on value range.
 *
 * How it works:
 * 1. Calculate the range of values (max - min)
 * 2. Determine the minimum number of bits needed to represent the range
 * 3. Store values as: base value + bit-packed deltas from base
 *
 * Format:
 * [4 bytes: base value (min)]
 * [4 bytes: count]
 * [1 byte: bits per value]
 * [N bytes: packed bits]
 *
 * Benefits:
 * - Great compression for columns with small integer ranges
 * - Useful for status codes, flags, counters with known bounds
 * - Example: 1000 values in range 0-15 = 50 bytes vs 4000 bytes plain
 */

import type { EncodingPlugin, PluginMetadata } from '../types.js';
import type { ColumnStats } from '../../types.js';
import { Type } from '../../types.js';

// =============================================================================
// Constants
// =============================================================================

/** Type ID for bit-packed encoding (custom encodings start at 100) */
const BIT_PACKED_TYPE_ID = 100;

/** Header size: base(4) + count(4) + bitsPerValue(1) = 9 bytes */
const HEADER_SIZE = 9;

// Maximum bits per value we'll handle (32-bit integers): 32

/** Maximum range where bit-packing is beneficial (16 bits = 65536 values) */
const MAX_BENEFICIAL_RANGE = 1 << 16;

// =============================================================================
// Plugin Metadata
// =============================================================================

const metadata: PluginMetadata = {
  name: 'bit-packed',
  version: '1.0.0',
  description: 'Packs integers using minimal bits based on value range',
  author: 'EvoDB',
  license: 'MIT',
  tags: ['encoding', 'compression', 'integers'],
};

// =============================================================================
// Bit Manipulation Helpers
// =============================================================================

/**
 * Calculate the number of bits needed to represent a value.
 */
function bitsNeeded(maxValue: number): number {
  if (maxValue <= 0) return 0;
  if (maxValue > 0x7FFFFFFF) return 32;
  return Math.ceil(Math.log2(maxValue + 1));
}

/**
 * Pack values into a bit array.
 *
 * @param values - Values to pack (normalized to 0-based)
 * @param bitsPerValue - Number of bits per value
 * @returns Packed byte array
 */
function packBits(values: number[], bitsPerValue: number): Uint8Array {
  if (bitsPerValue === 0 || values.length === 0) {
    return new Uint8Array(0);
  }

  const totalBits = values.length * bitsPerValue;
  const bytes = new Uint8Array(Math.ceil(totalBits / 8));

  let bitOffset = 0;

  for (const value of values) {
    // Write bits for this value
    let remaining = bitsPerValue;
    let v = value;

    while (remaining > 0) {
      const byteIndex = Math.floor(bitOffset / 8);
      const bitIndex = bitOffset % 8;
      const bitsAvailable = 8 - bitIndex;
      const bitsToWrite = Math.min(remaining, bitsAvailable);

      // Extract the bits we want to write (LSB first)
      const mask = (1 << bitsToWrite) - 1;
      const bits = v & mask;

      // Write to the current byte
      bytes[byteIndex] |= bits << bitIndex;

      // Move to next bits
      v >>>= bitsToWrite;
      remaining -= bitsToWrite;
      bitOffset += bitsToWrite;
    }
  }

  return bytes;
}

/**
 * Unpack values from a bit array.
 *
 * @param bytes - Packed byte array
 * @param count - Number of values to unpack
 * @param bitsPerValue - Number of bits per value
 * @returns Unpacked values (0-based, need to add base)
 */
function unpackBits(bytes: Uint8Array, count: number, bitsPerValue: number): number[] {
  if (bitsPerValue === 0 || count === 0) {
    return new Array(count).fill(0);
  }

  const values: number[] = [];
  let bitOffset = 0;

  for (let i = 0; i < count; i++) {
    let value = 0;
    let remaining = bitsPerValue;
    let valueOffset = 0;

    while (remaining > 0) {
      const byteIndex = Math.floor(bitOffset / 8);
      const bitIndex = bitOffset % 8;
      const bitsAvailable = 8 - bitIndex;
      const bitsToRead = Math.min(remaining, bitsAvailable);

      // Read bits from current byte
      const mask = (1 << bitsToRead) - 1;
      const bits = (bytes[byteIndex] >>> bitIndex) & mask;

      // Add to value
      value |= bits << valueOffset;

      // Move to next bits
      remaining -= bitsToRead;
      bitOffset += bitsToRead;
      valueOffset += bitsToRead;
    }

    values.push(value);
  }

  return values;
}

// =============================================================================
// Encoding Functions
// =============================================================================

/**
 * Encode values using bit-packing.
 */
function encode(values: unknown[], stats: ColumnStats): Uint8Array {
  if (values.length === 0) {
    return new Uint8Array(0);
  }

  const nums = values as number[];
  const min = typeof stats.min === 'number' ? stats.min : Math.min(...nums);
  const max = typeof stats.max === 'number' ? stats.max : Math.max(...nums);
  const range = max - min;
  const bitsPerValue = bitsNeeded(range);

  // Normalize values to 0-based
  const normalized = nums.map(v => v - min);

  // Pack the bits
  const packed = packBits(normalized, bitsPerValue);

  // Create output buffer: header + packed data
  const result = new Uint8Array(HEADER_SIZE + packed.length);
  const view = new DataView(result.buffer);

  // Write header
  view.setInt32(0, min, true);           // base value
  view.setUint32(4, nums.length, true);  // count
  result[8] = bitsPerValue;              // bits per value

  // Write packed data
  result.set(packed, HEADER_SIZE);

  return result;
}

/**
 * Decode bit-packed values.
 */
function decode(data: Uint8Array, count: number, _stats: ColumnStats): unknown[] {
  if (data.length === 0 || count === 0) {
    return [];
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Read header
  const base = view.getInt32(0, true);
  const storedCount = view.getUint32(4, true);
  const bitsPerValue = data[8];

  // Use minimum of requested count and stored count
  const actualCount = Math.min(count, storedCount);

  // Extract packed data
  const packed = data.subarray(HEADER_SIZE);

  // Unpack values
  const normalized = unpackBits(packed, actualCount, bitsPerValue);

  // Add base back
  return normalized.map(v => v + base);
}

/**
 * Estimate the encoded size.
 */
function estimateSize(values: unknown[]): number {
  if (values.length === 0) {
    return 0;
  }

  const nums = values as number[];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min;
  const bitsPerValue = bitsNeeded(range);

  const totalBits = nums.length * bitsPerValue;
  const packedBytes = Math.ceil(totalBits / 8);

  return HEADER_SIZE + packedBytes;
}

/**
 * Determine if bit-packing should be used for this data.
 */
function shouldUse(values: unknown[], stats: ColumnStats): boolean {
  if (values.length === 0) {
    return false;
  }

  // Need numeric min/max
  if (typeof stats.min !== 'number' || typeof stats.max !== 'number') {
    return false;
  }

  const range = stats.max - stats.min;

  // Only beneficial if range is small (fits in 16 bits or less)
  // This means we save at least 50% compared to plain 32-bit encoding
  return range <= MAX_BENEFICIAL_RANGE;
}

// =============================================================================
// Plugin Export
// =============================================================================

/**
 * BitPacked encoding plugin instance.
 */
export const BitPackedEncodingPlugin: EncodingPlugin = {
  metadata,
  typeId: BIT_PACKED_TYPE_ID,
  supportedTypes: [Type.Int32],
  encode,
  decode,
  estimateSize,
  shouldUse,
  priority: 10, // Higher priority than default
};

/**
 * Factory function to create a new BitPackedEncodingPlugin instance.
 *
 * @returns A new BitPackedEncodingPlugin
 *
 * @example
 * ```typescript
 * import { createBitPackedEncodingPlugin } from '@evodb/core/plugins';
 * import { createPluginRegistry } from '@evodb/core/plugins';
 *
 * const registry = createPluginRegistry();
 * registry.registerEncoding(createBitPackedEncodingPlugin());
 *
 * // Use for columns with small integer ranges
 * const statusCodes = [1, 2, 1, 3, 2, 1, 4]; // range 1-4, only needs 2 bits
 * ```
 */
export function createBitPackedEncodingPlugin(): EncodingPlugin {
  return { ...BitPackedEncodingPlugin };
}
