/**
 * @evodb/core - SQL Injection Prevention Tests
 *
 * Tests for SQL injection prevention in table name interpolation.
 * Issue: evodb-ofu - TDD: Fix SQL injection in table name interpolation
 */

import { describe, it, expect } from 'vitest';
import {
  validateTableName,
  createDOAdapter,
  quoteIdentifier,
} from '../storage.ts';

describe('createDOAdapter - SQL injection prevention', () => {
  // Mock DOSqlStorage for testing
  function createMockSqlStorage(): {
    storage: { exec: (query: string, ...bindings: unknown[]) => { results: unknown[] } };
    queries: string[];
  } {
    const queries: string[] = [];
    return {
      storage: {
        exec(query: string, ..._bindings: unknown[]) {
          queries.push(query);
          return { results: [] };
        },
      },
      queries,
    };
  }

  describe('validateTableName', () => {
    it('should allow valid alphanumeric table names', () => {
      expect(() => validateTableName('users')).not.toThrow();
      expect(() => validateTableName('user_data')).not.toThrow();
      expect(() => validateTableName('Users123')).not.toThrow();
      expect(() => validateTableName('_private_table')).not.toThrow();
    });

    it('should reject table names with SQL injection attempts - quotes', () => {
      expect(() => validateTableName('users"; DROP TABLE users; --')).toThrow();
      expect(() => validateTableName("users'; DROP TABLE users; --")).toThrow();
      expect(() => validateTableName('users`; DROP TABLE users; --')).toThrow();
    });

    it('should reject table names with SQL injection attempts - special characters', () => {
      expect(() => validateTableName('users; DROP TABLE users')).toThrow();
      expect(() => validateTableName('users--comment')).toThrow();
      expect(() => validateTableName('users/*comment*/')).toThrow();
    });

    it('should reject table names with spaces', () => {
      expect(() => validateTableName('user data')).toThrow();
      expect(() => validateTableName(' users')).toThrow();
      expect(() => validateTableName('users ')).toThrow();
    });

    it('should reject empty table names', () => {
      expect(() => validateTableName('')).toThrow();
    });

    it('should reject table names with parentheses', () => {
      expect(() => validateTableName('users()')).toThrow();
      expect(() => validateTableName('(users)')).toThrow();
    });
  });

  describe('createDOAdapter with validation', () => {
    it('should create adapter with valid table name', () => {
      const { storage } = createMockSqlStorage();
      expect(() => createDOAdapter(storage, 'valid_table_name')).not.toThrow();
    });

    it('should throw on SQL injection via table name - DROP TABLE', () => {
      const { storage } = createMockSqlStorage();
      expect(() => createDOAdapter(storage, 'users"; DROP TABLE users; --')).toThrow();
    });

    it('should throw on SQL injection via table name - quotes', () => {
      const { storage } = createMockSqlStorage();
      expect(() => createDOAdapter(storage, "'); DELETE FROM users; --")).toThrow();
    });

    it('should throw on table name with semicolon', () => {
      const { storage } = createMockSqlStorage();
      expect(() => createDOAdapter(storage, 'users; DROP TABLE')).toThrow();
    });

    it('should use default table name when not provided', () => {
      const { storage, queries } = createMockSqlStorage();
      createDOAdapter(storage);
      expect(queries[0]).toContain('blocks');
    });
  });

  describe('quoteIdentifier', () => {
    it('should wrap identifier in double quotes', () => {
      expect(quoteIdentifier('my_table')).toBe('"my_table"');
      expect(quoteIdentifier('users')).toBe('"users"');
    });

    it('should escape embedded double quotes by doubling them', () => {
      // If someone tries to embed a double quote, it gets escaped
      expect(quoteIdentifier('table"name')).toBe('"table""name"');
      expect(quoteIdentifier('a"b"c')).toBe('"a""b""c"');
    });

    it('should handle edge cases', () => {
      expect(quoteIdentifier('')).toBe('""');
      expect(quoteIdentifier('_')).toBe('"_"');
      expect(quoteIdentifier('123')).toBe('"123"');
    });
  });

  describe('quoted identifiers (defense in depth)', () => {
    it('should use quoted identifiers in CREATE TABLE statement', () => {
      const { storage, queries } = createMockSqlStorage();
      createDOAdapter(storage, 'my_table');
      // Should use double-quoted identifiers for SQL standard compliance
      expect(queries[0]).toMatch(/CREATE TABLE IF NOT EXISTS "my_table"/);
    });

    it('should use quoted identifiers in INSERT statement', async () => {
      const { storage, queries } = createMockSqlStorage();
      const adapter = createDOAdapter(storage, 'my_table');
      await adapter.writeBlock('test-id', new Uint8Array([1, 2, 3]));
      // Find the INSERT query
      const insertQuery = queries.find(q => q.includes('INSERT'));
      expect(insertQuery).toMatch(/INSERT OR REPLACE INTO "my_table"/);
    });

    it('should use quoted identifiers in SELECT statement', async () => {
      const { storage, queries } = createMockSqlStorage();
      const adapter = createDOAdapter(storage, 'my_table');
      await adapter.readBlock('test-id');
      // Find the SELECT query
      const selectQuery = queries.find(q => q.includes('SELECT data'));
      expect(selectQuery).toMatch(/SELECT data FROM "my_table"/);
    });

    it('should use quoted identifiers in list query', async () => {
      const { storage, queries } = createMockSqlStorage();
      const adapter = createDOAdapter(storage, 'my_table');
      await adapter.listBlocks();
      // Find the SELECT id query
      const listQuery = queries.find(q => q.includes('SELECT id'));
      expect(listQuery).toMatch(/SELECT id FROM "my_table"/);
    });

    it('should use quoted identifiers in list query with prefix', async () => {
      const { storage, queries } = createMockSqlStorage();
      const adapter = createDOAdapter(storage, 'my_table');
      await adapter.listBlocks('prefix');
      // Find the SELECT id query with LIKE
      const listQuery = queries.find(q => q.includes('LIKE'));
      expect(listQuery).toMatch(/SELECT id FROM "my_table" WHERE id LIKE/);
    });

    it('should use quoted identifiers in DELETE statement', async () => {
      const { storage, queries } = createMockSqlStorage();
      const adapter = createDOAdapter(storage, 'my_table');
      await adapter.deleteBlock('test-id');
      // Find the DELETE query
      const deleteQuery = queries.find(q => q.includes('DELETE'));
      expect(deleteQuery).toMatch(/DELETE FROM "my_table"/);
    });

    it('should provide defense in depth - validation + quoting together', () => {
      // Even if validation were bypassed, quoting should protect against injection
      // This test documents the defense-in-depth approach
      const { storage, queries } = createMockSqlStorage();
      createDOAdapter(storage, 'test_table');

      // All queries should use quoted identifiers
      queries.forEach((query) => {
        // Table name should always be quoted
        if (query.includes('test_table')) {
          expect(query).toMatch(/"test_table"/);
        }
      });
    });
  });
});
