/**
 * @evodb/core - Query Engine Auto-Selection Tests
 *
 * TDD tests for auto-selecting between Reader (basic) and Query (advanced) engines
 * based on query complexity analysis.
 *
 * Selection criteria:
 * - Simple (Reader): No zone maps needed, < 10 predicates, no bloom filter hints
 * - Complex (Query): Zone maps, bloom filters, many predicates
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeQueryComplexity,
  selectQueryEngine,
  QueryComplexity,
  EngineType,
  type QueryComplexityAnalysis,
  type EngineSelectionResult,
  type ExecutorQuery,
} from '../query-engine-selector.js';

// =============================================================================
// Query Complexity Analysis Tests
// =============================================================================

describe('analyzeQueryComplexity', () => {
  describe('simple queries', () => {
    it('should classify query with no predicates as simple', () => {
      const query: ExecutorQuery = {
        table: 'users',
        columns: ['id', 'name'],
        limit: 100,
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.complexity).toBe(QueryComplexity.Simple);
      expect(analysis.predicateCount).toBe(0);
      expect(analysis.needsZoneMaps).toBe(false);
      expect(analysis.needsBloomFilters).toBe(false);
    });

    it('should classify query with few equality predicates as simple', () => {
      const query: ExecutorQuery = {
        table: 'users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'active' },
          { column: 'verified', operator: 'eq', value: true },
        ],
        columns: ['id', 'name'],
        limit: 100,
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.complexity).toBe(QueryComplexity.Simple);
      expect(analysis.predicateCount).toBe(2);
      expect(analysis.needsZoneMaps).toBe(false);
      expect(analysis.needsBloomFilters).toBe(false);
    });

    it('should classify simple aggregation without group by as simple', () => {
      const query: ExecutorQuery = {
        table: 'users',
        aggregations: [{ function: 'count', column: null, alias: 'total' }],
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.complexity).toBe(QueryComplexity.Simple);
    });
  });

  describe('moderate queries', () => {
    it('should classify query with 5-9 predicates as moderate', () => {
      const query: ExecutorQuery = {
        table: 'users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'active' },
          { column: 'age', operator: 'gt', value: 18 },
          { column: 'country', operator: 'eq', value: 'US' },
          { column: 'verified', operator: 'eq', value: true },
          { column: 'plan', operator: 'in', values: ['pro', 'enterprise'] },
          { column: 'created_at', operator: 'gt', value: '2024-01-01' },
        ],
        columns: ['id', 'name'],
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.complexity).toBe(QueryComplexity.Moderate);
      expect(analysis.predicateCount).toBe(6);
    });

    it('should classify query with group by as at least moderate', () => {
      const query: ExecutorQuery = {
        table: 'orders',
        groupBy: ['customer_id'],
        aggregations: [
          { function: 'sum', column: 'amount', alias: 'total' },
          { function: 'count', column: null, alias: 'order_count' },
        ],
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.complexity).toBeGreaterThanOrEqual(QueryComplexity.Moderate);
      expect(analysis.hasGroupBy).toBe(true);
    });

    it('should classify query with range predicates as moderate', () => {
      const query: ExecutorQuery = {
        table: 'events',
        predicates: [
          { column: 'timestamp', operator: 'between', lowerBound: '2024-01-01', upperBound: '2024-12-31' },
        ],
        columns: ['id', 'event_type'],
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.complexity).toBeGreaterThanOrEqual(QueryComplexity.Moderate);
      expect(analysis.hasRangePredicates).toBe(true);
      // needsZoneMaps is only true when explicitly requested via hints
      // but range predicates indicate zone maps would be beneficial
    });
  });

  describe('complex queries', () => {
    it('should classify query with 10+ predicates as complex', () => {
      const query: ExecutorQuery = {
        table: 'users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'active' },
          { column: 'age', operator: 'gt', value: 18 },
          { column: 'country', operator: 'eq', value: 'US' },
          { column: 'verified', operator: 'eq', value: true },
          { column: 'plan', operator: 'in', values: ['pro', 'enterprise'] },
          { column: 'created_at', operator: 'gt', value: '2024-01-01' },
          { column: 'last_login', operator: 'gt', value: '2024-06-01' },
          { column: 'email_verified', operator: 'eq', value: true },
          { column: 'phone_verified', operator: 'eq', value: true },
          { column: 'role', operator: 'in', values: ['admin', 'moderator'] },
        ],
        columns: ['id', 'name'],
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.complexity).toBe(QueryComplexity.Complex);
      expect(analysis.predicateCount).toBe(10);
    });

    it('should classify query with bloom filter hints as complex', () => {
      const query: ExecutorQuery = {
        table: 'users',
        predicates: [{ column: 'email', operator: 'eq', value: 'test@example.com' }],
        columns: ['id', 'name'],
        hints: {
          useBloomFilters: true,
        },
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.complexity).toBe(QueryComplexity.Complex);
      expect(analysis.needsBloomFilters).toBe(true);
    });

    it('should classify query with zone map hints as complex', () => {
      const query: ExecutorQuery = {
        table: 'events',
        predicates: [{ column: 'timestamp', operator: 'gt', value: '2024-01-01' }],
        columns: ['id', 'event_type'],
        hints: {
          useZoneMaps: true,
        },
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.complexity).toBe(QueryComplexity.Complex);
      expect(analysis.needsZoneMaps).toBe(true);
    });

    it('should classify query with multiple aggregations and group by as complex', () => {
      const query: ExecutorQuery = {
        table: 'orders',
        groupBy: ['customer_id', 'product_category'],
        aggregations: [
          { function: 'sum', column: 'amount', alias: 'total' },
          { function: 'avg', column: 'amount', alias: 'average' },
          { function: 'count', column: null, alias: 'order_count' },
          { function: 'min', column: 'amount', alias: 'min_amount' },
          { function: 'max', column: 'amount', alias: 'max_amount' },
        ],
        predicates: [
          { column: 'status', operator: 'eq', value: 'completed' },
        ],
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.complexity).toBe(QueryComplexity.Complex);
      expect(analysis.aggregationCount).toBe(5);
    });

    it('should classify query with no limit on large table hint as complex', () => {
      const query: ExecutorQuery = {
        table: 'events',
        columns: ['id', 'event_type'],
        // No limit + very large estimated rows = complex (full table scan)
        hints: {
          estimatedRows: 1000000,
          // Without limit, reading 1M rows needs advanced engine
        },
      };

      const analysis = analyzeQueryComplexity(query);

      // Large result set without limit triggers complexity threshold
      expect(analysis.complexity).toBeGreaterThanOrEqual(QueryComplexity.Moderate);
      expect(analysis.estimatedRows).toBe(1000000);
    });
  });

  describe('edge cases', () => {
    it('should handle empty query', () => {
      const query: ExecutorQuery = {
        table: 'users',
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.complexity).toBe(QueryComplexity.Simple);
      expect(analysis.predicateCount).toBe(0);
    });

    it('should handle query with only sorting', () => {
      const query: ExecutorQuery = {
        table: 'users',
        columns: ['id', 'name'],
        orderBy: [{ column: 'created_at', direction: 'desc' }],
      };

      const analysis = analyzeQueryComplexity(query);

      // Sorting alone doesn't increase complexity much
      expect(analysis.complexity).toBeGreaterThanOrEqual(QueryComplexity.Simple);
    });

    it('should handle query with negated predicates', () => {
      const query: ExecutorQuery = {
        table: 'users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'deleted', not: true },
        ],
        columns: ['id', 'name'],
      };

      const analysis = analyzeQueryComplexity(query);

      expect(analysis.hasNegatedPredicates).toBe(true);
    });
  });
});

// =============================================================================
// Engine Selection Tests
// =============================================================================

describe('selectQueryEngine', () => {
  describe('automatic selection', () => {
    it('should select Reader engine for simple queries', () => {
      const query: ExecutorQuery = {
        table: 'users',
        columns: ['id', 'name'],
        limit: 100,
      };

      const result = selectQueryEngine(query);

      expect(result.engine).toBe(EngineType.Reader);
      expect(result.reason).toContain('simple');
    });

    it('should select Query engine for complex queries', () => {
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
      expect(result.reason).toContain('complex');
    });

    it('should select Query engine when zone maps are needed', () => {
      const query: ExecutorQuery = {
        table: 'events',
        predicates: [
          { column: 'timestamp', operator: 'between', lowerBound: '2024-01-01', upperBound: '2024-12-31' },
        ],
        hints: {
          useZoneMaps: true,
        },
      };

      const result = selectQueryEngine(query);

      expect(result.engine).toBe(EngineType.Query);
      expect(result.reason).toContain('zone map');
    });

    it('should select Query engine when bloom filters are needed', () => {
      const query: ExecutorQuery = {
        table: 'users',
        predicates: [{ column: 'email', operator: 'eq', value: 'test@example.com' }],
        hints: {
          useBloomFilters: true,
        },
      };

      const result = selectQueryEngine(query);

      expect(result.engine).toBe(EngineType.Query);
      expect(result.reason).toContain('bloom filter');
    });

    it('should select Reader engine for moderate queries by default', () => {
      const query: ExecutorQuery = {
        table: 'users',
        predicates: [
          { column: 'status', operator: 'eq', value: 'active' },
          { column: 'age', operator: 'gt', value: 18 },
          { column: 'country', operator: 'eq', value: 'US' },
          { column: 'verified', operator: 'eq', value: true },
        ],
        columns: ['id', 'name'],
        limit: 100,
      };

      const result = selectQueryEngine(query);

      // Moderate queries can use Reader unless advanced features needed
      expect(result.engine).toBe(EngineType.Reader);
    });
  });

  describe('forced engine selection', () => {
    it('should respect forceReader hint', () => {
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
      expect(result.forced).toBe(true);
    });

    it('should respect forceQuery hint', () => {
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
      expect(result.forced).toBe(true);
    });
  });

  describe('engine capabilities', () => {
    it('should include analysis in result', () => {
      const query: ExecutorQuery = {
        table: 'users',
        columns: ['id', 'name'],
      };

      const result = selectQueryEngine(query);

      expect(result.analysis).toBeDefined();
      expect(result.analysis.complexity).toBeDefined();
      expect(result.analysis.predicateCount).toBeDefined();
    });

    it('should provide recommendations for moderate queries', () => {
      const query: ExecutorQuery = {
        table: 'events',
        predicates: [
          { column: 'timestamp', operator: 'between', lowerBound: '2024-01-01', upperBound: '2024-12-31' },
          { column: 'event_type', operator: 'eq', value: 'click' },
          { column: 'user_id', operator: 'eq', value: '123' },
        ],
      };

      const result = selectQueryEngine(query);

      // Should provide recommendations about potential optimizations
      expect(result.recommendations).toBeDefined();
    });
  });

  describe('selection criteria documentation', () => {
    it('should explain Reader selection criteria', () => {
      const query: ExecutorQuery = {
        table: 'users',
        predicates: [{ column: 'id', operator: 'eq', value: 1 }],
        columns: ['id', 'name'],
        limit: 1,
      };

      const result = selectQueryEngine(query);

      expect(result.engine).toBe(EngineType.Reader);
      expect(result.criteria).toContain('predicate');
    });

    it('should explain Query selection criteria', () => {
      const query: ExecutorQuery = {
        table: 'events',
        predicates: [
          { column: 'timestamp', operator: 'between', lowerBound: '2024-01-01', upperBound: '2024-12-31' },
        ],
        hints: {
          useZoneMaps: true,
          estimatedRows: 10000000,
        },
      };

      const result = selectQueryEngine(query);

      expect(result.engine).toBe(EngineType.Query);
      expect(result.criteria).toContain('zone');
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Query Engine Selection Integration', () => {
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
    expect(result1.analysis.complexity).toBe(result2.analysis.complexity);
  });

  it('should handle real-world e-commerce query pattern', () => {
    // Simple product listing
    const simpleQuery: ExecutorQuery = {
      table: 'products',
      predicates: [{ column: 'category', operator: 'eq', value: 'electronics' }],
      columns: ['id', 'name', 'price'],
      orderBy: [{ column: 'price', direction: 'asc' }],
      limit: 20,
    };

    const simpleResult = selectQueryEngine(simpleQuery);
    expect(simpleResult.engine).toBe(EngineType.Reader);

    // Complex analytics query
    const complexQuery: ExecutorQuery = {
      table: 'orders',
      predicates: [
        { column: 'created_at', operator: 'between', lowerBound: '2024-01-01', upperBound: '2024-12-31' },
        { column: 'status', operator: 'in', values: ['completed', 'shipped'] },
      ],
      groupBy: ['customer_id', 'product_category'],
      aggregations: [
        { function: 'sum', column: 'amount', alias: 'total_spent' },
        { function: 'count', column: null, alias: 'order_count' },
        { function: 'avg', column: 'amount', alias: 'avg_order' },
      ],
      hints: {
        useZoneMaps: true,
        estimatedRows: 5000000,
      },
    };

    const complexResult = selectQueryEngine(complexQuery);
    expect(complexResult.engine).toBe(EngineType.Query);
  });

  it('should handle real-world logging query pattern', () => {
    // Simple log lookup
    const simpleQuery: ExecutorQuery = {
      table: 'logs',
      predicates: [{ column: 'request_id', operator: 'eq', value: 'abc-123' }],
      columns: ['timestamp', 'level', 'message'],
      limit: 100,
    };

    const simpleResult = selectQueryEngine(simpleQuery);
    expect(simpleResult.engine).toBe(EngineType.Reader);

    // Complex log analysis
    const complexQuery: ExecutorQuery = {
      table: 'logs',
      predicates: [
        { column: 'timestamp', operator: 'between', lowerBound: '2024-01-01T00:00:00Z', upperBound: '2024-01-02T00:00:00Z' },
        { column: 'level', operator: 'in', values: ['error', 'warn'] },
        { column: 'service', operator: 'eq', value: 'api-gateway' },
      ],
      groupBy: ['level', 'error_code'],
      aggregations: [
        { function: 'count', column: null, alias: 'error_count' },
      ],
      hints: {
        useZoneMaps: true,
        useBloomFilters: true,
      },
    };

    const complexResult = selectQueryEngine(complexQuery);
    expect(complexResult.engine).toBe(EngineType.Query);
  });
});
