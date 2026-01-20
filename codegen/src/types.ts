/**
 * @evodb/codegen Type Definitions
 *
 * Core types for schema representation and command options/results.
 */

/**
 * SQL column types supported by EvoDB
 */
export type SqlType =
  | 'integer'
  | 'text'
  | 'real'
  | 'blob'
  | 'boolean'
  | 'json'
  | 'timestamp';

/**
 * Column definition in a schema
 */
export interface ColumnDefinition {
  type: SqlType;
  primaryKey?: boolean;
  nullable?: boolean;
  defaultValue?: unknown;
}

/**
 * Table definition in a schema
 */
export interface TableDefinition {
  columns: Record<string, ColumnDefinition>;
}

/**
 * Database schema definition
 */
export interface Schema {
  tables: Record<string, TableDefinition>;
}

/**
 * Schema lock file content
 */
export interface SchemaLock {
  version: number;
  lockedAt: string;
  schemaHash: string;
  schema: Schema;
}

/**
 * Schema change types
 */
export type ChangeType =
  | 'add_table'
  | 'remove_table'
  | 'add_column'
  | 'remove_column'
  | 'modify_column';

/**
 * Schema change descriptor
 */
export interface SchemaChange {
  type: ChangeType;
  table: string;
  column?: string;
  details?: Partial<ColumnDefinition>;
  from?: Partial<ColumnDefinition>;
  to?: Partial<ColumnDefinition>;
}

/**
 * Base command options
 */
export interface BaseOptions {
  db: string;
  cwd: string;
}

/**
 * Pull command options
 */
export interface PullOptions extends BaseOptions {
  schema: Schema;
}

/**
 * Pull command result
 */
export interface PullResult {
  success: boolean;
  files: string[];
  error?: string;
}

/**
 * Push command options
 */
export interface PushOptions extends BaseOptions {
  schema: Schema;
  dryRun?: boolean;
}

/**
 * Push command result
 */
export interface PushResult {
  success: boolean;
  validated: boolean;
  dryRun: boolean;
  applied: boolean;
  migrations?: string[];
  error?: string;
}

/**
 * Lock command options
 */
export interface LockOptions extends BaseOptions {
  schema: Schema;
}

/**
 * Lock command result
 */
export interface LockResult {
  success: boolean;
  lockFile: string;
  schemaHash: string;
  error?: string;
}

/**
 * Diff command options
 */
export interface DiffOptions extends BaseOptions {
  schema: Schema;
}

/**
 * Diff command result
 */
export interface DiffResult {
  success: boolean;
  hasChanges: boolean;
  changes: SchemaChange[];
  error?: string;
}
