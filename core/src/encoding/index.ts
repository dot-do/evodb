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
  // Dense bitmap unpacking for backward compatibility
  unpackBitsDense,
  // Lazy bitmap unpacking (Issue: evodb-a2x)
  unpackBitsLazy,
  type LazyBitmap,
  encodeDict,
  encodeDelta,
  // Fast decode paths for snippet constraints
  fastDecodeInt32,
  fastDecodeFloat64,
  fastDecodeDeltaInt32,
  iterateNonNullIndices,
  batchDecode,
  type FastDecodeOptions,
  // Sparse null bitmap optimization (Issue: evodb-qp6, evodb-80q)
  SparseNullSet,
  unpackBitsSparse,
  isAllNull,
  hasNoNulls,
  SPARSE_NULL_THRESHOLD,
  // NullBitmap helper functions (Issue: evodb-80q)
  type NullBitmap,
  isNullAt,
  toNullArray,
  hasAnyNulls,
  countNulls,
  // Decode bounds validation (Issue: evodb-imj)
  validateDecodeCount,
  validateBufferCapacity,
  MAX_DECODE_COUNT,
  // Runtime type validation (Issue: evodb-4v3)
  validateColumn,
  isValueTypeValid,
  getTypeName,
  getActualTypeName,
  VALID_TYPE_VALUES,
} from '../encode.js';

export {
  LRUStringPool,
  internString,
  getStringPoolStats,
  resetStringPool,
  type StringPoolStats,
  type StringPoolOptions,
} from '../string-intern-pool.js';
