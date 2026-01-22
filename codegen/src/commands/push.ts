/**
 * @evodb/codegen Push Command
 *
 * Validates and pushes schema changes to the database.
 * Supports dry-run mode for previewing migrations.
 */

import type {
  PushOptions,
  PushResult,
  Schema,
  TableDefinition,
  SqlType,
} from '../types.js';

// Re-export types for external use
export type { PushOptions, PushResult };

/**
 * Map SQL type to SQLite column type
 */
function sqlTypeToSqlite(sqlType: SqlType): string {
  switch (sqlType) {
    case 'integer':
      return 'INTEGER';
    case 'text':
      return 'TEXT';
    case 'real':
      return 'REAL';
    case 'blob':
      return 'BLOB';
    case 'boolean':
      return 'INTEGER'; // SQLite uses INTEGER for booleans
    case 'json':
      return 'TEXT'; // JSON stored as TEXT in SQLite
    case 'timestamp':
      return 'TEXT'; // Timestamps as ISO strings
    default:
      return 'TEXT';
  }
}

/**
 * Generate CREATE TABLE statement for a table
 */
function generateCreateTable(
  tableName: string,
  table: TableDefinition
): string {
  const columnDefs: string[] = [];

  for (const [columnName, column] of Object.entries(table.columns)) {
    const parts: string[] = [columnName, sqlTypeToSqlite(column.type)];

    if (column.primaryKey) {
      parts.push('PRIMARY KEY');
    }

    if (column.nullable === false) {
      parts.push('NOT NULL');
    }

    columnDefs.push(parts.join(' '));
  }

  return `CREATE TABLE ${tableName} (\n  ${columnDefs.join(',\n  ')}\n);`;
}

/**
 * Generate migration statements for a schema
 */
function generateMigrations(schema: Schema): string[] {
  const migrations: string[] = [];

  for (const [tableName, table] of Object.entries(schema.tables)) {
    migrations.push(generateCreateTable(tableName, table));
  }

  return migrations;
}

/**
 * Validate schema structure
 */
function validateSchema(schema: Schema): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!schema.tables || typeof schema.tables !== 'object' || Array.isArray(schema.tables)) {
    errors.push('Schema must have a "tables" object');
    return { valid: false, errors };
  }

  for (const [tableName, table] of Object.entries(schema.tables)) {
    if (!table.columns || typeof table.columns !== 'object') {
      errors.push(`Table "${tableName}" must have a "columns" object`);
      continue;
    }

    const hasPrimaryKey = Object.values(table.columns).some(
      (col) => col.primaryKey
    );
    if (!hasPrimaryKey) {
      // Warning, not an error
    }

    for (const [columnName, column] of Object.entries(table.columns)) {
      if (!column.type) {
        errors.push(
          `Column "${tableName}.${columnName}" must have a "type" property`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Push command: Validate and push schema changes
 */
export async function pushCommand(options: PushOptions): Promise<PushResult> {
  const { schema, dryRun = false } = options;
  // Note: db and cwd are reserved for future use when connecting to actual database

  try {
    // Validate schema
    const validation = validateSchema(schema);
    if (!validation.valid) {
      return {
        success: false,
        validated: false,
        dryRun,
        applied: false,
        error: validation.errors.join('; '),
      };
    }

    // Generate migrations
    const migrations = generateMigrations(schema);

    if (dryRun) {
      // In dry-run mode, just return the migrations without applying
      return {
        success: true,
        validated: true,
        dryRun: true,
        applied: false,
        migrations,
      };
    }

    // In a real implementation, this would connect to the database
    // and apply the migrations. For the POC, we simulate success.
    return {
      success: true,
      validated: true,
      dryRun: false,
      applied: true,
      migrations,
    };
  } catch (error) {
    return {
      success: false,
      validated: false,
      dryRun,
      applied: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
