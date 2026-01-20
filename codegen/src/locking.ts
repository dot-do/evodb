/**
 * EvoDB Schema Locking Modes
 * BEADS ISSUE: pocs-r7z9
 *
 * Provides schema validation with four locking modes:
 * - evolve: Add new columns automatically
 * - locked: Reject unknown fields and type mismatches
 * - strict: Reject with detailed error messages
 * - versioned: Accept old versions, track version in doc
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Schema lock mode determines validation behavior
 */
export type SchemaLockMode = 'evolve' | 'locked' | 'strict' | 'versioned';

/**
 * Supported column types (aligned with evodb core types)
 */
export type ColumnType =
  | 'null'
  | 'boolean'
  | 'int32'
  | 'int64'
  | 'float64'
  | 'string'
  | 'binary'
  | 'timestamp'
  | 'date'
  | 'uuid'
  | 'json'
  | { type: 'array'; elementType: ColumnType }
  | { type: 'map'; keyType: ColumnType; valueType: ColumnType }
  | { type: 'struct'; fields: SchemaColumn[] };

/**
 * Schema column definition
 */
export interface SchemaColumn {
  /** Column name/path (dot-notation for nested) */
  name: string;

  /** Column data type */
  type: ColumnType;

  /** Whether column accepts null values */
  nullable: boolean;

  /** Optional default value */
  defaultValue?: unknown;

  /** Optional documentation */
  doc?: string;
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
  /** Lock mode for validation */
  mode: SchemaLockMode;

  /** Current schema version (required for 'versioned' mode) */
  currentSchemaVersion?: number;

  /** Field name for schema version tracking (default: '_schemaVersion') */
  versionField?: string;
}

/**
 * Validation error codes
 */
export type ValidationErrorCode = 'UNKNOWN_FIELD' | 'TYPE_MISMATCH' | 'MISSING_REQUIRED' | 'VERSION_MISMATCH';

/**
 * Validation warning codes
 */
export type ValidationWarningCode = 'SCHEMA_EVOLVED' | 'OLDER_VERSION' | 'VERSION_ADDED';

/**
 * Validation error
 */
export interface ValidationError {
  /** Field path (dot notation for nested) */
  path: string;

  /** Error code */
  code: ValidationErrorCode;

  /** Expected type (for TYPE_MISMATCH) */
  expected?: string;

  /** Received type (for TYPE_MISMATCH) */
  received?: string;

  /** Human-readable error message */
  message: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  /** Field path */
  path: string;

  /** Warning code */
  code: ValidationWarningCode;

  /** Human-readable warning message */
  message: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the document is valid */
  valid: boolean;

  /** Validation errors (empty if valid) */
  errors: ValidationError[];

  /** Validation warnings (may have warnings even if valid) */
  warnings: ValidationWarning[];

  /** Schema updates for new fields (only in 'evolve' mode) */
  schemaUpdates?: SchemaColumn[];

  /** Document schema version (only in 'versioned' mode) */
  documentVersion?: number;

  /** Current schema version (only in 'versioned' mode) */
  currentSchemaVersion?: number;
}

// =============================================================================
// Type Inference
// =============================================================================

/**
 * Infer column type from a JavaScript value
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
  if (value instanceof Date) return 'timestamp';
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array', elementType: 'json' };
    const elementTypes = value.map(inferType);
    // For simplicity, use first element type or json if mixed
    return { type: 'array', elementType: elementTypes[0] };
  }
  if (typeof value === 'object') {
    return 'json';
  }
  return 'json';
}

/**
 * Get human-readable type name
 */
function getTypeName(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'Date';
  return typeof value;
}

/**
 * Format column type for display
 */
function formatColumnType(type: ColumnType): string {
  if (typeof type === 'string') return type;
  if (type.type === 'array') return `array<${formatColumnType(type.elementType)}>`;
  if (type.type === 'map') {
    return `map<${formatColumnType(type.keyType)}, ${formatColumnType(type.valueType)}>`;
  }
  if (type.type === 'struct') {
    return `struct<${type.fields.map(f => `${f.name}: ${formatColumnType(f.type)}`).join(', ')}>`;
  }
  return 'unknown';
}

// =============================================================================
// Type Validation
// =============================================================================

/**
 * Check if a value matches the expected column type
 */
function isValidType(value: unknown, type: ColumnType): boolean {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return false; // Caller should check nullable separately
  }

  // Handle primitive types
  if (typeof type === 'string') {
    switch (type) {
      case 'null':
        return value === null;

      case 'boolean':
        return typeof value === 'boolean';

      case 'int32':
        return typeof value === 'number' && Number.isInteger(value) &&
               value >= -2147483648 && value <= 2147483647;

      case 'int64':
        return typeof value === 'number' && Number.isInteger(value);

      case 'float64':
        return typeof value === 'number';

      case 'string':
        return typeof value === 'string';

      case 'binary':
        return value instanceof Uint8Array || value instanceof ArrayBuffer;

      case 'timestamp':
        if (value instanceof Date) return true;
        if (typeof value === 'number') return true; // epoch ms
        if (typeof value === 'string') {
          return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
        }
        return false;

      case 'date':
        if (typeof value === 'string') {
          return /^\d{4}-\d{2}-\d{2}$/.test(value);
        }
        return value instanceof Date;

      case 'uuid':
        return typeof value === 'string' &&
               /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

      case 'json':
        return true; // JSON accepts any value

      default:
        return false;
    }
  }

  // Handle complex types
  if (type.type === 'array') {
    if (!Array.isArray(value)) return false;
    return value.every(v => v === null || isValidType(v, type.elementType));
  }

  if (type.type === 'map') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.every(([k, v]) =>
      isValidType(k, type.keyType) && (v === null || isValidType(v, type.valueType))
    );
  }

  if (type.type === 'struct') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    // Struct validation would be recursive - for now accept objects
    return true;
  }

  return false;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate a single document against a schema
 */
export function validateDocument(
  doc: Record<string, unknown>,
  schema: SchemaColumn[],
  config: ValidationConfig
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const schemaUpdates: SchemaColumn[] = [];

  const schemaMap = new Map(schema.map(col => [col.name, col]));
  const docFields = new Set(Object.keys(doc));
  const versionField = config.versionField || '_schemaVersion';

  // Handle versioned mode
  let documentVersion: number | undefined;
  let currentSchemaVersion: number | undefined;

  if (config.mode === 'versioned') {
    currentSchemaVersion = config.currentSchemaVersion ?? 1;
    documentVersion = doc[versionField] as number | undefined;

    if (documentVersion !== undefined) {
      if (documentVersion > currentSchemaVersion) {
        errors.push({
          path: versionField,
          code: 'VERSION_MISMATCH',
          expected: `<= ${currentSchemaVersion}`,
          received: String(documentVersion),
          message: `Document schema version ${documentVersion} is newer than current schema version ${currentSchemaVersion}`,
        });
      } else if (documentVersion < currentSchemaVersion) {
        warnings.push({
          path: versionField,
          code: 'OLDER_VERSION',
          message: `Document uses older schema version ${documentVersion}. You should migrate to version ${currentSchemaVersion}.`,
        });
      }
    } else {
      warnings.push({
        path: versionField,
        code: 'VERSION_ADDED',
        message: `Document missing schema version. Will be assigned version ${currentSchemaVersion}.`,
      });
    }
  }

  // Check for unknown fields
  for (const field of docFields) {
    // Skip version field in versioned mode
    if (config.mode === 'versioned' && field === versionField) {
      continue;
    }

    if (!schemaMap.has(field)) {
      if (config.mode === 'evolve') {
        // In evolve mode, infer type and add to schema updates
        const value = doc[field];
        const inferredType = inferType(value);
        schemaUpdates.push({
          name: field,
          type: inferredType,
          nullable: true, // New fields are nullable by default
        });
        warnings.push({
          path: field,
          code: 'SCHEMA_EVOLVED',
          message: `New field '${field}' detected with inferred type '${formatColumnType(inferredType)}'. Schema will be updated.`,
        });
      } else {
        // In locked/strict modes, reject unknown fields
        const message = config.mode === 'strict'
          ? `Field '${field}' is not defined in the schema. Available fields: ${schema.map(c => c.name).join(', ')}`
          : `Unknown field '${field}'`;

        errors.push({
          path: field,
          code: 'UNKNOWN_FIELD',
          message,
        });
      }
    }
  }

  // Check for required fields and type mismatches
  for (const col of schema) {
    // Skip version field check in versioned mode
    if (config.mode === 'versioned' && col.name === versionField) {
      continue;
    }

    const value = doc[col.name];
    const fieldExists = col.name in doc;

    // Check for missing required fields
    if (!fieldExists && !col.nullable && col.defaultValue === undefined) {
      const message = config.mode === 'strict'
        ? `Field '${col.name}' of type '${formatColumnType(col.type)}' is required but missing from document`
        : `Missing required field '${col.name}'`;

      errors.push({
        path: col.name,
        code: 'MISSING_REQUIRED',
        expected: formatColumnType(col.type),
        message,
      });
      continue;
    }

    // Skip further validation if field doesn't exist
    if (!fieldExists) continue;

    // Check for null on non-nullable fields
    if ((value === null || value === undefined) && !col.nullable) {
      const message = config.mode === 'strict'
        ? `Field '${col.name}' cannot be null. Expected type '${formatColumnType(col.type)}' but received '${getTypeName(value)}'`
        : `Field '${col.name}' cannot be null`;

      errors.push({
        path: col.name,
        code: 'TYPE_MISMATCH',
        expected: formatColumnType(col.type),
        received: getTypeName(value),
        message,
      });
      continue;
    }

    // Skip type check for null values on nullable fields
    if (value === null || value === undefined) continue;

    // Validate type
    if (!isValidType(value, col.type)) {
      const message = config.mode === 'strict'
        ? `Field '${col.name}' has invalid type. Expected '${formatColumnType(col.type)}' but received '${getTypeName(value)}'`
        : `Type mismatch for '${col.name}'`;

      errors.push({
        path: col.name,
        code: 'TYPE_MISMATCH',
        expected: formatColumnType(col.type),
        received: getTypeName(value),
        message,
      });
    }
  }

  const result: ValidationResult = {
    valid: errors.length === 0,
    errors,
    warnings,
  };

  // Add schema updates for evolve mode
  if (config.mode === 'evolve' && schemaUpdates.length > 0) {
    result.schemaUpdates = schemaUpdates;
  }

  // Add version info for versioned mode
  if (config.mode === 'versioned') {
    result.documentVersion = documentVersion;
    result.currentSchemaVersion = currentSchemaVersion;
  }

  return result;
}

/**
 * Validate multiple documents against a schema (batch)
 */
export function validateDocuments(
  docs: Record<string, unknown>[],
  schema: SchemaColumn[],
  config: ValidationConfig
): ValidationResult[] {
  return docs.map(doc => validateDocument(doc, schema, config));
}
