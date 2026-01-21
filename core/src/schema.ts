// Schema inference and validation (~50 lines)
// Serialization is handled by the manifest layer

import { type Column, type Schema, type SchemaColumn, Type } from './types.js';

/** Create schema from columns */
export function inferSchema(columns: Column[], id = 1, version = 1): Schema {
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

/** Check if schema B is compatible with schema A (can read A's data) */
export function isSchemaCompatible(older: Schema, newer: Schema): boolean {
  const olderPaths = new Map(older.columns.map(c => [c.path, c]));

  for (const col of newer.columns) {
    const oldCol = olderPaths.get(col.path);
    if (!oldCol) {
      // New column must be nullable or have default
      if (!col.nullable && col.defaultValue === undefined) return false;
      continue;
    }
    // Type must be compatible (same or promotable)
    if (!canPromote(oldCol.type, col.type)) return false;
  }

  return true;
}

/** @deprecated Use isSchemaCompatible instead */
export const isCompatible = isSchemaCompatible;

/** Check if type A can be promoted to type B */
function canPromote(from: Type, to: Type): boolean {
  if (from === to) return true;
  // Int32 -> Int64 or Float64
  if (from === Type.Int32 && (to === Type.Int64 || to === Type.Float64)) return true;
  // Int64 -> Float64 (with precision loss warning)
  if (from === Type.Int64 && to === Type.Float64) return true;
  // Any -> String
  if (to === Type.String) return true;
  return false;
}
