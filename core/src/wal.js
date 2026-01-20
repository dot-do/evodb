// WAL (Write-Ahead Log) entry format (~0.8KB budget)
import { WalOp } from './types.js';
import { shred } from './shred.js';
import { encode } from './encode.js';
// WAL header: lsn(8) + timestamp(8) + op(1) + flags(1) + reserved(2) + dataLen(4) = 24, then checksum at end
/** CRC32 for WAL */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++)
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[i] = c;
}
function crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++)
        crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
/** Create WAL entry from document */
export function createWalEntry(doc, lsn, op = WalOp.Insert) {
    const timestamp = BigInt(Date.now());
    const columns = shred([doc]);
    const encoded = encode(columns);
    // Serialize encoded columns compactly
    const encoder = new TextEncoder();
    const parts = [];
    // Column count
    const countBuf = new Uint8Array(2);
    new DataView(countBuf.buffer).setUint16(0, encoded.length, true);
    parts.push(countBuf);
    for (const col of encoded) {
        const pathBytes = encoder.encode(col.path);
        // path length + path + type + encoding + bitmap length + bitmap + data length + data
        const header = new Uint8Array(2 + pathBytes.length + 2 + 4 + col.nullBitmap.length + 4 + col.data.length);
        const view = new DataView(header.buffer);
        let off = 0;
        view.setUint16(off, pathBytes.length, true);
        off += 2;
        header.set(pathBytes, off);
        off += pathBytes.length;
        header[off++] = col.type;
        header[off++] = col.encoding;
        view.setUint32(off, col.nullBitmap.length, true);
        off += 4;
        header.set(col.nullBitmap, off);
        off += col.nullBitmap.length;
        view.setUint32(off, col.data.length, true);
        off += 4;
        header.set(col.data, off);
        parts.push(header);
    }
    // Concat parts
    const totalLen = parts.reduce((a, b) => a + b.length, 0);
    const data = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) {
        data.set(p, offset);
        offset += p.length;
    }
    return { lsn, timestamp, op, flags: 0, data, checksum: crc32(data) };
}
/** Serialize WAL entry to bytes */
export function serializeWalEntry(entry) {
    const result = new Uint8Array(24 + entry.data.length + 4);
    const view = new DataView(result.buffer);
    let offset = 0;
    view.setBigUint64(offset, entry.lsn, true);
    offset += 8;
    view.setBigUint64(offset, entry.timestamp, true);
    offset += 8;
    result[offset++] = entry.op;
    result[offset++] = entry.flags;
    view.setUint16(offset, 0, true);
    offset += 2; // reserved
    view.setUint32(offset, entry.data.length, true);
    offset += 4;
    result.set(entry.data, offset);
    offset += entry.data.length;
    view.setUint32(offset, entry.checksum, true);
    return result;
}
/** Deserialize WAL entry from bytes */
export function deserializeWalEntry(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;
    const lsn = view.getBigUint64(offset, true);
    offset += 8;
    const timestamp = view.getBigUint64(offset, true);
    offset += 8;
    const op = data[offset++];
    const flags = data[offset++];
    offset += 2; // reserved
    const dataLen = view.getUint32(offset, true);
    offset += 4;
    const entryData = data.slice(offset, offset + dataLen);
    offset += dataLen;
    const checksum = view.getUint32(offset, true);
    // Verify checksum
    if (crc32(entryData) !== checksum)
        throw new Error('WAL entry checksum mismatch');
    return { lsn, timestamp, op, flags, data: entryData, checksum };
}
/** Batch multiple WAL entries */
export function batchWalEntries(entries) {
    const serialized = entries.map(serializeWalEntry);
    const totalLen = 4 + serialized.reduce((a, b) => a + 4 + b.length, 0);
    const result = new Uint8Array(totalLen);
    const view = new DataView(result.buffer);
    let offset = 0;
    view.setUint32(offset, entries.length, true);
    offset += 4;
    for (const s of serialized) {
        view.setUint32(offset, s.length, true);
        offset += 4;
        result.set(s, offset);
        offset += s.length;
    }
    return result;
}
/** Unbatch WAL entries */
export function unbatchWalEntries(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;
    const count = view.getUint32(offset, true);
    offset += 4;
    const entries = [];
    for (let i = 0; i < count; i++) {
        const len = view.getUint32(offset, true);
        offset += 4;
        entries.push(deserializeWalEntry(data.subarray(offset, offset + len)));
        offset += len;
    }
    return entries;
}
/** Get LSN range from batched entries */
export function getWalRange(data) {
    const entries = unbatchWalEntries(data);
    if (entries.length === 0)
        return { minLsn: 0n, maxLsn: 0n, count: 0 };
    let minLsn = entries[0].lsn;
    let maxLsn = entries[0].lsn;
    for (const e of entries) {
        if (e.lsn < minLsn)
            minLsn = e.lsn;
        if (e.lsn > maxLsn)
            maxLsn = e.lsn;
    }
    return { minLsn, maxLsn, count: entries.length };
}
//# sourceMappingURL=wal.js.map