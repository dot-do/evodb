/**
 * Schema evolution tracking and validation
 * Supports forward-compatible schema changes
 */

import type {
  Schema,
  SchemaColumn,
  SchemaRef,
  ColumnType,
} from './types.js';
import { schemaPath } from './types.js';

// =============================================================================
// Exhaustiveness Check Helper
// =============================================================================

/**
 * Assert that a value is of type `never` at compile time.
 * Used in switch statements to ensure all cases of a discriminated union are handled.
 */
function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}

// =============================================================================
// Schema Creation
// =============================================================================

/**
 * Create a new schema with auto-generated ID
 */
export function createSchema(
  columns: SchemaColumn[],
  schemaId = 1,
  version = 1
): Schema {
  return {
    schemaId,
    version,
    columns: normalizeColumns(columns),
    createdAt: Date.now(),
  };
}

/**
 * Create a schema reference for manifest
 */
export function createSchemaRef(schemaId: number): SchemaRef {
  return {
    schemaId,
    path: schemaPath(schemaId),
  };
}

/**
 * Normalize columns (ensure consistent ordering and formatting)
 */
function normalizeColumns(columns: SchemaColumn[]): SchemaColumn[] {
  return columns.map(col => ({
    name: col.name,
    type: col.type,
    nullable: col.nullable,
    ...(col.defaultValue !== undefined && { defaultValue: col.defaultValue }),
    ...(col.doc && { doc: col.doc }),
  }));
}

// =============================================================================
// Schema Evolution
// =============================================================================

/**
 * Schema evolution change types
 */
export type SchemaChange =
  | { type: 'add_column'; column: SchemaColumn }
  | { type: 'drop_column'; columnName: string }
  | { type: 'rename_column'; oldName: string; newName: string }
  | { type: 'update_type'; columnName: string; newType: ColumnType }
  | { type: 'make_nullable'; columnName: string }
  | { type: 'make_required'; columnName: string; defaultValue: unknown }
  | { type: 'update_doc'; columnName: string; doc: string };

/**
 * Apply schema changes to create a new schema version
 */
export function evolveSchema(
  currentSchema: Schema,
  changes: SchemaChange[]
): Schema {
  let columns = [...currentSchema.columns];

  for (const change of changes) {
    columns = applyChange(columns, change);
  }

  return {
    schemaId: currentSchema.schemaId + 1,
    version: currentSchema.version + 1,
    columns: normalizeColumns(columns),
    createdAt: Date.now(),
  };
}

/**
 * Apply a single change to columns
 */
function applyChange(columns: SchemaColumn[], change: SchemaChange): SchemaColumn[] {
  switch (change.type) {
    case 'add_column':
      if (columns.some(c => c.name === change.column.name)) {
        throw new SchemaError(`Column "${change.column.name}" already exists`);
      }
      return [...columns, change.column];

    case 'drop_column':
      if (!columns.some(c => c.name === change.columnName)) {
        throw new SchemaError(`Column "${change.columnName}" does not exist`);
      }
      return columns.filter(c => c.name !== change.columnName);

    case 'rename_column': {
      const idx = columns.findIndex(c => c.name === change.oldName);
      if (idx === -1) {
        throw new SchemaError(`Column "${change.oldName}" does not exist`);
      }
      if (columns.some(c => c.name === change.newName)) {
        throw new SchemaError(`Column "${change.newName}" already exists`);
      }
      const updated = [...columns];
      updated[idx] = { ...updated[idx], name: change.newName };
      return updated;
    }

    case 'update_type': {
      const idx = columns.findIndex(c => c.name === change.columnName);
      if (idx === -1) {
        throw new SchemaError(`Column "${change.columnName}" does not exist`);
      }
      const updated = [...columns];
      updated[idx] = { ...updated[idx], type: change.newType };
      return updated;
    }

    case 'make_nullable': {
      const idx = columns.findIndex(c => c.name === change.columnName);
      if (idx === -1) {
        throw new SchemaError(`Column "${change.columnName}" does not exist`);
      }
      const updated = [...columns];
      updated[idx] = { ...updated[idx], nullable: true };
      return updated;
    }

    case 'make_required': {
      const idx = columns.findIndex(c => c.name === change.columnName);
      if (idx === -1) {
        throw new SchemaError(`Column "${change.columnName}" does not exist`);
      }
      const updated = [...columns];
      updated[idx] = {
        ...updated[idx],
        nullable: false,
        defaultValue: change.defaultValue,
      };
      return updated;
    }

    case 'update_doc': {
      const idx = columns.findIndex(c => c.name === change.columnName);
      if (idx === -1) {
        throw new SchemaError(`Column "${change.columnName}" does not exist`);
      }
      const updated = [...columns];
      updated[idx] = { ...updated[idx], doc: change.doc };
      return updated;
    }

    default:
      return assertNever(change, `Unhandled schema change type: ${(change as SchemaChange).type}`);
  }
}

// =============================================================================
// Schema Compatibility
// =============================================================================

/**
 * Compatibility mode for schema evolution
 */
export type CompatibilityMode = 'full' | 'backward' | 'forward' | 'none';

/**
 * Check if a new schema is compatible with an old schema
 */
export function isCompatible(
  oldSchema: Schema,
  newSchema: Schema,
  mode: CompatibilityMode = 'backward'
): { compatible: boolean; errors: string[] } {
  if (mode === 'none') {
    return { compatible: true, errors: [] };
  }

  const errors: string[] = [];

  const oldColumns = new Map(oldSchema.columns.map(c => [c.name, c]));
  const newColumns = new Map(newSchema.columns.map(c => [c.name, c]));

  // Check backward compatibility (readers using new schema can read old data)
  if (mode === 'backward' || mode === 'full') {
    // New required columns without defaults break backward compatibility
    for (const [name, col] of newColumns) {
      if (!oldColumns.has(name) && !col.nullable && col.defaultValue === undefined) {
        errors.push(
          `New required column "${name}" without default breaks backward compatibility`
        );
      }
    }
  }

  // Check forward compatibility (readers using old schema can read new data)
  if (mode === 'forward' || mode === 'full') {
    // Dropped columns break forward compatibility
    for (const [name] of oldColumns) {
      if (!newColumns.has(name)) {
        errors.push(`Dropped column "${name}" breaks forward compatibility`);
      }
    }
  }

  // Check type compatibility for common columns
  for (const [name, oldCol] of oldColumns) {
    const newCol = newColumns.get(name);
    if (newCol) {
      if (!isTypeCompatible(oldCol.type, newCol.type)) {
        errors.push(
          `Type change for "${name}" from ${formatType(oldCol.type)} to ${formatType(newCol.type)} is incompatible`
        );
      }

      // Making a nullable column required can break backward compatibility
      if (mode === 'backward' || mode === 'full') {
        if (oldCol.nullable && !newCol.nullable && newCol.defaultValue === undefined) {
          errors.push(
            `Making "${name}" required without default breaks backward compatibility`
          );
        }
      }
    }
  }

  return { compatible: errors.length === 0, errors };
}

/**
 * Check if type change is compatible (widening is ok)
 */
function isTypeCompatible(oldType: ColumnType, newType: ColumnType): boolean {
  // Same type is always compatible
  if (JSON.stringify(oldType) === JSON.stringify(newType)) {
    return true;
  }

  // Type widening rules
  const wideningRules: Record<string, string[]> = {
    'int32': ['int64', 'float64'],
    'int64': ['float64'],
    'float64': [],
    'string': [],
    'boolean': [],
  };

  if (typeof oldType === 'string' && typeof newType === 'string') {
    return wideningRules[oldType]?.includes(newType) ?? false;
  }

  // Complex types must match exactly
  return false;
}

/**
 * Format column type for display
 */
function formatType(type: ColumnType): string {
  if (typeof type === 'string') return type;
  if (type.type === 'array') return `array<${formatType(type.elementType)}>`;
  if (type.type === 'map') {
    return `map<${formatType(type.keyType)}, ${formatType(type.valueType)}>`;
  }
  if (type.type === 'struct') {
    return `struct<${type.fields.map(f => `${f.name}: ${formatType(f.type)}`).join(', ')}>`;
  }
  return 'unknown';
}

// =============================================================================
// Schema Inference
// =============================================================================

/**
 * Infer schema from JSON objects
 */
export function inferSchema(
  samples: Record<string, unknown>[],
  options: { nullable?: boolean; maxSamples?: number } = {}
): Schema {
  const { nullable = true, maxSamples = 100 } = options;

  const sampledData = samples.slice(0, maxSamples);
  const columnMap = new Map<string, { types: Set<ColumnType>; hasNull: boolean }>();

  // Collect type information from samples
  for (const obj of sampledData) {
    collectTypes(obj, '', columnMap);
  }

  // Build columns from collected types
  const columns: SchemaColumn[] = [];

  for (const [name, info] of columnMap) {
    const type = mergeTypes([...info.types]);
    columns.push({
      name,
      type,
      nullable: nullable || info.hasNull,
    });
  }

  // Sort columns alphabetically for consistency
  columns.sort((a, b) => a.name.localeCompare(b.name));

  return createSchema(columns);
}

/**
 * Recursively collect types from an object
 */
function collectTypes(
  value: unknown,
  path: string,
  columnMap: Map<string, { types: Set<ColumnType>; hasNull: boolean }>
): void {
  const key = path || '__root__';

  if (value === null || value === undefined) {
    const existing = columnMap.get(key) ?? { types: new Set(), hasNull: false };
    existing.hasNull = true;
    columnMap.set(key, existing);
    return;
  }

  const type = inferType(value);
  const existing = columnMap.get(key) ?? { types: new Set(), hasNull: false };
  existing.types.add(type);
  columnMap.set(key, existing);

  // Recurse into objects
  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${k}` : k;
      collectTypes(v, childPath, columnMap);
    }
  }
}

/**
 * Infer type from a single value
 */
function inferType(value: unknown): ColumnType {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'int64' : 'float64';
  }
  if (typeof value === 'string') {
    // Check for special string types
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'timestamp';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return 'uuid';
    }
    return 'string';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', elementType: 'json' };
    const elementTypes = value.map(inferType);
    const mergedType = mergeTypes(elementTypes);
    return { type: 'array', elementType: mergedType };
  }
  if (typeof value === 'object') {
    return 'json';
  }
  return 'json';
}

/**
 * Merge multiple types into a common type
 */
function mergeTypes(types: ColumnType[]): ColumnType {
  if (types.length === 0) return 'null';
  if (types.length === 1) return types[0];

  const typeSet = new Set(types.map(t => (typeof t === 'string' ? t : JSON.stringify(t))));

  // If all same type, return it
  if (typeSet.size === 1) return types[0];

  // Numeric type widening
  const hasInt32 = typeSet.has('int32');
  const hasInt64 = typeSet.has('int64');
  const hasFloat64 = typeSet.has('float64');

  if ((hasInt32 || hasInt64) && hasFloat64) return 'float64';
  if (hasInt32 && hasInt64) return 'int64';

  // Fall back to JSON for mixed types
  return 'json';
}

// =============================================================================
// Schema Serialization
// =============================================================================

/**
 * Serialize schema to JSON
 */
export function serializeSchema(schema: Schema): string {
  return JSON.stringify(schema, null, 2);
}

/**
 * Deserialize schema from JSON
 */
export function deserializeSchema(json: string): Schema {
  return JSON.parse(json) as Schema;
}

// =============================================================================
// Error Types
// =============================================================================

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}
