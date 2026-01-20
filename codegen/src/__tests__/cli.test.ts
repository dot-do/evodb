/**
 * @evodb/codegen CLI Tests
 *
 * TDD: These tests define the expected behavior of the CLI tool.
 * Tests are written first, implementation follows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

// Import command implementations for unit testing
import { pullCommand, type PullOptions, type PullResult } from '../commands/pull.js';
import { pushCommand, type PushOptions, type PushResult } from '../commands/push.js';
import { lockCommand, type LockOptions, type LockResult } from '../commands/lock.js';
import { diffCommand, type DiffOptions, type DiffResult } from '../commands/diff.js';
import type { Schema, SqlType } from '../types.js';

// Helper to create typed schemas
function createSchema(tables: Record<string, { columns: Record<string, { type: SqlType; primaryKey?: boolean; nullable?: boolean }> }>): Schema {
  return { tables } as Schema;
}

// Test fixtures directory
const TEST_DIR = resolve(process.cwd(), '.test-evodb-codegen');
const EVODB_DIR = join(TEST_DIR, '.evodb');

describe('@evodb/codegen CLI', () => {
  beforeEach(() => {
    // Create test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('pull command', () => {
    it('should create .evodb directory if it does not exist', async () => {
      const result = await pullCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                name: { type: 'text' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(existsSync(EVODB_DIR)).toBe(true);
    });

    it('should generate .evodb/[db].d.ts for specified database', async () => {
      const result = await pullCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                name: { type: 'text' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.files).toContain('.evodb/mydb.d.ts');

      const dtsPath = join(EVODB_DIR, 'mydb.d.ts');
      expect(existsSync(dtsPath)).toBe(true);

      const content = readFileSync(dtsPath, 'utf8');
      expect(content).toContain('interface Users');
      expect(content).toContain('id: number');
      expect(content).toContain('name: string');
    });

    it('should generate index.d.ts that re-exports all database types', async () => {
      await pullCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
          },
        },
      });

      await pullCommand({
        db: 'orders',
        cwd: TEST_DIR,
        schema: {
          tables: {
            orders: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
          },
        },
      });

      const indexPath = join(EVODB_DIR, 'index.d.ts');
      expect(existsSync(indexPath)).toBe(true);

      const content = readFileSync(indexPath, 'utf8');
      expect(content).toContain("export * from './mydb'");
      expect(content).toContain("export * from './orders'");
    });

    it('should handle multiple tables in schema', async () => {
      const result = await pullCommand({
        db: 'testdb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                email: { type: 'text' },
              },
            },
            posts: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                title: { type: 'text' },
                userId: { type: 'integer' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);

      const content = readFileSync(join(EVODB_DIR, 'testdb.d.ts'), 'utf8');
      expect(content).toContain('interface Users');
      expect(content).toContain('interface Posts');
    });

    it('should map SQL types to TypeScript types correctly', async () => {
      const result = await pullCommand({
        db: 'typetest',
        cwd: TEST_DIR,
        schema: {
          tables: {
            test: {
              columns: {
                intCol: { type: 'integer' },
                textCol: { type: 'text' },
                realCol: { type: 'real' },
                blobCol: { type: 'blob' },
                boolCol: { type: 'boolean' },
                jsonCol: { type: 'json' },
                timestampCol: { type: 'timestamp' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);

      const content = readFileSync(join(EVODB_DIR, 'typetest.d.ts'), 'utf8');
      expect(content).toContain('intCol: number');
      expect(content).toContain('textCol: string');
      expect(content).toContain('realCol: number');
      expect(content).toContain('blobCol: Uint8Array');
      expect(content).toContain('boolCol: boolean');
      expect(content).toContain('jsonCol: unknown');
      expect(content).toContain('timestampCol: Date');
    });

    it('should handle nullable columns', async () => {
      const result = await pullCommand({
        db: 'nullable',
        cwd: TEST_DIR,
        schema: {
          tables: {
            test: {
              columns: {
                required: { type: 'text', nullable: false },
                optional: { type: 'text', nullable: true },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);

      const content = readFileSync(join(EVODB_DIR, 'nullable.d.ts'), 'utf8');
      expect(content).toContain('required: string');
      expect(content).toContain('optional: string | null');
    });
  });

  describe('push command', () => {
    it('should validate schema before pushing', async () => {
      const result = await pushCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        dryRun: true,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.validated).toBe(true);
    });

    it('should return migration statements in dry-run mode', async () => {
      const result = await pushCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        dryRun: true,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                name: { type: 'text' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.migrations).toBeDefined();
      expect(result.migrations!.length).toBeGreaterThan(0);
      expect(result.migrations![0]).toContain('CREATE TABLE');
    });

    it('should report what would change without applying', async () => {
      const result = await pushCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        dryRun: true,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
          },
        },
      });

      expect(result.dryRun).toBe(true);
      expect(result.applied).toBe(false);
    });
  });

  describe('lock command', () => {
    it('should create a schema lock file', async () => {
      const result = await lockCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.lockFile).toBe('.evodb/mydb.lock.json');

      const lockPath = join(EVODB_DIR, 'mydb.lock.json');
      expect(existsSync(lockPath)).toBe(true);
    });

    it('should store schema version in lock file', async () => {
      await lockCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
          },
        },
      });

      const lockPath = join(EVODB_DIR, 'mydb.lock.json');
      const lockContent = JSON.parse(readFileSync(lockPath, 'utf8'));

      expect(lockContent.version).toBeDefined();
      expect(lockContent.lockedAt).toBeDefined();
      expect(lockContent.schema).toBeDefined();
    });

    it('should generate schema hash for change detection', async () => {
      const result = await lockCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
          },
        },
      });

      expect(result.schemaHash).toBeDefined();
      expect(result.schemaHash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('diff command', () => {
    it('should show no changes when schema matches lock', async () => {
      const schema = createSchema({
        users: {
          columns: {
            id: { type: 'integer', primaryKey: true },
          },
        },
      });

      // First lock the schema
      await lockCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema,
      });

      // Then diff against same schema
      const result = await diffCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema,
      });

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(false);
      expect(result.changes).toEqual([]);
    });

    it('should detect added columns', async () => {
      // Lock initial schema
      await lockCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
          },
        },
      });

      // Diff with new column
      const result = await diffCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                name: { type: 'text' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.changes).toContainEqual({
        type: 'add_column',
        table: 'users',
        column: 'name',
        details: { type: 'text' },
      });
    });

    it('should detect removed columns', async () => {
      // Lock initial schema with two columns
      await lockCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                name: { type: 'text' },
              },
            },
          },
        },
      });

      // Diff with one column removed
      const result = await diffCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.changes).toContainEqual({
        type: 'remove_column',
        table: 'users',
        column: 'name',
      });
    });

    it('should detect added tables', async () => {
      // Lock initial schema
      await lockCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
          },
        },
      });

      // Diff with new table
      const result = await diffCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
            posts: {
              columns: {
                id: { type: 'integer', primaryKey: true },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.changes).toContainEqual({
        type: 'add_table',
        table: 'posts',
      });
    });

    it('should detect column type changes', async () => {
      // Lock initial schema
      await lockCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                count: { type: 'integer' },
              },
            },
          },
        },
      });

      // Diff with changed type
      const result = await diffCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                count: { type: 'real' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.changes).toContainEqual({
        type: 'modify_column',
        table: 'users',
        column: 'count',
        from: { type: 'integer' },
        to: { type: 'real' },
      });
    });

    it('should return error when no lock file exists', async () => {
      const result = await diffCommand({
        db: 'nonexistent',
        cwd: TEST_DIR,
        schema: {
          tables: {},
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('lock file');
    });
  });

  describe('CLI integration', () => {
    it('should export all command functions', async () => {
      expect(typeof pullCommand).toBe('function');
      expect(typeof pushCommand).toBe('function');
      expect(typeof lockCommand).toBe('function');
      expect(typeof diffCommand).toBe('function');
    });
  });
});
