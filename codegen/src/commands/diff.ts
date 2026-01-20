/**
 * @evodb/codegen Diff Command
 *
 * Compares current schema against locked schema to detect changes.
 * Returns detailed change descriptors for migration planning.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  DiffOptions,
  DiffResult,
  Schema,
  SchemaLock,
  SchemaChange,
  ColumnDefinition,
} from '../types.js';

// Re-export types for external use
export type { DiffOptions, DiffResult };

/**
 * Compare two column definitions for equality
 */
function columnsEqual(a: ColumnDefinition, b: ColumnDefinition): boolean {
  return (
    a.type === b.type &&
    (a.primaryKey ?? false) === (b.primaryKey ?? false) &&
    (a.nullable ?? false) === (b.nullable ?? false)
  );
}

/**
 * Compute schema differences
 */
function computeDiff(locked: Schema, current: Schema): SchemaChange[] {
  const changes: SchemaChange[] = [];

  const lockedTables = new Set(Object.keys(locked.tables));
  const currentTables = new Set(Object.keys(current.tables));

  // Check for added tables
  for (const tableName of currentTables) {
    if (!lockedTables.has(tableName)) {
      changes.push({
        type: 'add_table',
        table: tableName,
      });
    }
  }

  // Check for removed tables
  for (const tableName of lockedTables) {
    if (!currentTables.has(tableName)) {
      changes.push({
        type: 'remove_table',
        table: tableName,
      });
    }
  }

  // Check for column changes in existing tables
  for (const tableName of lockedTables) {
    if (!currentTables.has(tableName)) {
      continue; // Table removed, already handled
    }

    const lockedTable = locked.tables[tableName];
    const currentTable = current.tables[tableName];

    const lockedColumns = new Set(Object.keys(lockedTable.columns));
    const currentColumns = new Set(Object.keys(currentTable.columns));

    // Check for added columns
    for (const columnName of currentColumns) {
      if (!lockedColumns.has(columnName)) {
        changes.push({
          type: 'add_column',
          table: tableName,
          column: columnName,
          details: { type: currentTable.columns[columnName].type },
        });
      }
    }

    // Check for removed columns
    for (const columnName of lockedColumns) {
      if (!currentColumns.has(columnName)) {
        changes.push({
          type: 'remove_column',
          table: tableName,
          column: columnName,
        });
      }
    }

    // Check for modified columns
    for (const columnName of lockedColumns) {
      if (!currentColumns.has(columnName)) {
        continue; // Column removed, already handled
      }

      const lockedColumn = lockedTable.columns[columnName];
      const currentColumn = currentTable.columns[columnName];

      if (!columnsEqual(lockedColumn, currentColumn)) {
        changes.push({
          type: 'modify_column',
          table: tableName,
          column: columnName,
          from: { type: lockedColumn.type },
          to: { type: currentColumn.type },
        });
      }
    }
  }

  return changes;
}

/**
 * Diff command: Compare current schema against locked schema
 */
export async function diffCommand(options: DiffOptions): Promise<DiffResult> {
  const { db, cwd, schema } = options;
  const evodbDir = join(cwd, '.evodb');
  const lockPath = join(evodbDir, `${db}.lock.json`);

  try {
    // Check if lock file exists
    if (!existsSync(lockPath)) {
      return {
        success: false,
        hasChanges: false,
        changes: [],
        error: `No lock file found for database "${db}". Run "evodb lock --db ${db}" first.`,
      };
    }

    // Read lock file
    const lockContent = readFileSync(lockPath, 'utf8');
    const lock: SchemaLock = JSON.parse(lockContent);

    // Compute differences
    const changes = computeDiff(lock.schema, schema);

    return {
      success: true,
      hasChanges: changes.length > 0,
      changes,
    };
  } catch (error) {
    return {
      success: false,
      hasChanges: false,
      changes: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
