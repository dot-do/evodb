// JSON Shredder - Flatten JSON documents to columns (~1.5KB budget)

import { type Column, Type } from './types.js';

/** Shred options */
export interface ShredOptions {
  columns?: string[];  // Column projection - only include these paths
}

/** ISO date regex: YYYY-MM-DD */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Infer type from value */
function inferType(v: unknown): Type {
  if (v === null || v === undefined) return Type.Null;
  if (typeof v === 'boolean') return Type.Bool;
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 2147483648 ? Type.Int32 : Type.Float64;
  if (typeof v === 'bigint') return Type.Int64;
  if (typeof v === 'string') {
    // Check for ISO date format
    if (ISO_DATE_REGEX.test(v)) return Type.Date;
    return Type.String;
  }
  if (v instanceof Date) return Type.Timestamp;
  if (v instanceof Uint8Array) return Type.Binary;
  if (Array.isArray(v)) return Type.Array;
  return Type.Object;
}

/** Shred JSON documents into columnar format */
export function shred(docs: unknown[], options?: ShredOptions): Column[] {
  const cols = new Map<string, Column>();
  const n = docs.length;
  const columnFilter = options?.columns ? new Set(options.columns) : null;

  // First pass: discover all paths and types
  for (let i = 0; i < n; i++) {
    walk(docs[i], '', cols, i, n, columnFilter);
  }

  // Second pass: fill nulls for missing values and set nullable flag
  for (const col of cols.values()) {
    while (col.values.length < n) {
      col.values.push(null);
      col.nulls.push(true);
      col.nullable = true;
    }
    // Also check if any existing value is null
    if (!col.nullable && col.nulls.some(n => n)) {
      col.nullable = true;
    }
    // Add RLE compression for null bitmaps with many consecutive nulls
    compressNullBitmap(col);
  }

  return [...cols.values()];
}

/** Check if path matches column filter */
function matchesFilter(path: string, filter: Set<string> | null): boolean {
  if (!filter) return true;
  return filter.has(path);
}

/** Check if any filter path starts with this prefix (for nested paths) */
function prefixMatchesFilter(prefix: string, filter: Set<string> | null): boolean {
  if (!filter) return true;
  for (const p of filter) {
    if (p === prefix || p.startsWith(prefix + '.') || p.startsWith(prefix + '[')) return true;
  }
  return false;
}

/** Recursively walk object and extract column values */
function walk(
  val: unknown,
  path: string,
  cols: Map<string, Column>,
  row: number,
  total: number,
  filter: Set<string> | null
): void {
  const type = inferType(val);

  // Array handling - shred to indexed paths like tags[0], tags[1]
  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      const indexPath = path ? `${path}[${i}]` : `[${i}]`;
      if (filter && !prefixMatchesFilter(indexPath, filter)) continue;
      walk(val[i], indexPath, cols, row, total, filter);
    }
    return;
  }

  // Leaf value - add to column
  if (type !== Type.Object || val === null) {
    // Check filter for leaf values
    if (filter && !matchesFilter(path, filter)) return;

    let col = cols.get(path);
    if (!col) {
      col = { path, type, nullable: false, values: new Array(total).fill(null), nulls: new Array(total).fill(true) };
      cols.set(path, col);
    }
    // Store Date objects as ms since epoch for Timestamp type
    const storedVal = val instanceof Date ? val.getTime() : val;
    col.values[row] = storedVal;
    col.nulls[row] = val === null || val === undefined;
    if (col.nulls[row]) col.nullable = true;
    // Promote type if needed
    if (type !== Type.Null && col.type !== type) {
      col.type = promoteType(col.type, type);
    }
    return;
  }

  // Object - recurse into fields
  const obj = val as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const childPath = path ? `${path}.${key}` : key;
    // Check if we should explore this path (for column projection)
    if (filter && !prefixMatchesFilter(childPath, filter)) continue;
    walk(obj[key], childPath, cols, row, total, filter);
  }
}

/** Type promotion rules */
function promoteType(a: Type, b: Type): Type {
  if (a === Type.Null) return b;
  if (b === Type.Null) return a;
  if (a === b) return a;
  // Int32 + Float64 = Float64
  if ((a === Type.Int32 && b === Type.Float64) || (a === Type.Float64 && b === Type.Int32)) return Type.Float64;
  // Int32 + Int64 = Int64
  if ((a === Type.Int32 && b === Type.Int64) || (a === Type.Int64 && b === Type.Int32)) return Type.Int64;
  // Default to string for incompatible types
  return Type.String;
}

/** Reconstruct JSON documents from columns */
export function unshred(columns: Column[], rowCount?: number): unknown[] {
  if (columns.length === 0) return [];
  const n = rowCount ?? columns[0].values.length;
  const docs: unknown[] = new Array(n);

  for (let i = 0; i < n; i++) {
    docs[i] = {};
  }

  for (const col of columns) {
    for (let i = 0; i < n; i++) {
      if (!col.nulls[i]) {
        setPath(docs[i] as Record<string, unknown>, col.path, col.values[i]);
      }
    }
  }

  return docs;
}

/**
 * Type guard: check if value is an array
 * @param val - Value to check
 * @returns True if value is an array
 */
function isArray(val: unknown): val is unknown[] {
  return Array.isArray(val);
}

/**
 * Type guard: check if value is a plain object (not null, not array)
 * @param val - Value to check
 * @returns True if value is a plain object
 */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Parse path parts including array indices
 * Handles dot-notation (a.b.c) and bracket notation (a[0][1])
 * @param path - Path string to parse
 * @returns Array of path parts (strings for object keys, numbers for array indices)
 */
function parsePath(path: string): (string | number)[] {
  const parts: (string | number)[] = [];
  let current = '';
  let justClosedBracket = false; // Track if we just processed a ']'

  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === '.') {
      // After a bracket, the dot is just a separator, don't push empty string
      if (!justClosedBracket && (current || parts.length === 0)) {
        parts.push(current);
      } else if (current) {
        // If there's accumulated content, push it
        parts.push(current);
      }
      current = '';
      justClosedBracket = false;
    } else if (ch === '[') {
      // Push current part before array index
      if (current) {
        parts.push(current);
      } else if (parts.length === 0) {
        // Path starts with '[', push empty string as root
        parts.push(current);
      }
      current = '';
      // Find closing bracket
      let j = i + 1;
      while (j < path.length && path[j] !== ']') j++;
      const idxStr = path.slice(i + 1, j);
      const idx = parseInt(idxStr, 10);
      // Validate: only push as number if it's a valid non-negative integer
      if (!Number.isNaN(idx) && idx >= 0 && String(idx) === idxStr) {
        parts.push(idx);
      } else {
        // Treat as string key if not a valid array index
        parts.push(idxStr);
      }
      i = j;
      justClosedBracket = true;
    } else {
      current += ch;
      justClosedBracket = false;
    }
  }
  // Push final part
  if (current) {
    parts.push(current);
  } else if (parts.length === 0) {
    // Empty path - push empty string
    parts.push('');
  }
  return parts;
}

/**
 * Ensures a container exists at a given position with the correct type.
 * Creates the container if missing, or overwrites if wrong type.
 *
 * @param container - The parent array or object
 * @param key - The key/index to check
 * @param needArray - True if the next path part expects an array
 * @returns The existing or newly created container
 */
function ensureContainer(
  container: Record<string, unknown> | unknown[],
  key: string | number,
  needArray: boolean
): Record<string, unknown> | unknown[] {
  const existing = isArray(container)
    ? (container as unknown[])[key as number]
    : (container as Record<string, unknown>)[key as string];

  // Create if missing or null/undefined
  if (existing === null || existing === undefined || !(key in container)) {
    const newContainer = needArray ? [] : {};
    if (isArray(container)) {
      (container as unknown[])[key as number] = newContainer;
    } else {
      (container as Record<string, unknown>)[key as string] = newContainer;
    }
    return newContainer;
  }

  // Check if existing value is correct type
  if (needArray && !isArray(existing)) {
    const newContainer: unknown[] = [];
    if (isArray(container)) {
      (container as unknown[])[key as number] = newContainer;
    } else {
      (container as Record<string, unknown>)[key as string] = newContainer;
    }
    return newContainer;
  }

  if (!needArray && !isPlainObject(existing)) {
    const newContainer: Record<string, unknown> = {};
    if (isArray(container)) {
      (container as unknown[])[key as number] = newContainer;
    } else {
      (container as Record<string, unknown>)[key as string] = newContainer;
    }
    return newContainer;
  }

  return existing as Record<string, unknown> | unknown[];
}

/**
 * Set nested path value (supports array indices) with type safety.
 * Safely traverses and constructs nested object/array structures.
 *
 * @param obj - Root object to set value in
 * @param path - Dot-notation path (e.g., "user.profile.name" or "items[0].value")
 * @param value - Value to set at the path
 *
 * @example
 * ```ts
 * const obj = {};
 * setPath(obj, 'user.name', 'Alice');
 * // obj = { user: { name: 'Alice' } }
 *
 * setPath(obj, 'items[0].id', 1);
 * // obj = { user: { name: 'Alice' }, items: [{ id: 1 }] }
 *
 * setPath(obj, '', 'root-empty-key');
 * // obj = { '': 'root-empty-key', ... }
 * ```
 *
 * @remarks
 * - Creates intermediate objects/arrays as needed based on next path part type
 * - Uses type guards to validate current value type before accessing
 * - If current value is not the expected type (object when expecting array or vice versa),
 *   it will be overwritten with the correct container type
 * - Handles edge cases: empty string keys, very deep nesting, sparse arrays
 * - Returns early without side effects if current container type doesn't match expected
 */
function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = parsePath(path);

  // Handle edge case: parsePath always returns at least [''] for empty path
  if (parts.length === 0) {
    return;
  }

  let cur: unknown = obj;

  // Traverse to the parent of the final destination
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = parts[i + 1];
    const nextIsArray = typeof next === 'number';

    if (typeof p === 'number') {
      // Current part is array index - validate cur is an array
      if (!isArray(cur)) {
        // Type mismatch: expected array but got something else
        // This is a defensive check - shouldn't happen in normal unshred operation
        return;
      }
      cur = ensureContainer(cur as unknown[], p, nextIsArray);
    } else {
      // Current part is string key - validate cur is an object
      if (!isPlainObject(cur)) {
        // Type mismatch: expected object but got something else
        // This is a defensive check - shouldn't happen in normal unshred operation
        return;
      }
      cur = ensureContainer(cur as Record<string, unknown>, p, nextIsArray);
    }
  }

  // Set the final value
  const last = parts[parts.length - 1];
  if (typeof last === 'number') {
    if (isArray(cur)) {
      cur[last] = value;
    }
    // Silently skip if cur is not an array (defensive - shouldn't happen)
  } else {
    if (isPlainObject(cur)) {
      cur[last] = value;
    }
    // Silently skip if cur is not an object (defensive - shouldn't happen)
  }
}

/** RLE compress null bitmap - sets nullBitmapCompressed and nullBitmapCompression on column */
function compressNullBitmap(col: Column & { nullBitmapCompressed?: Uint8Array; nullBitmapCompression?: string }): void {
  const nulls = col.nulls;
  if (nulls.length < 20) return; // Don't compress small arrays

  // Count consecutive runs
  let runCount = 1;
  for (let i = 1; i < nulls.length; i++) {
    if (nulls[i] !== nulls[i - 1]) runCount++;
  }

  // Only use RLE if it's beneficial (fewer runs than raw values / 4)
  if (runCount < nulls.length / 4) {
    // RLE encode: [value, count, value, count, ...]
    const runs: number[] = [];
    let currentValue = nulls[0] ? 1 : 0;
    let count = 1;
    for (let i = 1; i < nulls.length; i++) {
      const v = nulls[i] ? 1 : 0;
      if (v === currentValue) {
        count++;
      } else {
        runs.push(currentValue, count);
        currentValue = v;
        count = 1;
      }
    }
    runs.push(currentValue, count);

    // Create compressed bitmap
    const compressed = new Uint8Array(runs.length * 4);
    const view = new DataView(compressed.buffer);
    for (let i = 0; i < runs.length; i += 2) {
      view.setUint16(i * 2, runs[i], true);
      view.setUint16(i * 2 + 2, runs[i + 1], true);
    }

    col.nullBitmapCompressed = compressed;
    col.nullBitmapCompression = 'RLE';
  }
}

/** Extract values at a single path from columns */
export function extractPath(columns: Column[], path: string): unknown[] {
  const col = columns.find(c => c.path === path);
  if (!col) return [];
  return col.values.map((v, i) => col.nulls[i] ? null : v);
}

/** Extract values at multiple paths from columns */
export function extractPaths(columns: Column[], paths: string[]): Record<string, unknown[]> {
  const result: Record<string, unknown[]> = {};
  for (const path of paths) {
    result[path] = extractPath(columns, path);
  }
  return result;
}

/** Coerce value to target type */
export function coerceToType(value: unknown, toType: Type): unknown {
  if (value === null || value === undefined) return null;

  switch (toType) {
    case Type.String:
      return String(value);
    case Type.Int32:
      if (typeof value === 'string') return parseInt(value, 10);
      if (typeof value === 'number') return Math.trunc(value);
      if (typeof value === 'boolean') return value ? 1 : 0;
      return Number(value);
    case Type.Int64:
      if (typeof value === 'string') return BigInt(value);
      if (typeof value === 'number') return BigInt(Math.trunc(value));
      if (typeof value === 'boolean') return BigInt(value ? 1 : 0);
      return BigInt(value as number);
    case Type.Float64:
      if (typeof value === 'string') return parseFloat(value);
      if (typeof value === 'number') return value;
      if (typeof value === 'boolean') return value ? 1.0 : 0.0;
      return Number(value);
    case Type.Bool:
      if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
      if (typeof value === 'number') return value !== 0;
      return Boolean(value);
    default:
      return value;
  }
}

/** Append rows to existing columns */
export function appendRows(columns: Column[], docs: unknown[]): Column[] {
  // Shred new docs
  const newColumns = shred(docs);
  const existingRowCount = columns.length > 0 ? columns[0].values.length : 0;
  const newRowCount = docs.length;

  // Create map for O(1) lookup of new columns
  const newColMap = new Map(newColumns.map(c => [c.path, c]));

  // Merge columns
  const result: Column[] = [];
  const seenPaths = new Set<string>();

  // First, update existing columns
  for (const col of columns) {
    seenPaths.add(col.path);
    const newCol = newColMap.get(col.path);

    if (newCol) {
      // Merge values
      const mergedValues = [...col.values, ...newCol.values];
      const mergedNulls = [...col.nulls, ...newCol.nulls];
      const mergedType = promoteType(col.type, newCol.type);
      result.push({
        path: col.path,
        type: mergedType,
        nullable: col.nullable || newCol.nullable,
        values: mergedValues,
        nulls: mergedNulls,
      });
    } else {
      // No new values for this column - fill with nulls
      const mergedValues = [...col.values, ...new Array(newRowCount).fill(null)];
      const mergedNulls = [...col.nulls, ...new Array(newRowCount).fill(true)];
      result.push({
        path: col.path,
        type: col.type,
        nullable: true,
        values: mergedValues,
        nulls: mergedNulls,
      });
    }
  }

  // Add new columns that didn't exist before
  for (const newCol of newColumns) {
    if (seenPaths.has(newCol.path)) continue;

    // Backfill with nulls
    const mergedValues = [...new Array(existingRowCount).fill(null), ...newCol.values];
    const mergedNulls = [...new Array(existingRowCount).fill(true), ...newCol.nulls];
    result.push({
      path: newCol.path,
      type: newCol.type,
      nullable: true,
      values: mergedValues,
      nulls: mergedNulls,
    });
  }

  return result;
}

/** Build path index for O(1) column lookup */
export function buildPathIndex(columns: Column[]): Map<string, Column> {
  return new Map(columns.map(c => [c.path, c]));
}
