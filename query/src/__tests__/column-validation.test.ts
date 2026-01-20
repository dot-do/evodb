/**
 * @evodb/query - Column Name Validation Tests
 *
 * Tests for SQL injection prevention through column name validation.
 * These tests ensure that malicious column names are rejected before
 * they can be used in query construction.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateColumnName, validateQueryColumns, createQueryEngine, QueryEngine } from '../engine.js';
import type { Query, QueryEngineConfig } from '../types.js';
import { createMockDataSource } from './fixtures/mock-data.js';

// =============================================================================
// Test Utilities
// =============================================================================

function createTestConfig(): QueryEngineConfig {
  return {
    dataSource: createMockDataSource(),
    defaultTimeoutMs: 30000,
    memoryLimitBytes: 100 * 1024 * 1024,
  };
}

// =============================================================================
// validateColumnName Tests
// =============================================================================

describe('validateColumnName', () => {
  describe('Valid Column Names', () => {
    it('should accept simple column names', () => {
      expect(() => validateColumnName('id')).not.toThrow();
      expect(() => validateColumnName('name')).not.toThrow();
      expect(() => validateColumnName('email')).not.toThrow();
      expect(() => validateColumnName('user_id')).not.toThrow();
      expect(() => validateColumnName('firstName')).not.toThrow();
      expect(() => validateColumnName('lastName')).not.toThrow();
    });

    it('should accept column names starting with underscore', () => {
      expect(() => validateColumnName('_id')).not.toThrow();
      expect(() => validateColumnName('_version')).not.toThrow();
      expect(() => validateColumnName('_metadata')).not.toThrow();
    });

    it('should accept nested column names with dots', () => {
      expect(() => validateColumnName('user.name')).not.toThrow();
      expect(() => validateColumnName('address.city')).not.toThrow();
      expect(() => validateColumnName('user.profile.bio')).not.toThrow();
      expect(() => validateColumnName('_meta.created_at')).not.toThrow();
    });

    it('should accept column names with numbers', () => {
      expect(() => validateColumnName('field1')).not.toThrow();
      expect(() => validateColumnName('column2')).not.toThrow();
      expect(() => validateColumnName('user123')).not.toThrow();
      expect(() => validateColumnName('data_v2')).not.toThrow();
    });

    it('should accept column names with hyphens', () => {
      expect(() => validateColumnName('first-name')).not.toThrow();
      expect(() => validateColumnName('last-name')).not.toThrow();
      expect(() => validateColumnName('user-profile-id')).not.toThrow();
    });
  });

  describe('Invalid Column Names - SQL Injection Attempts', () => {
    it('should reject column names with SQL injection attempts', () => {
      expect(() => validateColumnName("id; DROP TABLE users;--")).toThrow(/Invalid column name/);
      expect(() => validateColumnName("name' OR '1'='1")).toThrow(/Invalid column name/);
      expect(() => validateColumnName("id UNION SELECT * FROM passwords")).toThrow(/Invalid column name/);
      expect(() => validateColumnName("1; DELETE FROM users")).toThrow(/Invalid column name/);
    });

    it('should reject column names with special characters', () => {
      expect(() => validateColumnName("column'")).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column"')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column`')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column;')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column/*')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column()')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column[]')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column@')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column#')).toThrow(/Invalid column name/);
    });

    it('should reject column names with whitespace', () => {
      expect(() => validateColumnName('column name')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column\tname')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column\nname')).toThrow(/Invalid column name/);
      expect(() => validateColumnName(' column')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column ')).toThrow(/Invalid column name/);
    });

    it('should reject column names starting with numbers', () => {
      expect(() => validateColumnName('1column')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('123')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('2_field')).toThrow(/Invalid column name/);
    });

    it('should reject empty or non-string column names', () => {
      expect(() => validateColumnName('')).toThrow(/must be a non-empty string/);
      expect(() => validateColumnName(null as unknown as string)).toThrow(/must be a non-empty string/);
      expect(() => validateColumnName(undefined as unknown as string)).toThrow(/must be a non-empty string/);
      expect(() => validateColumnName(123 as unknown as string)).toThrow(/must be a non-empty string/);
    });

    it('should reject column names with consecutive dots', () => {
      expect(() => validateColumnName('user..name')).toThrow(/consecutive dots/);
      expect(() => validateColumnName('a...b')).toThrow(/consecutive dots/);
    });

    it('should reject column names starting or ending with dots', () => {
      expect(() => validateColumnName('.column')).toThrow(/Invalid column name/);
      expect(() => validateColumnName('column.')).toThrow(/start or end with a dot/);
      expect(() => validateColumnName('.nested.column.')).toThrow(/Invalid column name/);
    });

    it('should reject excessively long column names', () => {
      const longName = 'a'.repeat(257);
      expect(() => validateColumnName(longName)).toThrow(/cannot exceed 256 characters/);
    });
  });
});

// =============================================================================
// validateQueryColumns Tests
// =============================================================================

describe('validateQueryColumns', () => {
  it('should validate predicate columns', () => {
    const query: Query = {
      table: 'com/example/api/users',
      predicates: [
        { column: "id; DROP TABLE users;--", operator: 'eq', value: 1 },
      ],
    };

    expect(() => validateQueryColumns(query)).toThrow(/Invalid column name/);
  });

  it('should validate projection columns', () => {
    const query: Query = {
      table: 'com/example/api/users',
      projection: {
        columns: ['id', "name' OR '1'='1", 'email'],
      },
    };

    expect(() => validateQueryColumns(query)).toThrow(/Invalid column name/);
  });

  it('should validate aggregation columns', () => {
    const query: Query = {
      table: 'com/example/api/orders',
      aggregations: [
        { function: 'sum', column: "total; DELETE FROM orders", alias: 'total_sum' },
      ],
    };

    expect(() => validateQueryColumns(query)).toThrow(/Invalid column name/);
  });

  it('should validate aggregation aliases', () => {
    const query: Query = {
      table: 'com/example/api/orders',
      aggregations: [
        { function: 'sum', column: 'total', alias: "sum'; DROP TABLE orders;--" },
      ],
    };

    expect(() => validateQueryColumns(query)).toThrow(/Invalid column name/);
  });

  it('should validate orderBy columns', () => {
    const query: Query = {
      table: 'com/example/api/users',
      orderBy: [
        { column: "name UNION SELECT password FROM users", direction: 'asc' },
      ],
    };

    expect(() => validateQueryColumns(query)).toThrow(/Invalid column name/);
  });

  it('should validate groupBy columns', () => {
    const query: Query = {
      table: 'com/example/api/orders',
      groupBy: ["status; DROP TABLE orders;--"],
      aggregations: [
        { function: 'count', column: null, alias: 'count' },
      ],
    };

    expect(() => validateQueryColumns(query)).toThrow(/Invalid column name/);
  });

  it('should allow * in projection columns', () => {
    const query: Query = {
      table: 'com/example/api/users',
      projection: {
        columns: ['*'],
      },
    };

    expect(() => validateQueryColumns(query)).not.toThrow();
  });

  it('should allow null column in COUNT(*) aggregations', () => {
    const query: Query = {
      table: 'com/example/api/orders',
      aggregations: [
        { function: 'count', column: null, alias: 'total_count' },
      ],
    };

    expect(() => validateQueryColumns(query)).not.toThrow();
  });

  it('should accept valid complex queries', () => {
    const query: Query = {
      table: 'com/example/api/users',
      predicates: [
        { column: 'status', operator: 'eq', value: 'active' },
        { column: 'user.profile.verified', operator: 'eq', value: true },
      ],
      projection: {
        columns: ['id', 'name', 'email', 'user.profile'],
      },
      aggregations: [
        { function: 'count', column: null, alias: 'user_count' },
        { function: 'avg', column: 'age', alias: 'average_age' },
      ],
      groupBy: ['country', 'status'],
      orderBy: [
        { column: 'user_count', direction: 'desc' },
        { column: 'country', direction: 'asc' },
      ],
    };

    expect(() => validateQueryColumns(query)).not.toThrow();
  });
});

// =============================================================================
// Query Engine Integration Tests
// =============================================================================

describe('Query Engine Integration - Column Validation', () => {
  let engine: QueryEngine;

  beforeEach(() => {
    const config = createTestConfig();
    engine = createQueryEngine(config);
  });

  it('should reject queries with invalid column names in execute()', async () => {
    const query: Query = {
      table: 'com/example/api/users',
      predicates: [
        { column: "id; DROP TABLE users;--", operator: 'eq', value: 1 },
      ],
    };

    await expect(engine.execute(query)).rejects.toThrow(/Invalid column name/);
  });

  it('should reject queries with invalid column names in executeStream()', async () => {
    const query: Query = {
      table: 'com/example/api/users',
      orderBy: [
        { column: "name' OR '1'='1", direction: 'asc' },
      ],
    };

    await expect(engine.executeStream(query)).rejects.toThrow(/Invalid column name/);
  });

  it('should reject queries with invalid column names in plan()', async () => {
    const query: Query = {
      table: 'com/example/api/users',
      projection: {
        columns: ['id', 'name; DELETE FROM users;--'],
      },
    };

    await expect(engine.plan(query)).rejects.toThrow(/Invalid column name/);
  });

  it('should accept and execute valid queries', async () => {
    const query: Query = {
      table: 'com/example/api/users',
      predicates: [
        { column: 'status', operator: 'eq', value: 'active' },
      ],
      projection: {
        columns: ['id', 'name', 'email'],
      },
      orderBy: [
        { column: 'name', direction: 'asc' },
      ],
      limit: 10,
    };

    const result = await engine.execute(query);
    expect(result.rows).toBeDefined();
    expect(Array.isArray(result.rows)).toBe(true);
  });
});
