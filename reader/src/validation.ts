/**
 * @evodb/reader - Runtime JSON Validation
 *
 * Provides runtime validation for columnar block data parsed from JSON.
 * This module is critical for ensuring data integrity and providing
 * descriptive error messages when block data is malformed.
 *
 * Performance considerations:
 * - Validation happens in the hot path (every block read)
 * - Use `isValidBlockData` for fast boolean checks without error details
 * - Use `validateBlockData` when you need detailed error information
 * - TextDecoder is reused to avoid allocation overhead
 */

import type { ColumnType } from './types.js';

// =============================================================================
// Validation Error Details Types
// =============================================================================

/**
 * Base interface for all validation error details.
 */
export interface BaseValidationErrorDetails {
  /** The actual type received when validation failed */
  receivedType?: string;
}

/**
 * Error details for block data validation failures.
 */
export interface BlockValidationErrorDetails extends BaseValidationErrorDetails {
  /** Column name that caused the error */
  column?: string;
  /** Expected array length for column mismatch errors */
  expectedLength?: number;
  /** Actual array length for column mismatch errors */
  actualLength?: number;
  /** First column name used for comparison */
  firstColumn?: string;
  /** JSON parse error message */
  parseError?: string;
}

/**
 * Error details for manifest validation failures.
 */
export interface ManifestValidationErrorDetails extends BaseValidationErrorDetails {
  /** Field name that failed validation */
  field?: string;
  /** Table name context */
  table?: string;
  /** Column name context */
  column?: string;
  /** Column index in schema array */
  columnIndex?: number;
  /** Expected type for the field */
  expectedType?: string;
  /** Invalid column type value */
  invalidType?: string;
  /** List of valid column types */
  validTypes?: string[];
}

/**
 * Type guard for BlockValidationErrorDetails.
 */
export function isBlockValidationErrorDetails(
  value: unknown
): value is BlockValidationErrorDetails {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  // Check that all properties are of expected types
  if (obj.receivedType !== undefined && typeof obj.receivedType !== 'string') return false;
  if (obj.column !== undefined && typeof obj.column !== 'string') return false;
  if (obj.expectedLength !== undefined && typeof obj.expectedLength !== 'number') return false;
  if (obj.actualLength !== undefined && typeof obj.actualLength !== 'number') return false;
  if (obj.firstColumn !== undefined && typeof obj.firstColumn !== 'string') return false;
  if (obj.parseError !== undefined && typeof obj.parseError !== 'string') return false;
  return true;
}

/**
 * Type guard for ManifestValidationErrorDetails.
 */
export function isManifestValidationErrorDetails(
  value: unknown
): value is ManifestValidationErrorDetails {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  // Check that all properties are of expected types
  if (obj.receivedType !== undefined && typeof obj.receivedType !== 'string') return false;
  if (obj.field !== undefined && typeof obj.field !== 'string') return false;
  if (obj.table !== undefined && typeof obj.table !== 'string') return false;
  if (obj.column !== undefined && typeof obj.column !== 'string') return false;
  if (obj.columnIndex !== undefined && typeof obj.columnIndex !== 'number') return false;
  if (obj.expectedType !== undefined && typeof obj.expectedType !== 'string') return false;
  if (obj.invalidType !== undefined && typeof obj.invalidType !== 'string') return false;
  if (obj.validTypes !== undefined) {
    if (!Array.isArray(obj.validTypes)) return false;
    if (!obj.validTypes.every(v => typeof v === 'string')) return false;
  }
  return true;
}

/**
 * Error codes for block data validation failures
 * Use these for programmatic error handling
 */
export enum BlockDataValidationErrorCode {
  /** JSON parsing failed (syntax error) */
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  /** Block data is null */
  NULL_DATA = 'NULL_DATA',
  /** Block data is a primitive instead of object */
  PRIMITIVE_DATA = 'PRIMITIVE_DATA',
  /** Block data is an array instead of object */
  ARRAY_DATA = 'ARRAY_DATA',
  /** A column value is not an array */
  COLUMN_NOT_ARRAY = 'COLUMN_NOT_ARRAY',
  /** Column arrays have inconsistent lengths */
  COLUMN_LENGTH_MISMATCH = 'COLUMN_LENGTH_MISMATCH',
}

/**
 * Error thrown when block data validation fails.
 *
 * Provides detailed information about the validation failure including:
 * - Human-readable error message
 * - Block path for identifying the problematic file
 * - Error code for programmatic handling
 * - Additional details for debugging
 *
 * @example
 * ```typescript
 * try {
 *   validateBlockData(data, 'blocks/001.json');
 * } catch (error) {
 *   if (error instanceof BlockDataValidationError) {
 *     console.error(`Validation failed: ${error.code}`);
 *     console.error(`Block: ${error.blockPath}`);
 *     console.error(`Details: ${JSON.stringify(error.details)}`);
 *   }
 * }
 * ```
 */
export class BlockDataValidationError extends Error {
  public readonly code: BlockDataValidationErrorCode;

  constructor(
    message: string,
    public readonly blockPath: string,
    code: BlockDataValidationErrorCode,
    public readonly details?: BlockValidationErrorDetails
  ) {
    super(message);
    this.name = 'BlockDataValidationError';
    this.code = code;
  }
}

/**
 * Columnar block data type.
 *
 * Block data is stored in columnar format where each property represents
 * a column name and its value is an array of values for that column.
 * All column arrays must have the same length (the row count).
 *
 * @example
 * ```typescript
 * const block: BlockData = {
 *   id: [1, 2, 3],
 *   name: ['Alice', 'Bob', 'Charlie'],
 *   active: [true, false, true],
 * };
 * ```
 */
export type BlockData = Record<string, unknown[]>;

/**
 * Result of successful block data validation
 */
export interface BlockDataValidationResult {
  /** Always true for successful validation */
  valid: true;
  /** The validated block data */
  data: BlockData;
  /** Number of rows in the block (length of column arrays) */
  rowCount: number;
}

// Reuse TextDecoder for performance (avoid allocation per parse)
const sharedDecoder = new TextDecoder();

/**
 * Validates that a value is a valid BlockData structure.
 *
 * BlockData requirements:
 * - Must be a non-null object (not array, not primitive)
 * - Each property value must be an array
 * - All arrays must have the same length (consistent row count)
 *
 * @param data - The parsed JSON data to validate
 * @param blockPath - Path to the block file (for error messages)
 * @returns Validated BlockData with row count
 * @throws BlockDataValidationError if validation fails
 *
 * @example
 * ```typescript
 * const data = JSON.parse(jsonString);
 * const { data: blockData, rowCount } = validateBlockData(data, 'blocks/001.json');
 * console.log(`Block has ${rowCount} rows`);
 * ```
 */
export function validateBlockData(data: unknown, blockPath: string): BlockDataValidationResult {
  // Fast path: null check
  if (data === null) {
    throw new BlockDataValidationError(
      `Invalid block data in '${blockPath}': expected object but got null`,
      blockPath,
      BlockDataValidationErrorCode.NULL_DATA,
      { receivedType: 'null' }
    );
  }

  // Fast path: type check for primitives
  if (typeof data !== 'object') {
    throw new BlockDataValidationError(
      `Invalid block data in '${blockPath}': expected object but got ${typeof data}`,
      blockPath,
      BlockDataValidationErrorCode.PRIMITIVE_DATA,
      { receivedType: typeof data }
    );
  }

  // Fast path: array check (arrays are objects in JS)
  if (Array.isArray(data)) {
    throw new BlockDataValidationError(
      `Invalid block data in '${blockPath}': expected object with column arrays but got array`,
      blockPath,
      BlockDataValidationErrorCode.ARRAY_DATA,
      { receivedType: 'array' }
    );
  }

  const blockData = data as Record<string, unknown>;
  const columns = Object.keys(blockData);

  // Empty object is valid (empty block with no columns)
  if (columns.length === 0) {
    return { valid: true, data: blockData as BlockData, rowCount: 0 };
  }

  // Validate each column value is an array with consistent length
  let expectedRowCount: number | null = null;
  const firstColumnName = columns[0];

  for (const columnName of columns) {
    const columnValue = blockData[columnName];

    // Check if column value is an array
    if (!Array.isArray(columnValue)) {
      const valueType = columnValue === null ? 'null' : typeof columnValue;
      throw new BlockDataValidationError(
        `Invalid column '${columnName}' in block '${blockPath}': expected array but got ${valueType}`,
        blockPath,
        BlockDataValidationErrorCode.COLUMN_NOT_ARRAY,
        { column: columnName, receivedType: valueType }
      );
    }

    // Check row count consistency
    const rowCount = columnValue.length;
    if (expectedRowCount === null) {
      expectedRowCount = rowCount;
    } else if (rowCount !== expectedRowCount) {
      throw new BlockDataValidationError(
        `Column length mismatch in block '${blockPath}': column '${columnName}' has ${rowCount} rows but '${firstColumnName}' has ${expectedRowCount} rows`,
        blockPath,
        BlockDataValidationErrorCode.COLUMN_LENGTH_MISMATCH,
        {
          column: columnName,
          expectedLength: expectedRowCount,
          actualLength: rowCount,
          firstColumn: firstColumnName
        }
      );
    }
  }

  return {
    valid: true,
    data: blockData as BlockData,
    rowCount: expectedRowCount ?? 0,
  };
}

/**
 * Parses JSON from a buffer and validates as BlockData in a single operation.
 *
 * This is the primary function to use when reading block data from R2/cache.
 * It provides descriptive error messages for both JSON syntax errors and
 * structure validation errors.
 *
 * @param buffer - Raw bytes to parse (from R2 or cache)
 * @param blockPath - Path to the block file (for error messages)
 * @returns Validated BlockData with row count
 * @throws BlockDataValidationError if parsing or validation fails
 *
 * @example
 * ```typescript
 * const buffer = await r2Object.arrayBuffer();
 * const { data, rowCount } = parseAndValidateBlockData(buffer, 'blocks/001.json');
 * ```
 */
export function parseAndValidateBlockData(
  buffer: ArrayBuffer,
  blockPath: string
): BlockDataValidationResult {
  const text = sharedDecoder.decode(buffer);

  // Parse JSON with descriptive error wrapping
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const jsonError = error as SyntaxError;
    throw new BlockDataValidationError(
      `Invalid JSON in block '${blockPath}': ${jsonError.message}`,
      blockPath,
      BlockDataValidationErrorCode.JSON_PARSE_ERROR,
      { parseError: jsonError.message }
    );
  }

  // Validate structure
  return validateBlockData(parsed, blockPath);
}

/**
 * Type guard to check if a value is valid BlockData.
 *
 * This is a fast check that returns a boolean without throwing errors
 * or providing detailed validation messages. Use this when you only
 * need to know if data is valid, not why it's invalid.
 *
 * For detailed error messages, use `validateBlockData` instead.
 *
 * @param data - The value to check
 * @returns True if data is valid BlockData
 *
 * @example
 * ```typescript
 * if (isValidBlockData(data)) {
 *   // TypeScript knows data is BlockData here
 *   const columns = Object.keys(data);
 * }
 * ```
 */
export function isValidBlockData(data: unknown): data is BlockData {
  // Fast null/type checks
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const obj = data as Record<string, unknown>;
  const columns = Object.keys(obj);

  // Empty object is valid
  if (columns.length === 0) {
    return true;
  }

  // Check all columns are arrays with consistent length
  let expectedLength: number | null = null;

  for (const col of columns) {
    const value = obj[col];
    if (!Array.isArray(value)) {
      return false;
    }
    if (expectedLength === null) {
      expectedLength = value.length;
    } else if (value.length !== expectedLength) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// Manifest Validation
// =============================================================================

/**
 * Error codes for manifest validation failures
 */
export enum ManifestValidationErrorCode {
  /** JSON parsing failed (syntax error) */
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  /** Manifest is null */
  NULL_MANIFEST = 'NULL_MANIFEST',
  /** Manifest is a primitive instead of object */
  PRIMITIVE_MANIFEST = 'PRIMITIVE_MANIFEST',
  /** Manifest is an array instead of object */
  ARRAY_MANIFEST = 'ARRAY_MANIFEST',
  /** Missing required field */
  MISSING_FIELD = 'MISSING_FIELD',
  /** Field has wrong type */
  WRONG_TYPE = 'WRONG_TYPE',
  /** Invalid column type */
  INVALID_COLUMN_TYPE = 'INVALID_COLUMN_TYPE',
}

/**
 * Valid column types
 */
const VALID_COLUMN_TYPES = new Set([
  'null',
  'boolean',
  'int32',
  'int64',
  'float64',
  'string',
  'binary',
  'timestamp',
  'date',
  'list',
  'object',
]);

/**
 * Error thrown when manifest validation fails.
 */
export class ManifestValidationError extends Error {
  public readonly code: ManifestValidationErrorCode;

  constructor(
    message: string,
    code: ManifestValidationErrorCode,
    public readonly details?: ManifestValidationErrorDetails
  ) {
    super(message);
    this.name = 'ManifestValidationError';
    this.code = code;
  }
}

/**
 * Validated column schema type
 */
export interface ValidatedColumnSchema {
  name: string;
  type: ColumnType;
  nullable: boolean;
  metadata?: Record<string, string>;
}

/**
 * Validated table metadata type
 */
export interface ValidatedTableMetadata {
  name: string;
  schema: ValidatedColumnSchema[];
  blockPaths: string[];
  rowCount: number;
  lastUpdated: number;
}

/**
 * Validated manifest type
 */
export interface ValidatedManifest {
  version: number;
  tables: Record<string, ValidatedTableMetadata>;
}

/**
 * Validates that a value is a valid Manifest structure.
 *
 * @param data - The parsed JSON data to validate
 * @returns Validated Manifest
 * @throws ManifestValidationError if validation fails
 */
export function validateManifest(data: unknown): ValidatedManifest {
  // Null check
  if (data === null) {
    throw new ManifestValidationError(
      'Invalid manifest: expected object but got null',
      ManifestValidationErrorCode.NULL_MANIFEST,
      { receivedType: 'null' }
    );
  }

  // Type check for primitives
  if (typeof data !== 'object') {
    throw new ManifestValidationError(
      `Invalid manifest: expected object but got ${typeof data}`,
      ManifestValidationErrorCode.PRIMITIVE_MANIFEST,
      { receivedType: typeof data }
    );
  }

  // Array check
  if (Array.isArray(data)) {
    throw new ManifestValidationError(
      'Invalid manifest: expected object but got array',
      ManifestValidationErrorCode.ARRAY_MANIFEST,
      { receivedType: 'array' }
    );
  }

  const manifest = data as Record<string, unknown>;

  // Validate version field
  if (!('version' in manifest)) {
    throw new ManifestValidationError(
      'Invalid manifest: missing required field "version"',
      ManifestValidationErrorCode.MISSING_FIELD,
      { field: 'version' }
    );
  }

  if (typeof manifest.version !== 'number') {
    throw new ManifestValidationError(
      `Invalid manifest: "version" must be a number but got ${typeof manifest.version}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { field: 'version', expectedType: 'number', receivedType: typeof manifest.version }
    );
  }

  // Validate tables field
  if (!('tables' in manifest)) {
    throw new ManifestValidationError(
      'Invalid manifest: missing required field "tables"',
      ManifestValidationErrorCode.MISSING_FIELD,
      { field: 'tables' }
    );
  }

  if (manifest.tables === null || typeof manifest.tables !== 'object' || Array.isArray(manifest.tables)) {
    const actualType = manifest.tables === null ? 'null' : Array.isArray(manifest.tables) ? 'array' : typeof manifest.tables;
    throw new ManifestValidationError(
      `Invalid manifest: "tables" must be an object but got ${actualType}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { field: 'tables', expectedType: 'object', receivedType: actualType }
    );
  }

  const tables = manifest.tables as Record<string, unknown>;
  const validatedTables: Record<string, ValidatedTableMetadata> = {};

  // Validate each table (lazy validation - only validates structure, not content)
  for (const [tableName, tableData] of Object.entries(tables)) {
    validatedTables[tableName] = validateTableMetadataStructure(tableData, tableName);
  }

  return {
    version: manifest.version as number,
    tables: validatedTables,
  };
}

/**
 * Validates that a value is a valid TableMetadata structure.
 * This is called during getTableMetadata to validate the specific table.
 *
 * @param data - The table data to validate
 * @param tableName - Name of the table (for error messages)
 * @returns Validated TableMetadata
 * @throws ManifestValidationError if validation fails
 */
export function validateTableMetadata(data: unknown, tableName: string): ValidatedTableMetadata {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    const actualType = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    throw new ManifestValidationError(
      `Invalid table "${tableName}": expected object but got ${actualType}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, receivedType: actualType }
    );
  }

  const table = data as Record<string, unknown>;

  // Validate name field
  if (!('name' in table)) {
    throw new ManifestValidationError(
      `Invalid table "${tableName}": missing required field "name"`,
      ManifestValidationErrorCode.MISSING_FIELD,
      { table: tableName, field: 'name' }
    );
  }

  if (typeof table.name !== 'string') {
    throw new ManifestValidationError(
      `Invalid table "${tableName}": "name" must be a string but got ${typeof table.name}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, field: 'name', expectedType: 'string', receivedType: typeof table.name }
    );
  }

  // Validate schema field
  if (!('schema' in table)) {
    throw new ManifestValidationError(
      `Invalid table "${tableName}": missing required field "schema"`,
      ManifestValidationErrorCode.MISSING_FIELD,
      { table: tableName, field: 'schema' }
    );
  }

  if (!Array.isArray(table.schema)) {
    const actualType = table.schema === null ? 'null' : typeof table.schema;
    throw new ManifestValidationError(
      `Invalid table "${tableName}": "schema" must be an array but got ${actualType}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, field: 'schema', expectedType: 'array', receivedType: actualType }
    );
  }

  // Validate each column in schema
  const validatedSchema: ValidatedColumnSchema[] = [];
  for (let i = 0; i < table.schema.length; i++) {
    validatedSchema.push(validateColumnSchema(table.schema[i], tableName, i));
  }

  // Validate blockPaths field
  if (!('blockPaths' in table)) {
    throw new ManifestValidationError(
      `Invalid table "${tableName}": missing required field "blockPaths"`,
      ManifestValidationErrorCode.MISSING_FIELD,
      { table: tableName, field: 'blockPaths' }
    );
  }

  if (!Array.isArray(table.blockPaths)) {
    const actualType = table.blockPaths === null ? 'null' : typeof table.blockPaths;
    throw new ManifestValidationError(
      `Invalid table "${tableName}": "blockPaths" must be an array but got ${actualType}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, field: 'blockPaths', expectedType: 'array', receivedType: actualType }
    );
  }

  // Validate rowCount field
  if (!('rowCount' in table)) {
    throw new ManifestValidationError(
      `Invalid table "${tableName}": missing required field "rowCount"`,
      ManifestValidationErrorCode.MISSING_FIELD,
      { table: tableName, field: 'rowCount' }
    );
  }

  if (typeof table.rowCount !== 'number') {
    throw new ManifestValidationError(
      `Invalid table "${tableName}": "rowCount" must be a number but got ${typeof table.rowCount}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, field: 'rowCount', expectedType: 'number', receivedType: typeof table.rowCount }
    );
  }

  // lastUpdated is optional, but if present must be a number
  let lastUpdated = 0;
  if ('lastUpdated' in table) {
    if (typeof table.lastUpdated !== 'number') {
      throw new ManifestValidationError(
        `Invalid table "${tableName}": "lastUpdated" must be a number but got ${typeof table.lastUpdated}`,
        ManifestValidationErrorCode.WRONG_TYPE,
        { table: tableName, field: 'lastUpdated', expectedType: 'number', receivedType: typeof table.lastUpdated }
      );
    }
    lastUpdated = table.lastUpdated;
  }

  return {
    name: table.name as string,
    schema: validatedSchema,
    blockPaths: table.blockPaths as string[],
    rowCount: table.rowCount as number,
    lastUpdated,
  };
}

/**
 * Validates table metadata structure without deep column validation.
 * Used during manifest loading for lazy validation.
 */
function validateTableMetadataStructure(data: unknown, tableName: string): ValidatedTableMetadata {
  // Defer to full validation
  return validateTableMetadata(data, tableName);
}

/**
 * Validates a column schema entry.
 */
function validateColumnSchema(data: unknown, tableName: string, index: number): ValidatedColumnSchema {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    const actualType = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    throw new ManifestValidationError(
      `Invalid column at index ${index} in table "${tableName}": expected object but got ${actualType}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, columnIndex: index, receivedType: actualType }
    );
  }

  const column = data as Record<string, unknown>;

  // Validate name field
  if (!('name' in column)) {
    throw new ManifestValidationError(
      `Invalid column at index ${index} in table "${tableName}": missing required field "name"`,
      ManifestValidationErrorCode.MISSING_FIELD,
      { table: tableName, columnIndex: index, field: 'name' }
    );
  }

  if (typeof column.name !== 'string') {
    throw new ManifestValidationError(
      `Invalid column at index ${index} in table "${tableName}": "name" must be a string but got ${typeof column.name}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, columnIndex: index, field: 'name', expectedType: 'string', receivedType: typeof column.name }
    );
  }

  // Validate type field
  if (!('type' in column)) {
    throw new ManifestValidationError(
      `Invalid column "${column.name}" in table "${tableName}": missing required field "type"`,
      ManifestValidationErrorCode.MISSING_FIELD,
      { table: tableName, column: column.name, field: 'type' }
    );
  }

  if (typeof column.type !== 'string') {
    throw new ManifestValidationError(
      `Invalid column "${column.name}" in table "${tableName}": "type" must be a string but got ${typeof column.type}`,
      ManifestValidationErrorCode.WRONG_TYPE,
      { table: tableName, column: column.name, field: 'type', expectedType: 'string', receivedType: typeof column.type }
    );
  }

  // Validate column type value
  if (!VALID_COLUMN_TYPES.has(column.type)) {
    throw new ManifestValidationError(
      `Invalid column "${column.name}" in table "${tableName}": unknown type "${column.type}"`,
      ManifestValidationErrorCode.INVALID_COLUMN_TYPE,
      { table: tableName, column: column.name, invalidType: column.type, validTypes: Array.from(VALID_COLUMN_TYPES) }
    );
  }

  // nullable defaults to false if not present
  const nullable = 'nullable' in column ? Boolean(column.nullable) : false;

  return {
    name: column.name as string,
    type: column.type as ColumnType,
    nullable,
    metadata: column.metadata as Record<string, string> | undefined,
  };
}

/**
 * Type guard to check if a value is a valid Manifest.
 */
export function isValidManifest(data: unknown): data is ValidatedManifest {
  try {
    validateManifest(data);
    return true;
  } catch {
    return false;
  }
}
