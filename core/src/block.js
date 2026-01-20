// Block format read/write (~1.5KB budget)
import { FOOTER_SIZE, HEADER_SIZE, MAGIC, VERSION } from './types.js';
import { decode } from './encode.js';
/** CRC32 lookup table */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++)
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[i] = c;
}
/** Compute CRC32 checksum */
function crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++)
        crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
/** Write columns to block format */
export function writeBlock(columns, opts = {}) {
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
    view.setUint32(offset, MAGIC, true);
    offset += 4;
    view.setUint16(offset, VERSION, true);
    offset += 2;
    view.setUint32(offset, opts.schemaId ?? 0, true);
    offset += 4;
    view.setUint32(offset, rowCount, true);
    offset += 4;
    view.setUint16(offset, columns.length, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2; // flags
    view.setBigUint64(offset, opts.minLsn ?? 0n, true);
    offset += 8;
    view.setBigUint64(offset, opts.maxLsn ?? 0n, true);
    offset += 8;
    // Checksum placeholder, reserved
    const checksumOffset = offset;
    offset = HEADER_SIZE;
    // Write schema
    const schemaOffset = offset;
    for (let i = 0; i < columns.length; i++) {
        const c = columns[i];
        view.setUint16(offset, pathTable[i].length, true);
        offset += 2;
        result.set(pathTable[i], offset);
        offset += pathTable[i].length;
        result[offset++] = c.type;
        result[offset++] = c.encoding;
    }
    // Write column data with stats
    const colOffsets = [];
    for (const c of columns) {
        colOffsets.push(offset);
        // Null bitmap size + data size
        view.setUint32(offset, c.nullBitmap.length, true);
        offset += 4;
        view.setUint32(offset, c.data.length, true);
        offset += 4;
        // Null bitmap
        result.set(c.nullBitmap, offset);
        offset += c.nullBitmap.length;
        // Data
        result.set(c.data, offset);
        offset += c.data.length;
        // Stats (24 bytes: min/max as f64, nullCount, distinctEst)
        const minNum = typeof c.stats.min === 'number' ? c.stats.min : 0;
        const maxNum = typeof c.stats.max === 'number' ? c.stats.max : 0;
        view.setFloat64(offset, minNum, true);
        offset += 8;
        view.setFloat64(offset, maxNum, true);
        offset += 8;
        view.setUint32(offset, c.stats.nullCount, true);
        offset += 4;
        view.setUint32(offset, c.stats.distinctEst, true);
        offset += 4;
    }
    // Write footer (32 bytes)
    const footerOffset = offset;
    view.setUint32(offset, schemaOffset, true);
    offset += 4;
    view.setUint32(offset, HEADER_SIZE, true);
    offset += 4;
    for (let i = 0; i < Math.min(5, colOffsets.length); i++) {
        view.setUint32(offset, colOffsets[i], true);
        offset += 4;
    }
    offset = footerOffset + FOOTER_SIZE - 4;
    view.setUint32(offset, MAGIC, true);
    // Compute and write checksum
    const checksum = crc32(result.subarray(HEADER_SIZE, footerOffset));
    view.setUint32(checksumOffset, checksum, true);
    return result.slice(0, footerOffset + FOOTER_SIZE);
}
/** Read block format to columns */
export function readBlock(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;
    // Read header
    const magic = view.getUint32(offset, true);
    offset += 4;
    if (magic !== MAGIC)
        throw new Error('Invalid block magic');
    const version = view.getUint16(offset, true);
    offset += 2;
    const schemaId = view.getUint32(offset, true);
    offset += 4;
    const rowCount = view.getUint32(offset, true);
    offset += 4;
    const columnCount = view.getUint16(offset, true);
    offset += 2;
    const flags = view.getUint16(offset, true);
    offset += 2;
    const minLsn = view.getBigUint64(offset, true);
    offset += 8;
    const maxLsn = view.getBigUint64(offset, true);
    offset += 8;
    const checksum = view.getUint32(offset, true);
    offset = HEADER_SIZE;
    // Read schema
    const decoder = new TextDecoder();
    const encoded = [];
    for (let i = 0; i < columnCount; i++) {
        const pathLen = view.getUint16(offset, true);
        offset += 2;
        const path = decoder.decode(data.subarray(offset, offset + pathLen));
        offset += pathLen;
        const type = data[offset++];
        const encoding = data[offset++];
        encoded.push({ path, type, encoding, data: new Uint8Array(0), nullBitmap: new Uint8Array(0), stats: { min: 0, max: 0, nullCount: 0, distinctEst: 0 } });
    }
    // Read column data
    for (const col of encoded) {
        const bitmapSize = view.getUint32(offset, true);
        offset += 4;
        const dataSize = view.getUint32(offset, true);
        offset += 4;
        col.nullBitmap = data.slice(offset, offset + bitmapSize);
        offset += bitmapSize;
        col.data = data.slice(offset, offset + dataSize);
        offset += dataSize;
        // Read stats
        col.stats.min = view.getFloat64(offset, true);
        offset += 8;
        col.stats.max = view.getFloat64(offset, true);
        offset += 8;
        col.stats.nullCount = view.getUint32(offset, true);
        offset += 4;
        col.stats.distinctEst = view.getUint32(offset, true);
        offset += 4;
    }
    // Decode columns
    const columns = encoded.map(e => decode(e, rowCount));
    const header = { magic, version, schemaId, rowCount, columnCount, flags, minLsn, maxLsn, checksum };
    return { header, columns };
}
/** Count non-null values from stats (approximate via total - null count) */
function countNonNullFromStats(col) {
    // Estimate based on distinctEst (not exact, but useful for writing)
    // The actual row count should be provided via opts.rowCount for accuracy
    return col.nullBitmap.length * 8 - col.stats.nullCount;
}
/** Get block statistics without full decode */
export function getBlockStats(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (view.getUint32(0, true) !== MAGIC)
        throw new Error('Invalid block');
    return {
        rowCount: view.getUint32(10, true),
        columnCount: view.getUint16(14, true),
        schemaId: view.getUint32(6, true),
    };
}
//# sourceMappingURL=block.js.map