/**
 * @evodb/core - Query Engine Auto-Selection Tests
 *
 * TDD tests for auto-selecting between Reader (basic) and Query (advanced) engines
 * based on simple heuristics.
 *
 * Selection criteria:
 * - Query Engine: >5 predicates, aggregations, GROUP BY, or explicit hints
 * - Reader Engine: Everything else (simple lookups)
 */

import { describe, it, expect } from 'vitest';
import {
  selectQueryEngine,
  needsQueryEngine,
  EngineType,
  type EngineSelectionResult,
} from '../query-engine-selector.js';
import type { ExecutorQuery } from '../query-executor.js';

// =============================================================================
// Simple Query Tests (Reader Engine)
// =============================================================================

describe('selectQueryEngine - simple queries (Reader)', () => {
  it('should select Reader for query with no predicates', () => {
    const query: ExecutorQuery = {
      table: 'users',
      columns: ['id', 'name'],
      limit: 100,
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Reader);
    expect(result.reason).toBe('Simple query');
  });

  it('should select Reader for query with few predicates (<=5)', () => {
    const query: ExecutorQuery = {
      table: 'users',
      predicates: [
        { column: 'status', operator: 'eq', value: 'active' },
        { column: 'verified', operator: 'eq', value: true },
        { column: 'country', operator: 'eq', value: 'US' },
      ],
      columns: ['id', 'name'],
      limit: 100,
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Reader);
    expect(result.reason).toBe('Simple query');
  });

  it('should select Reader for exactly 5 predicates', () => {
    const query: ExecutorQuery = {
      table: 'users',
      predicates: [
        { column: 'a', operator: 'eq', value: 1 },
        { column: 'b', operator: 'eq', value: 2 },
        { column: 'c', operator: 'eq', value: 3 },
        { column: 'd', operator: 'eq', value: 4 },
        { column: 'e', operator: 'eq', value: 5 },
      ],
      columns: ['id'],
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Reader);
  });

  it('should select Reader for empty query', () => {
    const query: ExecutorQuery = {
      table: 'users',
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Reader);
  });

  it('should select Reader for query with only sorting', () => {
    const query: ExecutorQuery = {
      table: 'users',
      columns: ['id', 'name'],
      orderBy: [{ column: 'created_at', direction: 'desc' }],
      limit: 100,
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Reader);
  });
});

// =============================================================================
// Complex Query Tests (Query Engine)
// =============================================================================

describe('selectQueryEngine - complex queries (Query)', () => {
  it('should select Query for more than 5 predicates', () => {
    const query: ExecutorQuery = {
      table: 'users',
      predicates: [
        { column: 'a', operator: 'eq', value: 1 },
        { column: 'b', operator: 'eq', value: 2 },
        { column: 'c', operator: 'eq', value: 3 },
        { column: 'd', operator: 'eq', value: 4 },
        { column: 'e', operator: 'eq', value: 5 },
        { column: 'f', operator: 'eq', value: 6 },
      ],
      columns: ['id'],
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Query);
    expect(result.reason).toContain('predicates');
    expect(result.reason).toContain('6');
  });

  it('should select Query for 10 predicates', () => {
    const query: ExecutorQuery = {
      table: 'users',
      predicates: Array.from({ length: 10 }, (_, i) => ({
        column: `field_${i}`,
        operator: 'eq' as const,
        value: i,
      })),
      columns: ['id', 'name'],
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Query);
    expect(result.reason).toContain('10');
  });

  it('should select Query for any aggregations', () => {
    const query: ExecutorQuery = {
      table: 'users',
      aggregations: [{ function: 'count', column: null, alias: 'total' }],
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Query);
    expect(result.reason).toContain('aggregations');
  });

  it('should select Query for GROUP BY', () => {
    const query: ExecutorQuery = {
      table: 'orders',
      groupBy: ['customer_id'],
      aggregations: [{ function: 'sum', column: 'amount', alias: 'total' }],
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Query);
    // Could match aggregations or GROUP BY first
    expect(
      result.reason.includes('aggregations') || result.reason.includes('GROUP BY')
    ).toBe(true);
  });

  it('should select Query for multiple aggregations', () => {
    const query: ExecutorQuery = {
      table: 'orders',
      groupBy: ['customer_id'],
      aggregations: [
        { function: 'sum', column: 'amount', alias: 'total' },
        { function: 'avg', column: 'amount', alias: 'average' },
        { function: 'count', column: null, alias: 'count' },
      ],
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Query);
  });
});

// =============================================================================
// Hint-based Selection Tests
// =============================================================================

describe('selectQueryEngine - hints', () => {
  it('should respect forceEngine=reader hint', () => {
    const query: ExecutorQuery = {
      table: 'users',
      predicates: Array.from({ length: 15 }, (_, i) => ({
        column: `field_${i}`,
        operator: 'eq' as const,
        value: i,
      })),
      hints: {
        forceEngine: 'reader',
      },
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Reader);
    expect(result.reason).toContain('Forced');
  });

  it('should respect forceEngine=query hint', () => {
    const query: ExecutorQuery = {
      table: 'users',
      columns: ['id'],
      limit: 1,
      hints: {
        forceEngine: 'query',
      },
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Query);
    expect(result.reason).toContain('Forced');
  });

  it('should select Query for useZoneMaps hint', () => {
    const query: ExecutorQuery = {
      table: 'events',
      predicates: [{ column: 'timestamp', operator: 'gt', value: '2024-01-01' }],
      hints: {
        useZoneMaps: true,
      },
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Query);
    expect(result.reason).toContain('Zone maps');
  });

  it('should select Query for useBloomFilters hint', () => {
    const query: ExecutorQuery = {
      table: 'users',
      predicates: [{ column: 'email', operator: 'eq', value: 'test@example.com' }],
      hints: {
        useBloomFilters: true,
      },
    };

    const result = selectQueryEngine(query);

    expect(result.engine).toBe(EngineType.Query);
    expect(result.reason).toContain('Bloom filters');
  });
});

// =============================================================================
// needsQueryEngine Helper Tests
// =============================================================================

describe('needsQueryEngine', () => {
  it('should return false for simple queries', () => {
    const query: ExecutorQuery = {
      table: 'users',
      predicates: [{ column: 'id', operator: 'eq', value: 1 }],
      limit: 1,
    };

    expect(needsQueryEngine(query)).toBe(false);
  });

  it('should return true for queries with aggregations', () => {
    const query: ExecutorQuery = {
      table: 'users',
      aggregations: [{ function: 'count', column: null, alias: 'total' }],
    };

    expect(needsQueryEngine(query)).toBe(true);
  });

  it('should return true for queries with many predicates', () => {
    const query: ExecutorQuery = {
      table: 'users',
      predicates: Array.from({ length: 6 }, (_, i) => ({
        column: `field_${i}`,
        operator: 'eq' as const,
        value: i,
      })),
    };

    expect(needsQueryEngine(query)).toBe(true);
  });
});

// =============================================================================
// Integration / Real-world Pattern Tests
// =============================================================================

describe('selectQueryEngine - real-world patterns', () => {
  it('should select Reader for simple product listing', () => {
    const query: ExecutorQuery = {
      table: 'products',
      predicates: [{ column: 'category', operator: 'eq', value: 'electronics' }],
      columns: ['id', 'name', 'price'],
      orderBy: [{ column: 'price', direction: 'asc' }],
      limit: 20,
    };

    const result = selectQueryEngine(query);
    expect(result.engine).toBe(EngineType.Reader);
  });

  it('should select Reader for simple log lookup', () => {
    const query: ExecutorQuery = {
      table: 'logs',
      predicates: [{ column: 'request_id', operator: 'eq', value: 'abc-123' }],
      columns: ['timestamp', 'level', 'message'],
      limit: 100,
    };

    const result = selectQueryEngine(query);
    expect(result.engine).toBe(EngineType.Reader);
  });

  it('should select Query for analytics with aggregation', () => {
    const query: ExecutorQuery = {
      table: 'orders',
      predicates: [
        { column: 'created_at', operator: 'between', lowerBound: '2024-01-01', upperBound: '2024-12-31' },
        { column: 'status', operator: 'in', values: ['completed', 'shipped'] },
      ],
      groupBy: ['customer_id', 'product_category'],
      aggregations: [
        { function: 'sum', column: 'amount', alias: 'total_spent' },
        { function: 'count', column: null, alias: 'order_count' },
      ],
    };

    const result = selectQueryEngine(query);
    expect(result.engine).toBe(EngineType.Query);
  });

  it('should select Query for log analysis with GROUP BY', () => {
    const query: ExecutorQuery = {
      table: 'logs',
      predicates: [
        { column: 'timestamp', operator: 'between', lowerBound: '2024-01-01T00:00:00Z', upperBound: '2024-01-02T00:00:00Z' },
        { column: 'level', operator: 'in', values: ['error', 'warn'] },
      ],
      groupBy: ['level', 'error_code'],
      aggregations: [
        { function: 'count', column: null, alias: 'error_count' },
      ],
    };

    const result = selectQueryEngine(query);
    expect(result.engine).toBe(EngineType.Query);
  });

  it('should consistently select same engine for identical queries', () => {
    const query: ExecutorQuery = {
      table: 'users',
      predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
      columns: ['id', 'name'],
      limit: 100,
    };

    const result1 = selectQueryEngine(query);
    const result2 = selectQueryEngine(query);

    expect(result1.engine).toBe(result2.engine);
    expect(result1.reason).toBe(result2.reason);
  });
});
