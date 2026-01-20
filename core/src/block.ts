// Block format read/write (~1.5KB budget)

import { type BlockHeader, type BlockOptions, type EncodedColumn, FOOTER_SIZE, HEADER_SIZE, MAGIC, VERSION, type Column } from './types.js';
import { decode } from './encode.js';
import { CorruptedBlockError } from './errors.js';

/** CRC32 lookup table */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}

/** Compute CRC32 checksum */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Write columns to block format */
export function writeBlock(columns: EncodedColumn[], opts: BlockOptions & { rowCount?: number } = {}): Uint8Array {
  // Row count can be provided explicitly, or computed from stats
  const rowCount = opts.rowCount ?? (columns.length > 0 ? columns[0].stats.nullCount + (columns[0].stats.distinctEst > 0 ? countNonNullFromStats(columns[0]) : 0) : 0);
  const encoder = new TextEncoder();

  // Encode schema (paths + types)
  const pathTable = columns.map(c => encoder.encode(c.path));
  const schemaSize = pathTable.reduce((a, b) => a + 2 + b.length + 2, 0); // len + path + type+enc

  // Calculate column data sizes
  const colSizes = columns.map(c => 8 + c.nullBitmap.length + c.data.length + 24); // sizes(8) + bitmap + data + stats(24)

  // Total size
  const totalSize = HEADER_SIZE + schemaSize + colSizes.reduce((a, b) => a + b, 0) + FOOTER_SIZE;
  const result = new Uint8Array(totalSize);
  const view = new DataView(result.buffer);
  let offset = 0;

  // Write header (64 bytes)
  view.setUint32(offset, MAGIC, true); offset += 4;
  view.setUint16(offset, VERSION, true); offset += 2;
  view.setUint32(offset, opts.schemaId ?? 0, true); offset += 4;
  view.setUint32(offset, rowCount, true); offset += 4;
  view.setUint16(offset, columns.length, true); offset += 2;
  view.setUint16(offset, 0, true); offset += 2; // flags
  view.setBigUint64(offset, opts.minLsn ?? 0n, true); offset += 8;
  view.setBigUint64(offset, opts.maxLsn ?? 0n, true); offset += 8;
  // Checksum placeholder, reserved
  const checksumOffset = offset;
  offset = HEADER_SIZE;

  // Write schema
  const schemaOffset = offset;
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    view.setUint16(offset, pathTable[i].length, true); offset += 2;
    result.set(pathTable[i], offset); offset += pathTable[i].length;
    result[offset++] = c.type;
    result[offset++] = c.encoding;
  }

  // Write column data with stats
  const colOffsets: number[] = [];
  for (const c of columns) {
    colOffsets.push(offset);
    // Null bitmap size + data size
    view.setUint32(offset, c.nullBitmap.length, true); offset += 4;
    view.setUint32(offset, c.data.length, true); offset += 4;
    // Null bitmap
    result.set(c.nullBitmap, offset); offset += c.nullBitmap.length;
    // Data
    result.set(c.data, offset); offset += c.data.length;
    // Stats (24 bytes: min/max as f64, nullCount, distinctEst)
    const minNum = typeof c.stats.min === 'number' ? c.stats.min : 0;
    const maxNum = typeof c.stats.max === 'number' ? c.stats.max : 0;
    view.setFloat64(offset, minNum, true); offset += 8;
    view.setFloat64(offset, maxNum, true); offset += 8;
    view.setUint32(offset, c.stats.nullCount, true); offset += 4;
    view.setUint32(offset, c.stats.distinctEst, true); offset += 4;
  }

  // Write footer (32 bytes)
  const footerOffset = offset;
  view.setUint32(offset, schemaOffset, true); offset += 4;
  view.setUint32(offset, HEADER_SIZE, true); offset += 4;
  for (let i = 0; i < Math.min(5, colOffsets.length); i++) {
    view.setUint32(offset, colOffsets[i], true); offset += 4;
  }
  offset = footerOffset + FOOTER_SIZE - 4;
  view.setUint32(offset, MAGIC, true);

  // Compute and write checksum
  const checksum = crc32(result.subarray(HEADER_SIZE, footerOffset));
  view.setUint32(checksumOffset, checksum, true);

  return result.slice(0, footerOffset + FOOTER_SIZE);
}

/** Supported block versions */
const SUPPORTED_VERSIONS = [VERSION];

/** Maximum reasonable column count to prevent DoS from corrupted data */
const MAX_COLUMN_COUNT = 10000;

/** Maximum reasonable row count to prevent DoS from corrupted data */
const MAX_ROW_COUNT = 100000000; // 100 million

/**
 * Validate block data for corruption before parsing.
 * Throws CorruptedBlockError with specific error codes and details.
 */
function validateBlockData(data: Uint8Array): void {
  const minSize = HEADER_SIZE + FOOTER_SIZE;

  // Check for truncated data
  if (data.length < minSize) {
    throw new CorruptedBlockError(
      `Block data is truncated: expected at least ${minSize} bytes, got ${data.length}`,
      'TRUNCATED_DATA',
      { actualSize: data.length, minExpectedSize: minSize }
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Validate magic number
  const magic = view.getUint32(0, true);
  if (magic !== MAGIC) {
    throw new CorruptedBlockError(
      `Invalid magic number: expected 0x${MAGIC.toString(16).toUpperCase()}, got 0x${magic.toString(16).toUpperCase()}`,
      'INVALID_MAGIC',
      { expected: MAGIC, actual: magic, offset: 0 }
    );
  }

  // Validate version
  const version = view.getUint16(4, true);
  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new CorruptedBlockError(
      `Unsupported block version: ${version}. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
      'UNSUPPORTED_VERSION',
      { version, supportedVersions: SUPPORTED_VERSIONS }
    );
  }

  // Validate structural integrity
  const rowCount = view.getUint32(10, true);
  const columnCount = view.getUint16(14, true);

  if (columnCount > MAX_COLUMN_COUNT) {
    throw new CorruptedBlockError(
      `Invalid column count: ${columnCount} exceeds maximum ${MAX_COLUMN_COUNT}`,
      'INVALID_STRUCTURE',
      { actual: columnCount, expected: MAX_COLUMN_COUNT }
    );
  }

  if (rowCount > MAX_ROW_COUNT) {
    throw new CorruptedBlockError(
      `Invalid row count: ${rowCount} exceeds maximum ${MAX_ROW_COUNT}`,
      'INVALID_STRUCTURE',
      { actual: rowCount, expected: MAX_ROW_COUNT }
    );
  }
}

/**
 * Validate checksum after reading block data.
 * The checksum is computed over the data section (between header and footer).
 */
function validateChecksum(data: Uint8Array, storedChecksum: number, footerOffset: number): void {
  const dataSection = data.subarray(HEADER_SIZE, footerOffset);
  const computedChecksum = crc32(dataSection);

  if (computedChecksum !== storedChecksum) {
    throw new CorruptedBlockError(
      `Checksum mismatch: expected 0x${storedChecksum.toString(16).toUpperCase()}, computed 0x${computedChecksum.toString(16).toUpperCase()}`,
      'CHECKSUM_MISMATCH',
      { expected: storedChecksum, actual: computedChecksum, offset: 30 }
    );
  }
}

/** Read block format to columns */
export function readBlock(data: Uint8Array): { header: BlockHeader; columns: Column[] } {
  // Validate block data before parsing
  validateBlockData(data);

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  // Read header (already validated magic and version in validateBlockData)
  const magic = view.getUint32(offset, true); offset += 4;
  const version = view.getUint16(offset, true); offset += 2;
  const schemaId = view.getUint32(offset, true); offset += 4;
  const rowCount = view.getUint32(offset, true); offset += 4;
  const columnCount = view.getUint16(offset, true); offset += 2;
  const flags = view.getUint16(offset, true); offset += 2;
  const minLsn = view.getBigUint64(offset, true); offset += 8;
  const maxLsn = view.getBigUint64(offset, true); offset += 8;
  const checksum = view.getUint32(offset, true);

  offset = HEADER_SIZE;

  // Read schema
  const decoder = new TextDecoder();
  const encoded: EncodedColumn[] = [];

  for (let i = 0; i < columnCount; i++) {
    // Validate we have enough bytes for path length
    if (offset + 2 > data.length) {
      throw new CorruptedBlockError(
        `Truncated schema data at column ${i}: cannot read path length`,
        'TRUNCATED_DATA',
        { actualSize: data.length, minExpectedSize: offset + 2 }
      );
    }

    const pathLen = view.getUint16(offset, true); offset += 2;

    // Validate path length is reasonable
    if (pathLen > 1000) {
      throw new CorruptedBlockError(
        `Invalid path length at column ${i}: ${pathLen} bytes exceeds maximum`,
        'INVALID_STRUCTURE',
        { actual: pathLen, offset: offset - 2 }
      );
    }

    // Validate we have enough bytes for path + type + encoding
    if (offset + pathLen + 2 > data.length) {
      throw new CorruptedBlockError(
        `Truncated schema data at column ${i}: cannot read path and type`,
        'TRUNCATED_DATA',
        { actualSize: data.length, minExpectedSize: offset + pathLen + 2 }
      );
    }

    const path = decoder.decode(data.subarray(offset, offset + pathLen)); offset += pathLen;
    const type = data[offset++];
    const encoding = data[offset++];
    encoded.push({ path, type, encoding, data: new Uint8Array(0), nullBitmap: new Uint8Array(0), stats: { min: 0, max: 0, nullCount: 0, distinctEst: 0 } });
  }

  // Track the end of column data for checksum validation
  let columnDataEnd = offset;

  // Read column data
  for (let i = 0; i < encoded.length; i++) {
    const col = encoded[i];

    // Validate we have enough bytes for size fields
    if (offset + 8 > data.length) {
      throw new CorruptedBlockError(
        `Truncated column data at column ${i}: cannot read sizes`,
        'TRUNCATED_DATA',
        { actualSize: data.length, minExpectedSize: offset + 8 }
      );
    }

    const bitmapSize = view.getUint32(offset, true); offset += 4;
    const dataSize = view.getUint32(offset, true); offset += 4;

    // Validate sizes are reasonable
    const maxReasonableSize = data.length - HEADER_SIZE - FOOTER_SIZE;
    if (bitmapSize > maxReasonableSize || dataSize > maxReasonableSize) {
      throw new CorruptedBlockError(
        `Invalid column data sizes at column ${i}: bitmap=${bitmapSize}, data=${dataSize}`,
        'INVALID_STRUCTURE',
        { actual: bitmapSize + dataSize, expected: maxReasonableSize, offset: offset - 8 }
      );
    }

    // Validate we have enough bytes for column data + stats
    const requiredBytes = offset + bitmapSize + dataSize + 24; // 24 bytes for stats
    if (requiredBytes > data.length) {
      throw new CorruptedBlockError(
        `Truncated column data at column ${i}: need ${requiredBytes} bytes, have ${data.length}`,
        'TRUNCATED_DATA',
        { actualSize: data.length, minExpectedSize: requiredBytes }
      );
    }

    col.nullBitmap = data.slice(offset, offset + bitmapSize); offset += bitmapSize;
    col.data = data.slice(offset, offset + dataSize); offset += dataSize;

    // Read stats
    col.stats.min = view.getFloat64(offset, true); offset += 8;
    col.stats.max = view.getFloat64(offset, true); offset += 8;
    col.stats.nullCount = view.getUint32(offset, true); offset += 4;
    col.stats.distinctEst = view.getUint32(offset, true); offset += 4;

    columnDataEnd = offset;
  }

  // Validate checksum
  validateChecksum(data, checksum, columnDataEnd);

  // Decode columns
  const columns = encoded.map(e => decode(e, rowCount));

  const header: BlockHeader = { magic, version, schemaId, rowCount, columnCount, flags, minLsn, maxLsn, checksum };
  return { header, columns };
}

/** Count non-null values from stats (approximate via total - null count) */
function countNonNullFromStats(col: EncodedColumn): number {
  // Estimate based on distinctEst (not exact, but useful for writing)
  // The actual row count should be provided via opts.rowCount for accuracy
  return col.nullBitmap.length * 8 - col.stats.nullCount;
}

/** Get block statistics without full decode */
export function getBlockStats(data: Uint8Array): { rowCount: number; columnCount: number; schemaId: number } {
  // Check minimum size for header access
  if (data.length < HEADER_SIZE) {
    throw new CorruptedBlockError(
      `Block data is truncated: expected at least ${HEADER_SIZE} bytes for header, got ${data.length}`,
      'TRUNCATED_DATA',
      { actualSize: data.length, minExpectedSize: HEADER_SIZE }
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint32(0, true);

  if (magic !== MAGIC) {
    throw new CorruptedBlockError(
      `Invalid magic number: expected 0x${MAGIC.toString(16).toUpperCase()}, got 0x${magic.toString(16).toUpperCase()}`,
      'INVALID_MAGIC',
      { expected: MAGIC, actual: magic, offset: 0 }
    );
  }

  return {
    rowCount: view.getUint32(10, true),
    columnCount: view.getUint16(14, true),
    schemaId: view.getUint32(6, true),
  };
}
