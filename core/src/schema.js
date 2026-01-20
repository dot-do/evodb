// Schema evolution (~1.2KB budget)
import { Type, assertNever } from './types.js';
/** Create schema from columns */
export function inferSchema(columns, id = 1, version = 1) {
    return {
        id,
        version,
        columns: columns.map(c => ({
            path: c.path,
            type: c.type,
            nullable: c.nullable,
        })),
    };
}
/** Serialize schema to bytes */
export function serializeSchema(schema) {
    const encoder = new TextEncoder();
    const pathBytes = schema.columns.map(c => encoder.encode(c.path));
    const totalPathLen = pathBytes.reduce((a, b) => a + b.length, 0);
    // id(4) + version(4) + colCount(2) + columns(path_len(2) + path + type(1) + nullable(1) + hasDefault(1) + defaultLen?(4) + default?)
    const baseSize = 10 + schema.columns.length * 6 + totalPathLen;
    const defaultSizes = schema.columns.map(c => c.defaultValue !== undefined ? 4 + estimateValueSize(c.defaultValue, c.type) : 0);
    const totalSize = baseSize + defaultSizes.reduce((a, b) => a + b, 0);
    const result = new Uint8Array(totalSize);
    const view = new DataView(result.buffer);
    let offset = 0;
    view.setUint32(offset, schema.id, true);
    offset += 4;
    view.setUint32(offset, schema.version, true);
    offset += 4;
    view.setUint16(offset, schema.columns.length, true);
    offset += 2;
    for (let i = 0; i < schema.columns.length; i++) {
        const col = schema.columns[i];
        const pathB = pathBytes[i];
        view.setUint16(offset, pathB.length, true);
        offset += 2;
        result.set(pathB, offset);
        offset += pathB.length;
        result[offset++] = col.type;
        result[offset++] = col.nullable ? 1 : 0;
        result[offset++] = col.defaultValue !== undefined ? 1 : 0;
        if (col.defaultValue !== undefined) {
            const defaultBytes = serializeDefault(col.defaultValue, col.type);
            view.setUint32(offset, defaultBytes.length, true);
            offset += 4;
            result.set(defaultBytes, offset);
            offset += defaultBytes.length;
        }
    }
    return result.slice(0, offset);
}
/** Deserialize schema from bytes */
export function deserializeSchema(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const decoder = new TextDecoder();
    let offset = 0;
    const id = view.getUint32(offset, true);
    offset += 4;
    const version = view.getUint32(offset, true);
    offset += 4;
    const colCount = view.getUint16(offset, true);
    offset += 2;
    const columns = [];
    for (let i = 0; i < colCount; i++) {
        const pathLen = view.getUint16(offset, true);
        offset += 2;
        const path = decoder.decode(data.subarray(offset, offset + pathLen));
        offset += pathLen;
        const type = data[offset++];
        const nullable = data[offset++] === 1;
        const hasDefault = data[offset++] === 1;
        let defaultValue;
        if (hasDefault) {
            const defLen = view.getUint32(offset, true);
            offset += 4;
            defaultValue = deserializeDefault(data.subarray(offset, offset + defLen), type);
            offset += defLen;
        }
        columns.push({ path, type, nullable, defaultValue });
    }
    return { id, version, columns };
}
/** Check if schema B is compatible with schema A (can read A's data) */
export function isCompatible(older, newer) {
    const olderPaths = new Map(older.columns.map(c => [c.path, c]));
    for (const col of newer.columns) {
        const oldCol = olderPaths.get(col.path);
        if (!oldCol) {
            // New column must be nullable or have default
            if (!col.nullable && col.defaultValue === undefined)
                return false;
            continue;
        }
        // Type must be compatible (same or promotable)
        if (!canPromote(oldCol.type, col.type))
            return false;
    }
    return true;
}
/** Check if type A can be promoted to type B */
function canPromote(from, to) {
    if (from === to)
        return true;
    // Int32 -> Int64 or Float64
    if (from === Type.Int32 && (to === Type.Int64 || to === Type.Float64))
        return true;
    // Int64 -> Float64 (with precision loss warning)
    if (from === Type.Int64 && to === Type.Float64)
        return true;
    // Any -> String
    if (to === Type.String)
        return true;
    return false;
}
/** Migrate columns from old schema to new schema */
export function migrateColumns(columns, _oldSchema, newSchema) {
    const colMap = new Map(columns.map(c => [c.path, c]));
    const rowCount = columns.length > 0 ? columns[0].values.length : 0;
    const result = [];
    for (const newCol of newSchema.columns) {
        const oldCol = colMap.get(newCol.path);
        if (oldCol) {
            // Existing column - potentially promote type
            if (oldCol.type !== newCol.type) {
                result.push(promoteColumn(oldCol, newCol.type));
            }
            else {
                result.push(oldCol);
            }
        }
        else {
            // New column - fill with default or null
            const defaultVal = newCol.defaultValue ?? null;
            result.push({
                path: newCol.path,
                type: newCol.type,
                nullable: newCol.nullable,
                values: new Array(rowCount).fill(defaultVal),
                nulls: new Array(rowCount).fill(defaultVal === null),
            });
        }
    }
    return result;
}
/** Promote column values to new type */
function promoteColumn(col, toType) {
    const values = col.values.map((v, i) => {
        if (col.nulls[i])
            return null;
        return promoteValue(v, col.type, toType);
    });
    return { ...col, type: toType, values };
}
/** Promote single value */
function promoteValue(v, from, to) {
    if (v === null)
        return null;
    if (to === Type.String)
        return String(v);
    if (from === Type.Int32 && to === Type.Int64)
        return BigInt(v);
    if (from === Type.Int32 && to === Type.Float64)
        return v;
    if (from === Type.Int64 && to === Type.Float64)
        return Number(v);
    return v;
}
/** Estimate serialized size of value */
function estimateValueSize(v, type) {
    if (v === null)
        return 0;
    switch (type) {
        case Type.Null: return 0;
        case Type.Bool: return 1;
        case Type.Int32: return 4;
        case Type.Int64: return 8;
        case Type.Float64: return 8;
        case Type.String: return 2 + new TextEncoder().encode(v).length;
        case Type.Binary: return 4 + v.length;
        case Type.Array: return 0; // Complex types not supported for defaults
        case Type.Object: return 0;
        case Type.Timestamp: return 8; // Stored as ms since epoch (int64)
        case Type.Date: return 2 + 10; // ISO date string "YYYY-MM-DD"
        default:
            return assertNever(type, `Unhandled type in estimateValueSize: ${type}`);
    }
}
/** Serialize default value */
function serializeDefault(v, type) {
    if (v === null)
        return new Uint8Array(0);
    const encoder = new TextEncoder();
    switch (type) {
        case Type.Null: return new Uint8Array(0);
        case Type.Bool: return new Uint8Array([v ? 1 : 0]);
        case Type.Int32: {
            const b = new Uint8Array(4);
            new DataView(b.buffer).setInt32(0, v, true);
            return b;
        }
        case Type.Int64: {
            const b = new Uint8Array(8);
            new DataView(b.buffer).setBigInt64(0, v, true);
            return b;
        }
        case Type.Float64: {
            const b = new Uint8Array(8);
            new DataView(b.buffer).setFloat64(0, v, true);
            return b;
        }
        case Type.String: {
            const e = encoder.encode(v);
            const b = new Uint8Array(2 + e.length);
            new DataView(b.buffer).setUint16(0, e.length, true);
            b.set(e, 2);
            return b;
        }
        case Type.Binary: {
            const d = v;
            const b = new Uint8Array(4 + d.length);
            new DataView(b.buffer).setUint32(0, d.length, true);
            b.set(d, 4);
            return b;
        }
        case Type.Array: return new Uint8Array(0); // Complex types not supported for defaults
        case Type.Object: return new Uint8Array(0);
        case Type.Timestamp: {
            const b = new Uint8Array(8);
            new DataView(b.buffer).setBigInt64(0, BigInt(v), true);
            return b;
        }
        case Type.Date: {
            const e = encoder.encode(v);
            const b = new Uint8Array(2 + e.length);
            new DataView(b.buffer).setUint16(0, e.length, true);
            b.set(e, 2);
            return b;
        }
        default:
            return assertNever(type, `Unhandled type in serializeDefault: ${type}`);
    }
}
/** Deserialize default value */
function deserializeDefault(data, type) {
    if (data.length === 0)
        return null;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const decoder = new TextDecoder();
    switch (type) {
        case Type.Null: return null;
        case Type.Bool: return data[0] === 1;
        case Type.Int32: return view.getInt32(0, true);
        case Type.Int64: return view.getBigInt64(0, true);
        case Type.Float64: return view.getFloat64(0, true);
        case Type.String: {
            const len = view.getUint16(0, true);
            return decoder.decode(data.subarray(2, 2 + len));
        }
        case Type.Binary: {
            const len = view.getUint32(0, true);
            return data.slice(4, 4 + len);
        }
        case Type.Array: return null; // Complex types not supported for defaults
        case Type.Object: return null;
        case Type.Timestamp: return Number(view.getBigInt64(0, true));
        case Type.Date: {
            const len = view.getUint16(0, true);
            return decoder.decode(data.subarray(2, 2 + len));
        }
        default:
            return assertNever(type, `Unhandled type in deserializeDefault: ${type}`);
    }
}
/** Compare two schemas and return the differences */
export function schemaDiff(older, newer) {
    const olderPaths = new Map(older.columns.map(c => [c.path, c]));
    const newerPaths = new Map(newer.columns.map(c => [c.path, c]));
    const added = [];
    const removed = [];
    const modified = [];
    // Find added and modified columns
    for (const [path, col] of newerPaths) {
        const oldCol = olderPaths.get(path);
        if (!oldCol) {
            added.push(path);
        }
        else if (oldCol.type !== col.type || oldCol.nullable !== col.nullable) {
            modified.push(path);
        }
    }
    // Find removed columns
    for (const path of olderPaths.keys()) {
        if (!newerPaths.has(path)) {
            removed.push(path);
        }
    }
    return { added, removed, modified };
}
//# sourceMappingURL=schema.js.map