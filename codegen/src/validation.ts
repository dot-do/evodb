/**
 * @evodb/codegen Input Validation
 *
 * Provides type guards and validation functions for JSON parsing
 * with helpful error messages for CLI users.
 */

import type { Schema, SchemaLock, ColumnDefinition, TableDefinition, SqlType } from './types.js';

// =============================================================================
// Validation Error
// =============================================================================

/**
 * Custom error class for validation failures with helpful messages
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string = '',
    public readonly hint?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }

  /**
   * Get a formatted error message for CLI output
   */
  toCliMessage(): string {
    let msg = this.message;
    if (this.path) {
      msg = `At "${this.path}": ${msg}`;
    }
    if (this.hint) {
      msg += `\n  Hint: ${this.hint}`;
    }
    return msg;
  }
}

// =============================================================================
// JSON Parsing
// =============================================================================

/**
 * Safely parse JSON with helpful error messages
 */
export function parseJson(content: string, filePath: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      // Extract line/column info if available
      const match = error.message.match(/position (\d+)/);
      let hint = 'Ensure the file contains valid JSON syntax.';

      if (match) {
        const position = parseInt(match[1], 10);
        const lines = content.substring(0, position).split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1].length + 1;
        hint = `Error near line ${line}, column ${column}. Check for missing commas, quotes, or brackets.`;
      }

      throw new ValidationError(
        `Invalid JSON in "${filePath}": ${error.message}`,
        '',
        hint
      );
    }
    throw error;
  }
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Valid SQL types for column definitions
 */
const VALID_SQL_TYPES: SqlType[] = [
  'integer',
  'text',
  'real',
  'blob',
  'boolean',
  'json',
  'timestamp',
];

/**
 * Check if a value is a valid SQL type
 */
function isValidSqlType(value: unknown): value is SqlType {
  return typeof value === 'string' && VALID_SQL_TYPES.includes(value as SqlType);
}

/**
 * Check if a value is a plain object (not null, array, or other)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// =============================================================================
// Schema Validation
// =============================================================================

/**
 * Validate a column definition
 */
function validateColumnDefinition(
  value: unknown,
  path: string
): asserts value is ColumnDefinition {
  if (!isPlainObject(value)) {
    throw new ValidationError(
      'Column definition must be an object',
      path,
      'Each column should have at least a "type" property.'
    );
  }

  if (!('type' in value)) {
    throw new ValidationError(
      'Column definition missing required "type" property',
      path,
      `Valid types are: ${VALID_SQL_TYPES.join(', ')}`
    );
  }

  if (!isValidSqlType(value.type)) {
    throw new ValidationError(
      `Invalid column type: "${value.type}"`,
      `${path}.type`,
      `Valid types are: ${VALID_SQL_TYPES.join(', ')}`
    );
  }

  // Validate optional properties
  if ('primaryKey' in value && typeof value.primaryKey !== 'boolean') {
    throw new ValidationError(
      '"primaryKey" must be a boolean',
      `${path}.primaryKey`
    );
  }

  if ('nullable' in value && typeof value.nullable !== 'boolean') {
    throw new ValidationError(
      '"nullable" must be a boolean',
      `${path}.nullable`
    );
  }
}

/**
 * Validate a table definition
 */
function validateTableDefinition(
  value: unknown,
  path: string
): asserts value is TableDefinition {
  if (!isPlainObject(value)) {
    throw new ValidationError(
      'Table definition must be an object',
      path,
      'Each table should have a "columns" object.'
    );
  }

  if (!('columns' in value)) {
    throw new ValidationError(
      'Table definition missing required "columns" property',
      path,
      'Add a "columns" object with column definitions.'
    );
  }

  if (!isPlainObject(value.columns)) {
    throw new ValidationError(
      '"columns" must be an object',
      `${path}.columns`,
      'Define columns as: { "columnName": { "type": "text" } }'
    );
  }

  // Validate each column
  for (const [columnName, columnDef] of Object.entries(value.columns)) {
    validateColumnDefinition(columnDef, `${path}.columns.${columnName}`);
  }
}

/**
 * Validate a schema object
 */
export function validateSchema(value: unknown, filePath: string): asserts value is Schema {
  if (!isPlainObject(value)) {
    throw new ValidationError(
      'Schema must be an object',
      '',
      `Check that "${filePath}" contains a valid schema object.`
    );
  }

  // Check if this is a config file with a nested schema
  const schemaValue = 'schema' in value ? value.schema : value;

  if (!isPlainObject(schemaValue)) {
    throw new ValidationError(
      'Schema must be an object',
      '',
      `Check that "${filePath}" contains a valid schema object.`
    );
  }

  if (!('tables' in schemaValue)) {
    throw new ValidationError(
      'Schema missing required "tables" property',
      '',
      'A schema must define at least one table: { "tables": { "users": { "columns": { ... } } } }'
    );
  }

  if (!isPlainObject(schemaValue.tables)) {
    throw new ValidationError(
      '"tables" must be an object',
      'tables',
      'Define tables as: { "tableName": { "columns": { ... } } }'
    );
  }

  // Validate each table
  for (const [tableName, tableDef] of Object.entries(schemaValue.tables)) {
    validateTableDefinition(tableDef, `tables.${tableName}`);
  }
}

/**
 * Parse and validate a schema from JSON content
 */
export function parseAndValidateSchema(content: string, filePath: string): Schema {
  const parsed = parseJson(content, filePath);

  // Handle config files with nested schema
  if (isPlainObject(parsed) && 'schema' in parsed && isPlainObject(parsed.schema)) {
    validateSchema(parsed.schema, filePath);
    return parsed.schema as unknown as Schema;
  }

  validateSchema(parsed, filePath);
  return parsed as unknown as Schema;
}

// =============================================================================
// Schema Lock Validation
// =============================================================================

/**
 * Validate a schema lock object
 */
export function validateSchemaLock(
  value: unknown,
  filePath: string
): asserts value is SchemaLock {
  if (!isPlainObject(value)) {
    throw new ValidationError(
      'Lock file must be an object',
      '',
      `The lock file "${filePath}" appears to be corrupted. Try running "evodb lock" again.`
    );
  }

  // Validate version
  if (!('version' in value)) {
    throw new ValidationError(
      'Lock file missing "version" property',
      '',
      'The lock file may be from an older version. Try running "evodb lock" again.'
    );
  }

  if (typeof value.version !== 'number' || !Number.isInteger(value.version)) {
    throw new ValidationError(
      '"version" must be an integer',
      'version'
    );
  }

  // Validate lockedAt
  if (!('lockedAt' in value)) {
    throw new ValidationError(
      'Lock file missing "lockedAt" property',
      '',
      'The lock file may be corrupted. Try running "evodb lock" again.'
    );
  }

  if (typeof value.lockedAt !== 'string') {
    throw new ValidationError(
      '"lockedAt" must be a string (ISO timestamp)',
      'lockedAt'
    );
  }

  // Validate schemaHash
  if (!('schemaHash' in value)) {
    throw new ValidationError(
      'Lock file missing "schemaHash" property',
      '',
      'The lock file may be corrupted. Try running "evodb lock" again.'
    );
  }

  if (typeof value.schemaHash !== 'string') {
    throw new ValidationError(
      '"schemaHash" must be a string',
      'schemaHash'
    );
  }

  // Validate schema
  if (!('schema' in value)) {
    throw new ValidationError(
      'Lock file missing "schema" property',
      '',
      'The lock file may be corrupted. Try running "evodb lock" again.'
    );
  }

  validateSchema(value.schema, filePath);
}

/**
 * Parse and validate a schema lock from JSON content
 */
export function parseAndValidateSchemaLock(content: string, filePath: string): SchemaLock {
  const parsed = parseJson(content, filePath);
  validateSchemaLock(parsed, filePath);
  return parsed as SchemaLock;
}
