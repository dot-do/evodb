/**
 * @evodb/core/snippet - Snippet-optimized columnar format
 *
 * This submodule exports the snippet-optimized format designed for:
 * - Cloudflare Snippets: 5ms CPU, 32MB RAM, 5 subrequests
 * - Zero-copy decode paths
 * - Zone maps for chunk skipping
 * - Bloom filters for fast lookups
 *
 * @module snippet
 */

export {
  // Constants
  SNIPPET_MAGIC,
  SNIPPET_VERSION,
  CHUNK_SIZE,
  SNIPPET_HEADER_SIZE,
  ZONE_MAP_SIZE,
  COLUMN_DIR_ENTRY_SIZE,
  BLOOM_BITS_PER_ELEMENT,
  BLOOM_HASH_COUNT,
  MAX_DICT_SIZE,
  BIT_WIDTHS,
  // Types
  SnippetEncoding,
  type SnippetHeader,
  type ColumnDirEntry,
  type ZoneMap,
  type SnippetColumn,
  type DecodeOptions,
  type DecodedColumn,
  type BloomFilterConfig,
  // Encoding helpers
  computeBitWidth,
  bitPack,
  bitUnpack,
  deltaEncode,
  deltaDecode,
  // Bloom filter
  BloomFilter,
  calculateBloomParams,
  // Zone map
  computeZoneMap,
  canSkipByZoneMap,
  // Dictionary encoding
  buildSortedDict,
  dictBinarySearch,
  encodeSortedDict,
  decodeSortedDict,
  // Column encoding/decoding
  encodeSnippetColumn,
  decodeSnippetColumn,
  // Bitmap
  packBitmap,
  unpackBitmap,
  // Zero-copy decode
  zeroCopyDecodeInt32,
  zeroCopyDecodeFloat64,
  // Chunk I/O
  writeSnippetChunk,
  readSnippetHeader,
  readSnippetChunk,
} from '../snippet-format.js';
