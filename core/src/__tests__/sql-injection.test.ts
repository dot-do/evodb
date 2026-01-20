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
});
