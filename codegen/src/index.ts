/**
 * @evodb/codegen
 *
 * CLI tool for EvoDB schema code generation.
 * Generates TypeScript type definitions from database schemas.
 *
 * Commands:
 *   evodb pull [--db <name>]   Generate .evodb/[db].d.ts
 *   evodb push [--db <name>]   Push schema changes
 *   evodb lock [--db <name>]   Lock schema at current version
 *   evodb diff [--db <name>]   Show schema diff
 */

// ============================================================================
// CLI Types
// ============================================================================

export type {
  SqlType,
  ColumnDefinition,
  TableDefinition,
  Schema,
  SchemaLock,
  ChangeType,
  SchemaChange,
  BaseOptions,
  PullOptions,
  PullResult,
  PushOptions,
  PushResult,
  LockOptions,
  LockResult,
  DiffOptions,
  DiffResult,
} from './types.js';

// ============================================================================
// CLI Commands
// ============================================================================

export { pullCommand } from './commands/pull.js';
export { pushCommand } from './commands/push.js';
export { lockCommand } from './commands/lock.js';
export { diffCommand } from './commands/diff.js';
