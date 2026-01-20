/**
 * @evodb/core/encoding - Encoding and decoding operations
 *
 * This submodule exports all encoding/decoding functionality including:
 * - Column encoding with automatic selection (RLE, Dict, Delta, Plain)
 * - Fast decode paths for snippet constraints
 * - String interning pool
 *
 * @module encoding
 */

export {
  encode,
  decode,
  unpackBits,
  encodeDict,
  encodeDelta,
  // Fast decode paths for snippet constraints
  fastDecodeInt32,
  fastDecodeFloat64,
  fastDecodeDeltaInt32,
  iterateNonNullIndices,
  batchDecode,
  type FastDecodeOptions,
} from '../encode.js';

export {
  LRUStringPool,
  internString,
  getStringPoolStats,
  resetStringPool,
  type StringPoolStats,
  type StringPoolOptions,
} from '../string-intern-pool.js';
