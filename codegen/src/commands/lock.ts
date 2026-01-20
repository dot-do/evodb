/**
 * @evodb/codegen Lock Command
 *
 * Creates a schema lock file to track the current schema version.
 * Used for change detection and migration planning.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { LockOptions, LockResult, Schema, SchemaLock } from '../types.js';

// Re-export types for external use
export type { LockOptions, LockResult };

/**
 * Generate a deterministic hash of the schema
 */
function generateSchemaHash(schema: Schema): string {
  // Serialize schema in a deterministic way (sorted keys)
  const serialized = JSON.stringify(schema, Object.keys(schema).sort());
  return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

/**
 * Get current lock file version (increments on each lock)
 */
function getNextVersion(evodbDir: string, db: string): number {
  const lockPath = join(evodbDir, `${db}.lock.json`);

  if (existsSync(lockPath)) {
    try {
      const { readFileSync } = require('node:fs');
      const existing: SchemaLock = JSON.parse(readFileSync(lockPath, 'utf8'));
      return (existing.version || 0) + 1;
    } catch {
      return 1;
    }
  }

  return 1;
}

/**
 * Lock command: Create a schema lock file
 */
export async function lockCommand(options: LockOptions): Promise<LockResult> {
  const { db, cwd, schema } = options;
  const evodbDir = join(cwd, '.evodb');
  const lockFile = `.evodb/${db}.lock.json`;

  try {
    // Ensure .evodb directory exists
    if (!existsSync(evodbDir)) {
      mkdirSync(evodbDir, { recursive: true });
    }

    // Generate schema hash
    const schemaHash = generateSchemaHash(schema);

    // Get next version number
    const version = getNextVersion(evodbDir, db);

    // Create lock file content
    const lockContent: SchemaLock = {
      version,
      lockedAt: new Date().toISOString(),
      schemaHash,
      schema,
    };

    // Write lock file
    const lockPath = join(evodbDir, `${db}.lock.json`);
    writeFileSync(lockPath, JSON.stringify(lockContent, null, 2));

    return {
      success: true,
      lockFile,
      schemaHash,
    };
  } catch (error) {
    return {
      success: false,
      lockFile,
      schemaHash: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
