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

  describe('push command additional tests', () => {
    it('should reject schema without tables object', async () => {
      const result = await pushCommand({
        db: 'invalid',
        cwd: TEST_DIR,
        dryRun: true,
        schema: {} as Schema,
      });

      expect(result.success).toBe(false);
      expect(result.validated).toBe(false);
      expect(result.error).toContain('tables');
    });

    it('should reject schema with invalid table (no columns)', async () => {
      const result = await pushCommand({
        db: 'invalid',
        cwd: TEST_DIR,
        dryRun: true,
        schema: {
          tables: {
            users: {} as unknown as { columns: Record<string, { type: SqlType }> },
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('columns');
    });

    it('should reject column without type', async () => {
      const result = await pushCommand({
        db: 'invalid',
        cwd: TEST_DIR,
        dryRun: true,
        schema: {
          tables: {
            users: {
              columns: {
                id: {} as unknown as { type: SqlType },
              },
            },
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('type');
    });

    it('should apply changes in non-dry-run mode', async () => {
      const result = await pushCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        dryRun: false,
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
      expect(result.dryRun).toBe(false);
      expect(result.applied).toBe(true);
    });

    it('should handle table without primary key (warning only)', async () => {
      const result = await pushCommand({
        db: 'mydb',
        cwd: TEST_DIR,
        dryRun: true,
        schema: {
          tables: {
            logs: {
              columns: {
                message: { type: 'text' },
                timestamp: { type: 'timestamp' },
              },
            },
          },
        },
      });

      // Should succeed even without primary key
      expect(result.success).toBe(true);
    });

    it('should generate correct SQL types in migrations', async () => {
      const result = await pushCommand({
        db: 'typetest',
        cwd: TEST_DIR,
        dryRun: true,
        schema: {
          tables: {
            test: {
              columns: {
                id: { type: 'integer', primaryKey: true, nullable: false },
                name: { type: 'text', nullable: true },
                active: { type: 'boolean' },
                data: { type: 'json' },
                created: { type: 'timestamp' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.migrations).toBeDefined();
      const sql = result.migrations![0];
      expect(sql).toContain('INTEGER PRIMARY KEY NOT NULL');
      expect(sql).toContain('name TEXT');
      expect(sql).toContain('active INTEGER'); // boolean maps to INTEGER
      expect(sql).toContain('data TEXT'); // json maps to TEXT
      expect(sql).toContain('created TEXT'); // timestamp maps to TEXT
    });
  });

  describe('lock command additional tests', () => {
    it('should increment version when relocking', async () => {
      const schema = createSchema({
        users: {
          columns: {
            id: { type: 'integer', primaryKey: true },
          },
        },
      });

      // First lock
      const result1 = await lockCommand({
        db: 'versiontest',
        cwd: TEST_DIR,
        schema,
      });
      expect(result1.success).toBe(true);

      // Read version
      const lockPath1 = join(EVODB_DIR, 'versiontest.lock.json');
      const lockContent1 = JSON.parse(readFileSync(lockPath1, 'utf8'));
      expect(lockContent1.version).toBe(1);

      // Second lock
      const result2 = await lockCommand({
        db: 'versiontest',
        cwd: TEST_DIR,
        schema,
      });
      expect(result2.success).toBe(true);

      // Version should be incremented
      const lockContent2 = JSON.parse(readFileSync(lockPath1, 'utf8'));
      expect(lockContent2.version).toBe(2);
    });

    it('should handle corrupted lock file when getting version', async () => {
      // Create a corrupted lock file
      mkdirSync(EVODB_DIR, { recursive: true });
      const lockPath = join(EVODB_DIR, 'corrupted.lock.json');
      writeFileSync(lockPath, '{ invalid json }');

      const result = await lockCommand({
        db: 'corrupted',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer' },
              },
            },
          },
        },
      });

      // Should succeed, starting from version 1
      expect(result.success).toBe(true);
      const content = JSON.parse(readFileSync(lockPath, 'utf8'));
      expect(content.version).toBe(1);
    });

    it('should handle lock file with invalid version', async () => {
      // Create a lock file with invalid version
      mkdirSync(EVODB_DIR, { recursive: true });
      const lockPath = join(EVODB_DIR, 'badversion.lock.json');
      writeFileSync(lockPath, JSON.stringify({
        version: 'not-a-number',
        lockedAt: new Date().toISOString(),
        schemaHash: 'abc123',
        schema: { tables: {} },
      }));

      const result = await lockCommand({
        db: 'badversion',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer' },
              },
            },
          },
        },
      });

      // Should succeed, starting from version 1
      expect(result.success).toBe(true);
      const content = JSON.parse(readFileSync(lockPath, 'utf8'));
      expect(content.version).toBe(1);
    });

    it('should handle lock file with non-integer version', async () => {
      mkdirSync(EVODB_DIR, { recursive: true });
      const lockPath = join(EVODB_DIR, 'floatversion.lock.json');
      writeFileSync(lockPath, JSON.stringify({
        version: 1.5, // Non-integer
        lockedAt: new Date().toISOString(),
        schemaHash: 'abc123',
        schema: { tables: {} },
      }));

      const result = await lockCommand({
        db: 'floatversion',
        cwd: TEST_DIR,
        schema: {
          tables: {
            test: {
              columns: {
                id: { type: 'integer' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      const content = JSON.parse(readFileSync(lockPath, 'utf8'));
      expect(content.version).toBe(1); // Should reset to 1 due to invalid version
    });

    it('should handle lock file without version property', async () => {
      mkdirSync(EVODB_DIR, { recursive: true });
      const lockPath = join(EVODB_DIR, 'noversion.lock.json');
      writeFileSync(lockPath, JSON.stringify({
        // No version property
        lockedAt: new Date().toISOString(),
        schemaHash: 'abc123',
        schema: { tables: {} },
      }));

      const result = await lockCommand({
        db: 'noversion',
        cwd: TEST_DIR,
        schema: {
          tables: {
            test: {
              columns: {
                id: { type: 'integer' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      const content = JSON.parse(readFileSync(lockPath, 'utf8'));
      expect(content.version).toBe(1);
    });
  });

  describe('lock command error handling', () => {
    it('should handle ValidationError when writing lock file fails', async () => {
      // Create a directory where lock file should be written (to cause error)
      mkdirSync(EVODB_DIR, { recursive: true });
      const lockDir = join(EVODB_DIR, 'errlock.lock.json');
      mkdirSync(lockDir, { recursive: true });

      const result = await lockCommand({
        db: 'errlock',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.schemaHash).toBe('');
    });
  });

  describe('diff command additional tests', () => {
    it('should detect removed tables', async () => {
      // Lock initial schema with two tables
      await lockCommand({
        db: 'rmtable',
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

      // Diff with one table removed
      const result = await diffCommand({
        db: 'rmtable',
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
        type: 'remove_table',
        table: 'posts',
      });
    });

    it('should detect nullable changes', async () => {
      // Lock initial schema
      await lockCommand({
        db: 'nullable',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                name: { type: 'text', nullable: false },
              },
            },
          },
        },
      });

      // Diff with nullable change
      const result = await diffCommand({
        db: 'nullable',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer', primaryKey: true },
                name: { type: 'text', nullable: true },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.changes.some(c => c.type === 'modify_column' && c.column === 'name')).toBe(true);
    });

    it('should detect primaryKey changes', async () => {
      // Lock initial schema
      await lockCommand({
        db: 'pkchange',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer' },
              },
            },
          },
        },
      });

      // Diff with primaryKey change
      const result = await diffCommand({
        db: 'pkchange',
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
    });

    it('should handle corrupted lock file', async () => {
      // Create a corrupted lock file
      mkdirSync(EVODB_DIR, { recursive: true });
      const lockPath = join(EVODB_DIR, 'diffdcorrupted.lock.json');
      writeFileSync(lockPath, '{ invalid json }');

      const result = await diffCommand({
        db: 'diffdcorrupted',
        cwd: TEST_DIR,
        schema: {
          tables: {},
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('pull command additional tests', () => {
    it('should handle error during file write', async () => {
      // Create a directory where the file should be (to cause write error)
      const evodbDir = join(TEST_DIR, '.evodb');
      mkdirSync(join(evodbDir, 'conflictdb.d.ts'), { recursive: true });

      const result = await pullCommand({
        db: 'conflictdb',
        cwd: TEST_DIR,
        schema: {
          tables: {
            users: {
              columns: {
                id: { type: 'integer' },
              },
            },
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle all SQL types in type mapping', async () => {
      const result = await pullCommand({
        db: 'alltypes',
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
      const content = readFileSync(join(EVODB_DIR, 'alltypes.d.ts'), 'utf8');
      expect(content).toContain('intCol: number');
      expect(content).toContain('textCol: string');
      expect(content).toContain('realCol: number');
      expect(content).toContain('blobCol: Uint8Array');
      expect(content).toContain('boolCol: boolean');
      expect(content).toContain('jsonCol: unknown');
      expect(content).toContain('timestampCol: Date');
    });

    it('should handle unknown SQL type by defaulting to unknown', async () => {
      // This tests the default case in sqlTypeToTs
      const result = await pullCommand({
        db: 'unknowntype',
        cwd: TEST_DIR,
        schema: {
          tables: {
            test: {
              columns: {
                field: { type: 'unknown_type' as SqlType },
              },
            },
          },
        },
      });

      expect(result.success).toBe(true);
      const content = readFileSync(join(EVODB_DIR, 'unknowntype.d.ts'), 'utf8');
      expect(content).toContain('field: unknown');
    });
  });
});
