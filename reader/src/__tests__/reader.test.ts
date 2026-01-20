/**
 * @evodb/reader - RED Phase Tests
 * Worker-based query engine for R2 + Cache API
 *
 * These tests define the expected API and behavior.
 * All tests should FAIL initially (RED phase).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createQueryEngine,
  QueryEngine,
  QueryRequest,
  QueryResult,
  FilterPredicate,
  SortSpec,
  AggregateSpec,
} from '../index.js';
import type { R2Bucket, R2Object, CacheStats } from '../types.js';

// ============================================================================
// Test Utilities - Mock R2 Bucket
// ============================================================================

function createMockR2Object(key: string, data: unknown): R2Object {
  const buffer = new TextEncoder().encode(JSON.stringify(data)).buffer;
  return {
    key,
    size: buffer.byteLength,
    etag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
    httpEtag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
    uploaded: new Date(),
    customMetadata: {},
    arrayBuffer: vi.fn().mockResolvedValue(buffer),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    json: vi.fn().mockResolvedValue(data),
  };
}

function createMockR2Bucket(objects: Map<string, unknown>): R2Bucket {
  return {
    get: vi.fn(async (key: string) => {
      if (!objects.has(key)) return null;
      const data = objects.get(key);
      return createMockR2Object(key, data);
    }),
    head: vi.fn(async (key: string) => {
      if (!objects.has(key)) return null;
      const data = objects.get(key);
      return createMockR2Object(key, data);
    }),
    list: vi.fn(async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
      const prefix = options?.prefix || '';
      const matchingKeys = Array.from(objects.keys()).filter((k) => k.startsWith(prefix));
      return {
        objects: matchingKeys.map((k) => createMockR2Object(k, objects.get(k))),
        truncated: false,
        cursor: undefined,
      };
    }),
  };
}

// ============================================================================
// Sample Data for Tests
// ============================================================================

// Manifest describing table structure
const SAMPLE_MANIFEST = {
  version: 1,
  tables: {
    events: {
      name: 'events',
      schema: [
        { name: 'id', type: 'int64', nullable: false },
        { name: 'user_id', type: 'string', nullable: false },
        { name: 'event_type', type: 'string', nullable: false },
        { name: 'timestamp', type: 'timestamp', nullable: false },
        { name: 'status', type: 'string', nullable: true },
        { name: 'amount', type: 'float64', nullable: true },
      ],
      blockPaths: ['data/events/block_001.json', 'data/events/block_002.json'],
      rowCount: 100,
      lastUpdated: Date.now(),
    },
    users: {
      name: 'users',
      schema: [
        { name: 'id', type: 'string', nullable: false },
        { name: 'name', type: 'string', nullable: false },
        { name: 'email', type: 'string', nullable: false },
        { name: 'created_at', type: 'timestamp', nullable: false },
      ],
      blockPaths: ['data/users/block_001.json'],
      rowCount: 50,
      lastUpdated: Date.now(),
    },
  },
};

// Sample data blocks (columnar format)
const SAMPLE_BLOCK_1 = {
  id: [1, 2, 3, 4, 5],
  user_id: ['u1', 'u2', 'u1', 'u3', 'u2'],
  event_type: ['click', 'view', 'click', 'purchase', 'view'],
  timestamp: [1700000000000, 1700000001000, 1700000002000, 1700000003000, 1700000004000],
  status: ['active', 'active', 'pending', 'completed', 'active'],
  amount: [null, null, null, 99.99, null],
};

const SAMPLE_BLOCK_2 = {
  id: [6, 7, 8, 9, 10],
  user_id: ['u1', 'u4', 'u2', 'u1', 'u5'],
  event_type: ['purchase', 'click', 'purchase', 'view', 'click'],
  timestamp: [1700000005000, 1700000006000, 1700000007000, 1700000008000, 1700000009000],
  status: ['completed', 'active', 'completed', 'active', 'pending'],
  amount: [149.99, null, 29.99, null, null],
};

const SAMPLE_USERS_BLOCK = {
  id: ['u1', 'u2', 'u3', 'u4', 'u5'],
  name: ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'],
  email: ['alice@test.com', 'bob@test.com', 'charlie@test.com', 'diana@test.com', 'eve@test.com'],
  created_at: [1699000000000, 1699100000000, 1699200000000, 1699300000000, 1699400000000],
};

// ============================================================================
// Query Engine Creation Tests
// ============================================================================

describe('QueryEngine Creation', () => {
  it('should create query engine with R2 bucket', () => {
    const bucket = createMockR2Bucket(new Map());
    const engine = createQueryEngine({ bucket });

    expect(engine).toBeDefined();
    expect(engine).toBeInstanceOf(QueryEngine);
  });

  it('should accept cache configuration options', () => {
    const bucket = createMockR2Bucket(new Map());
    const engine = createQueryEngine({
      bucket,
      cache: {
        enableCacheApi: true,
        cacheTtlSeconds: 7200,
        cacheKeyPrefix: 'custom:',
      },
    });

    expect(engine).toBeDefined();
  });

  it('should accept concurrency configuration', () => {
    const bucket = createMockR2Bucket(new Map());
    const engine = createQueryEngine({
      bucket,
      maxConcurrentReads: 8,
    });

    expect(engine).toBeDefined();
  });

  it('should initialize with empty cache stats', () => {
    const bucket = createMockR2Bucket(new Map());
    const engine = createQueryEngine({ bucket });

    const stats = engine.getCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.bytesServedFromCache).toBe(0);
    expect(stats.bytesReadFromR2).toBe(0);
  });
});

// ============================================================================
// Basic Query Execution Tests
// ============================================================================

describe('Query Execution', () => {
  let bucket: R2Bucket;
  let engine: QueryEngine;

  beforeEach(() => {
    const objects = new Map<string, unknown>([
      ['manifest.json', SAMPLE_MANIFEST],
      ['data/events/block_001.json', SAMPLE_BLOCK_1],
      ['data/events/block_002.json', SAMPLE_BLOCK_2],
      ['data/users/block_001.json', SAMPLE_USERS_BLOCK],
    ]);
    bucket = createMockR2Bucket(objects);
    engine = createQueryEngine({ bucket });
  });

  it('should execute simple select all query', async () => {
    const result = await engine.query({
      table: 'events',
    });

    expect(result).toBeDefined();
    expect(result.columns).toContain('id');
    expect(result.columns).toContain('user_id');
    expect(result.columns).toContain('event_type');
    expect(result.rows.length).toBe(10); // All rows from both blocks
    expect(result.stats).toBeDefined();
    expect(result.stats.rowsReturned).toBe(10);
  });

  it('should return query statistics', async () => {
    const result = await engine.query({
      table: 'events',
    });

    expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.blocksScanned).toBe(2);
    expect(result.stats.rowsScanned).toBe(10);
    expect(result.stats.rowsReturned).toBe(10);
    expect(typeof result.stats.cacheHitRatio).toBe('number');
  });

  it('should throw error for non-existent table', async () => {
    await expect(
      engine.query({ table: 'nonexistent' })
    ).rejects.toThrow(/table.*not found/i);
  });
});

// ============================================================================
// Column Projection Tests
// ============================================================================

describe('Column Projection', () => {
  let bucket: R2Bucket;
  let engine: QueryEngine;

  beforeEach(() => {
    const objects = new Map<string, unknown>([
      ['manifest.json', SAMPLE_MANIFEST],
      ['data/events/block_001.json', SAMPLE_BLOCK_1],
      ['data/events/block_002.json', SAMPLE_BLOCK_2],
    ]);
    bucket = createMockR2Bucket(objects);
    engine = createQueryEngine({ bucket });
  });

  it('should select specific columns', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['user_id', 'timestamp'],
    });

    expect(result.columns).toHaveLength(2);
    expect(result.columns).toContain('user_id');
    expect(result.columns).toContain('timestamp');
    expect(result.columns).not.toContain('id');
    expect(result.columns).not.toContain('event_type');
  });

  it('should return columns in specified order', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['timestamp', 'user_id', 'id'],
    });

    expect(result.columns).toEqual(['timestamp', 'user_id', 'id']);
  });

  it('should throw error for non-existent column', async () => {
    await expect(
      engine.query({
        table: 'events',
        columns: ['user_id', 'nonexistent_column'],
      })
    ).rejects.toThrow(/column.*not found/i);
  });

  it('should select single column', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['event_type'],
    });

    expect(result.columns).toEqual(['event_type']);
    expect(result.rows.every((row) => row.length === 1)).toBe(true);
  });
});

// ============================================================================
// Filter Predicate Tests
// ============================================================================

describe('Filter Predicates', () => {
  let bucket: R2Bucket;
  let engine: QueryEngine;

  beforeEach(() => {
    const objects = new Map<string, unknown>([
      ['manifest.json', SAMPLE_MANIFEST],
      ['data/events/block_001.json', SAMPLE_BLOCK_1],
      ['data/events/block_002.json', SAMPLE_BLOCK_2],
    ]);
    bucket = createMockR2Bucket(objects);
    engine = createQueryEngine({ bucket });
  });

  it('should filter with eq operator', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [{ column: 'status', operator: 'eq', value: 'active' }],
    });

    expect(result.rows.length).toBeGreaterThan(0);
    // Get status column index
    const statusIdx = result.columns.indexOf('status');
    expect(result.rows.every((row) => row[statusIdx] === 'active')).toBe(true);
  });

  it('should filter with ne operator', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [{ column: 'status', operator: 'ne', value: 'active' }],
    });

    const statusIdx = result.columns.indexOf('status');
    expect(result.rows.every((row) => row[statusIdx] !== 'active')).toBe(true);
  });

  it('should filter with gt operator', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [{ column: 'id', operator: 'gt', value: 5 }],
    });

    const idIdx = result.columns.indexOf('id');
    expect(result.rows.every((row) => (row[idIdx] as number) > 5)).toBe(true);
    expect(result.rows.length).toBe(5); // IDs 6-10
  });

  it('should filter with lt operator', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [{ column: 'id', operator: 'lt', value: 3 }],
    });

    const idIdx = result.columns.indexOf('id');
    expect(result.rows.every((row) => (row[idIdx] as number) < 3)).toBe(true);
    expect(result.rows.length).toBe(2); // IDs 1, 2
  });

  it('should filter with ge operator', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [{ column: 'id', operator: 'ge', value: 8 }],
    });

    const idIdx = result.columns.indexOf('id');
    expect(result.rows.every((row) => (row[idIdx] as number) >= 8)).toBe(true);
    expect(result.rows.length).toBe(3); // IDs 8, 9, 10
  });

  it('should filter with le operator', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [{ column: 'id', operator: 'le', value: 2 }],
    });

    const idIdx = result.columns.indexOf('id');
    expect(result.rows.every((row) => (row[idIdx] as number) <= 2)).toBe(true);
    expect(result.rows.length).toBe(2); // IDs 1, 2
  });

  it('should filter with in operator', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [{ column: 'event_type', operator: 'in', values: ['click', 'purchase'] }],
    });

    const typeIdx = result.columns.indexOf('event_type');
    expect(result.rows.every((row) => ['click', 'purchase'].includes(row[typeIdx] as string))).toBe(
      true
    );
  });

  it('should filter with notIn operator', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [{ column: 'event_type', operator: 'notIn', values: ['view'] }],
    });

    const typeIdx = result.columns.indexOf('event_type');
    expect(result.rows.every((row) => row[typeIdx] !== 'view')).toBe(true);
  });

  it('should filter with isNull operator', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['id', 'amount'],
      filters: [{ column: 'amount', operator: 'isNull' }],
    });

    const amountIdx = result.columns.indexOf('amount');
    expect(result.rows.every((row) => row[amountIdx] === null)).toBe(true);
  });

  it('should filter with isNotNull operator', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['id', 'amount'],
      filters: [{ column: 'amount', operator: 'isNotNull' }],
    });

    const amountIdx = result.columns.indexOf('amount');
    expect(result.rows.every((row) => row[amountIdx] !== null)).toBe(true);
    expect(result.rows.length).toBe(3); // Three purchases with amounts
  });

  it('should filter with like operator', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [{ column: 'status', operator: 'like', value: 'act%' }],
    });

    const statusIdx = result.columns.indexOf('status');
    expect(result.rows.every((row) => (row[statusIdx] as string).startsWith('act'))).toBe(true);
  });

  it('should filter with between operator', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [{ column: 'id', operator: 'between', lowerBound: 3, upperBound: 7 }],
    });

    const idIdx = result.columns.indexOf('id');
    expect(
      result.rows.every((row) => {
        const id = row[idIdx] as number;
        return id >= 3 && id <= 7;
      })
    ).toBe(true);
    expect(result.rows.length).toBe(5); // IDs 3, 4, 5, 6, 7
  });

  it('should combine multiple filters with AND logic', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [
        { column: 'status', operator: 'eq', value: 'active' },
        { column: 'event_type', operator: 'eq', value: 'view' },
      ],
    });

    const statusIdx = result.columns.indexOf('status');
    const typeIdx = result.columns.indexOf('event_type');
    expect(
      result.rows.every((row) => row[statusIdx] === 'active' && row[typeIdx] === 'view')
    ).toBe(true);
  });
});

// ============================================================================
// Aggregation Tests
// ============================================================================

describe('Aggregations', () => {
  let bucket: R2Bucket;
  let engine: QueryEngine;

  beforeEach(() => {
    const objects = new Map<string, unknown>([
      ['manifest.json', SAMPLE_MANIFEST],
      ['data/events/block_001.json', SAMPLE_BLOCK_1],
      ['data/events/block_002.json', SAMPLE_BLOCK_2],
    ]);
    bucket = createMockR2Bucket(objects);
    engine = createQueryEngine({ bucket });
  });

  it('should compute count(*)', async () => {
    const result = await engine.query({
      table: 'events',
      aggregates: [{ function: 'count', alias: 'total' }],
    });

    expect(result.columns).toContain('total');
    expect(result.rows.length).toBe(1);
    const totalIdx = result.columns.indexOf('total');
    expect(result.rows[0][totalIdx]).toBe(10);
  });

  it('should compute count(column) excluding nulls', async () => {
    const result = await engine.query({
      table: 'events',
      aggregates: [{ function: 'count', column: 'amount', alias: 'amount_count' }],
    });

    const countIdx = result.columns.indexOf('amount_count');
    expect(result.rows[0][countIdx]).toBe(3); // Only 3 non-null amounts
  });

  it('should compute sum', async () => {
    const result = await engine.query({
      table: 'events',
      aggregates: [{ function: 'sum', column: 'amount', alias: 'total_amount' }],
    });

    const sumIdx = result.columns.indexOf('total_amount');
    // 99.99 + 149.99 + 29.99 = 279.97
    expect(result.rows[0][sumIdx]).toBeCloseTo(279.97, 2);
  });

  it('should compute avg', async () => {
    const result = await engine.query({
      table: 'events',
      aggregates: [{ function: 'avg', column: 'amount', alias: 'avg_amount' }],
    });

    const avgIdx = result.columns.indexOf('avg_amount');
    // 279.97 / 3 = 93.32...
    expect(result.rows[0][avgIdx]).toBeCloseTo(93.32, 2);
  });

  it('should compute min', async () => {
    const result = await engine.query({
      table: 'events',
      aggregates: [{ function: 'min', column: 'amount', alias: 'min_amount' }],
    });

    const minIdx = result.columns.indexOf('min_amount');
    expect(result.rows[0][minIdx]).toBe(29.99);
  });

  it('should compute max', async () => {
    const result = await engine.query({
      table: 'events',
      aggregates: [{ function: 'max', column: 'amount', alias: 'max_amount' }],
    });

    const maxIdx = result.columns.indexOf('max_amount');
    expect(result.rows[0][maxIdx]).toBe(149.99);
  });

  it('should compute countDistinct', async () => {
    const result = await engine.query({
      table: 'events',
      aggregates: [{ function: 'countDistinct', column: 'user_id', alias: 'unique_users' }],
    });

    const countIdx = result.columns.indexOf('unique_users');
    expect(result.rows[0][countIdx]).toBe(5); // u1, u2, u3, u4, u5
  });

  it('should compute multiple aggregations', async () => {
    const result = await engine.query({
      table: 'events',
      aggregates: [
        { function: 'count', alias: 'total' },
        { function: 'sum', column: 'amount', alias: 'total_amount' },
        { function: 'avg', column: 'amount', alias: 'avg_amount' },
      ],
    });

    expect(result.columns).toContain('total');
    expect(result.columns).toContain('total_amount');
    expect(result.columns).toContain('avg_amount');
    expect(result.rows.length).toBe(1);
  });

  it('should apply filters before aggregation', async () => {
    const result = await engine.query({
      table: 'events',
      filters: [{ column: 'status', operator: 'eq', value: 'completed' }],
      aggregates: [
        { function: 'count', alias: 'completed_count' },
        { function: 'sum', column: 'amount', alias: 'completed_amount' },
      ],
    });

    const countIdx = result.columns.indexOf('completed_count');
    const sumIdx = result.columns.indexOf('completed_amount');
    expect(result.rows[0][countIdx]).toBe(3); // 3 completed events
    // 99.99 + 149.99 + 29.99 = 279.97
    expect(result.rows[0][sumIdx]).toBeCloseTo(279.97, 2);
  });
});

// ============================================================================
// Group By Tests
// ============================================================================

describe('Group By', () => {
  let bucket: R2Bucket;
  let engine: QueryEngine;

  beforeEach(() => {
    const objects = new Map<string, unknown>([
      ['manifest.json', SAMPLE_MANIFEST],
      ['data/events/block_001.json', SAMPLE_BLOCK_1],
      ['data/events/block_002.json', SAMPLE_BLOCK_2],
    ]);
    bucket = createMockR2Bucket(objects);
    engine = createQueryEngine({ bucket });
  });

  it('should group by single column', async () => {
    const result = await engine.query({
      table: 'events',
      groupBy: ['event_type'],
      aggregates: [{ function: 'count', alias: 'count' }],
    });

    expect(result.columns).toContain('event_type');
    expect(result.columns).toContain('count');
    // Should have 3 groups: click, view, purchase
    expect(result.rows.length).toBe(3);
  });

  it('should group by multiple columns', async () => {
    const result = await engine.query({
      table: 'events',
      groupBy: ['status', 'event_type'],
      aggregates: [{ function: 'count', alias: 'count' }],
    });

    expect(result.columns).toContain('status');
    expect(result.columns).toContain('event_type');
    expect(result.columns).toContain('count');
  });

  it('should compute aggregates per group', async () => {
    const result = await engine.query({
      table: 'events',
      groupBy: ['event_type'],
      aggregates: [
        { function: 'count', alias: 'count' },
        { function: 'sum', column: 'amount', alias: 'total_amount' },
      ],
    });

    const typeIdx = result.columns.indexOf('event_type');
    const sumIdx = result.columns.indexOf('total_amount');

    // Find purchase row and verify sum
    const purchaseRow = result.rows.find((row) => row[typeIdx] === 'purchase');
    expect(purchaseRow).toBeDefined();
    // 99.99 + 149.99 + 29.99 = 279.97
    expect(purchaseRow![sumIdx]).toBeCloseTo(279.97, 2);
  });
});

// ============================================================================
// Sort and Limit Tests
// ============================================================================

describe('Sort and Limit', () => {
  let bucket: R2Bucket;
  let engine: QueryEngine;

  beforeEach(() => {
    const objects = new Map<string, unknown>([
      ['manifest.json', SAMPLE_MANIFEST],
      ['data/events/block_001.json', SAMPLE_BLOCK_1],
      ['data/events/block_002.json', SAMPLE_BLOCK_2],
    ]);
    bucket = createMockR2Bucket(objects);
    engine = createQueryEngine({ bucket });
  });

  it('should sort ascending', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['id'],
      orderBy: [{ column: 'id', direction: 'asc' }],
    });

    const idIdx = result.columns.indexOf('id');
    const ids = result.rows.map((row) => row[idIdx] as number);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('should sort descending', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['id'],
      orderBy: [{ column: 'id', direction: 'desc' }],
    });

    const idIdx = result.columns.indexOf('id');
    const ids = result.rows.map((row) => row[idIdx] as number);
    expect(ids).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('should sort by multiple columns', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['status', 'id'],
      orderBy: [
        { column: 'status', direction: 'asc' },
        { column: 'id', direction: 'asc' },
      ],
    });

    const statusIdx = result.columns.indexOf('status');
    const idIdx = result.columns.indexOf('id');

    // Check that statuses are sorted, and within same status, ids are sorted
    for (let i = 1; i < result.rows.length; i++) {
      const prevStatus = result.rows[i - 1][statusIdx] as string;
      const currStatus = result.rows[i][statusIdx] as string;
      if (prevStatus === currStatus) {
        expect(result.rows[i - 1][idIdx]).toBeLessThan(result.rows[i][idIdx] as number);
      } else {
        expect(prevStatus.localeCompare(currStatus)).toBeLessThanOrEqual(0);
      }
    }
  });

  it('should apply limit', async () => {
    const result = await engine.query({
      table: 'events',
      limit: 5,
    });

    expect(result.rows.length).toBe(5);
    expect(result.stats.rowsReturned).toBe(5);
  });

  it('should apply offset', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['id'],
      orderBy: [{ column: 'id', direction: 'asc' }],
      offset: 3,
      limit: 3,
    });

    const idIdx = result.columns.indexOf('id');
    const ids = result.rows.map((row) => row[idIdx]);
    expect(ids).toEqual([4, 5, 6]); // Skipped first 3
  });

  it('should apply limit after sort', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['id'],
      orderBy: [{ column: 'id', direction: 'desc' }],
      limit: 3,
    });

    const idIdx = result.columns.indexOf('id');
    const ids = result.rows.map((row) => row[idIdx]);
    expect(ids).toEqual([10, 9, 8]); // Top 3 by descending id
  });

  it('should handle nulls in sort with nullsFirst option', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['id', 'amount'],
      orderBy: [{ column: 'amount', direction: 'asc', nullsFirst: true }],
    });

    const amountIdx = result.columns.indexOf('amount');
    // First rows should have null amounts
    expect(result.rows[0][amountIdx]).toBeNull();
  });

  it('should handle nulls in sort with nullsFirst=false', async () => {
    const result = await engine.query({
      table: 'events',
      columns: ['id', 'amount'],
      orderBy: [{ column: 'amount', direction: 'asc', nullsFirst: false }],
    });

    const amountIdx = result.columns.indexOf('amount');
    // Last rows should have null amounts
    expect(result.rows[result.rows.length - 1][amountIdx]).toBeNull();
  });
});

// ============================================================================
// Cache Integration Tests
// ============================================================================

describe('Cache Integration', () => {
  let bucket: R2Bucket;
  let engine: QueryEngine;

  beforeEach(() => {
    const objects = new Map<string, unknown>([
      ['manifest.json', SAMPLE_MANIFEST],
      ['data/events/block_001.json', SAMPLE_BLOCK_1],
      ['data/events/block_002.json', SAMPLE_BLOCK_2],
    ]);
    bucket = createMockR2Bucket(objects);
    engine = createQueryEngine({
      bucket,
      cache: { enableCacheApi: true },
    });
  });

  it('should track cache misses on first query', async () => {
    await engine.query({ table: 'events' });

    const stats = engine.getCacheStats();
    expect(stats.misses).toBeGreaterThan(0);
    expect(stats.bytesReadFromR2).toBeGreaterThan(0);
  });

  it('should report cache stats in query result', async () => {
    const result = await engine.query({ table: 'events' });

    expect(typeof result.stats.bytesFromR2).toBe('number');
    expect(typeof result.stats.bytesFromCache).toBe('number');
    expect(typeof result.stats.cacheHitRatio).toBe('number');
  });

  it('should allow disabling cache', async () => {
    const noCacheEngine = createQueryEngine({
      bucket,
      cache: { enableCacheApi: false },
    });

    await noCacheEngine.query({ table: 'events' });
    const stats = noCacheEngine.getCacheStats();
    expect(stats.bytesServedFromCache).toBe(0);
  });

  it('should reset cache stats', () => {
    engine.resetCacheStats();
    const stats = engine.getCacheStats();

    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.bytesServedFromCache).toBe(0);
    expect(stats.bytesReadFromR2).toBe(0);
  });
});

// ============================================================================
// Block Scanning Tests
// ============================================================================

describe('Block Scanning', () => {
  let bucket: R2Bucket;
  let engine: QueryEngine;

  beforeEach(() => {
    const objects = new Map<string, unknown>([
      ['manifest.json', SAMPLE_MANIFEST],
      ['data/events/block_001.json', SAMPLE_BLOCK_1],
      ['data/events/block_002.json', SAMPLE_BLOCK_2],
    ]);
    bucket = createMockR2Bucket(objects);
    engine = createQueryEngine({ bucket });
  });

  it('should scan individual blocks', async () => {
    const result = await engine.scanBlock({
      blockPath: 'data/events/block_001.json',
      columns: ['id', 'user_id'],
    });

    expect(result.rowCount).toBe(5);
    expect(result.data.has('id')).toBe(true);
    expect(result.data.has('user_id')).toBe(true);
    expect(result.bytesRead).toBeGreaterThan(0);
  });

  it('should apply filters during block scan', async () => {
    const result = await engine.scanBlock({
      blockPath: 'data/events/block_001.json',
      columns: ['id', 'status'],
      filters: [{ column: 'status', operator: 'eq', value: 'active' }],
    });

    // Block 1 has 3 active rows (ids 1, 2, 5)
    expect(result.rowCount).toBe(3);
  });

  it('should report blocks scanned in query stats', async () => {
    const result = await engine.query({ table: 'events' });

    expect(result.stats.blocksScanned).toBe(2);
  });

  it('should allow concurrent block reads', async () => {
    const concurrentEngine = createQueryEngine({
      bucket,
      maxConcurrentReads: 4,
    });

    const result = await concurrentEngine.query({ table: 'events' });
    expect(result.rows.length).toBe(10);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  let bucket: R2Bucket;
  let engine: QueryEngine;

  beforeEach(() => {
    const objects = new Map<string, unknown>([
      ['manifest.json', SAMPLE_MANIFEST],
      ['data/events/block_001.json', SAMPLE_BLOCK_1],
    ]);
    bucket = createMockR2Bucket(objects);
    engine = createQueryEngine({ bucket });
  });

  it('should handle missing manifest', async () => {
    const emptyBucket = createMockR2Bucket(new Map());
    const emptyEngine = createQueryEngine({ bucket: emptyBucket });

    await expect(emptyEngine.query({ table: 'events' })).rejects.toThrow(/manifest/i);
  });

  it('should handle missing block file', async () => {
    // Block 2 is missing in our setup
    await expect(engine.query({ table: 'events' })).rejects.toThrow();
  });

  it('should handle query timeout', async () => {
    await expect(
      engine.query({
        table: 'events',
        timeoutMs: 0, // Immediate timeout
      })
    ).rejects.toThrow(/timeout/i);
  });

  it('should handle invalid filter operator', async () => {
    await expect(
      engine.query({
        table: 'events',
        filters: [{ column: 'id', operator: 'invalid' as any, value: 1 }],
      })
    ).rejects.toThrow(/operator/i);
  });

  it('should handle invalid aggregate function', async () => {
    await expect(
      engine.query({
        table: 'events',
        aggregates: [{ function: 'invalid' as any, alias: 'bad' }],
      })
    ).rejects.toThrow(/aggregate/i);
  });
});

// ============================================================================
// Manifest Loading Tests
// ============================================================================

describe('Manifest Loading', () => {
  it('should load manifest from R2', async () => {
    const objects = new Map<string, unknown>([['manifest.json', SAMPLE_MANIFEST]]);
    const bucket = createMockR2Bucket(objects);
    const engine = createQueryEngine({ bucket });

    const tables = await engine.listTables();
    expect(tables).toContain('events');
    expect(tables).toContain('users');
  });

  it('should get table metadata', async () => {
    const objects = new Map<string, unknown>([['manifest.json', SAMPLE_MANIFEST]]);
    const bucket = createMockR2Bucket(objects);
    const engine = createQueryEngine({ bucket });

    const metadata = await engine.getTableMetadata('events');
    expect(metadata.name).toBe('events');
    expect(metadata.schema.length).toBeGreaterThan(0);
    expect(metadata.blockPaths.length).toBe(2);
  });

  it('should throw for non-existent table metadata', async () => {
    const objects = new Map<string, unknown>([['manifest.json', SAMPLE_MANIFEST]]);
    const bucket = createMockR2Bucket(objects);
    const engine = createQueryEngine({ bucket });

    await expect(engine.getTableMetadata('nonexistent')).rejects.toThrow(/not found/i);
  });

  it('should refresh manifest', async () => {
    const objects = new Map<string, unknown>([['manifest.json', SAMPLE_MANIFEST]]);
    const bucket = createMockR2Bucket(objects);
    const engine = createQueryEngine({ bucket });

    await engine.refreshManifest();
    const tables = await engine.listTables();
    expect(tables.length).toBe(2);
  });
});

// ============================================================================
// Block Data JSON Validation Tests
// ============================================================================

describe('Block Data JSON Validation', () => {
  let bucket: ReturnType<typeof createMockR2Bucket>;
  let engine: QueryEngine;

  /**
   * Helper to create a mock bucket with custom block data
   */
  function createBucketWithBlockData(blockData: unknown): ReturnType<typeof createMockR2Bucket> {
    const objects = new Map<string, unknown>([
      ['manifest.json', SAMPLE_MANIFEST],
      ['data/events/block_001.json', blockData],
      ['data/events/block_002.json', SAMPLE_BLOCK_2],
    ]);
    return createMockR2Bucket(objects);
  }

  /**
   * Helper to create a mock bucket that returns raw bytes (for invalid JSON)
   */
  function createBucketWithRawBlock(rawContent: string): R2Bucket {
    const buffer = new TextEncoder().encode(rawContent).buffer;
    return {
      get: vi.fn(async (key: string) => {
        if (key === 'manifest.json') {
          return createMockR2Object(key, SAMPLE_MANIFEST);
        }
        if (key === 'data/events/block_001.json') {
          return {
            key,
            size: buffer.byteLength,
            etag: '"test"',
            httpEtag: '"test"',
            uploaded: new Date(),
            customMetadata: {},
            arrayBuffer: vi.fn().mockResolvedValue(buffer),
            text: vi.fn().mockResolvedValue(rawContent),
            json: vi.fn().mockRejectedValue(new SyntaxError('Invalid JSON')),
          };
        }
        if (key === 'data/events/block_002.json') {
          return createMockR2Object(key, SAMPLE_BLOCK_2);
        }
        return null;
      }),
      head: vi.fn(async () => null),
      list: vi.fn(async () => ({ objects: [], truncated: false })),
    };
  }

  describe('Valid JSON Parsing', () => {
    beforeEach(() => {
      bucket = createBucketWithBlockData(SAMPLE_BLOCK_1);
      engine = createQueryEngine({ bucket });
    });

    it('should parse valid JSON block data correctly', async () => {
      const result = await engine.scanBlock({
        blockPath: 'data/events/block_001.json',
        columns: ['id', 'user_id'],
      });

      expect(result.rowCount).toBe(5);
      expect(result.data.get('id')).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle valid empty block (empty columns)', async () => {
      const emptyBlock = {
        id: [],
        user_id: [],
        event_type: [],
        timestamp: [],
        status: [],
        amount: [],
      };
      bucket = createBucketWithBlockData(emptyBlock);
      engine = createQueryEngine({ bucket });

      const result = await engine.scanBlock({
        blockPath: 'data/events/block_001.json',
        columns: ['id'],
      });

      expect(result.rowCount).toBe(0);
      expect(result.data.get('id')).toEqual([]);
    });
  });

  describe('Invalid JSON Syntax', () => {
    it('should throw descriptive error for invalid JSON syntax', async () => {
      bucket = createBucketWithRawBlock('{ invalid json }');
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/invalid.*json|json.*parse|syntax/i);
    });

    it('should throw descriptive error for truncated JSON', async () => {
      bucket = createBucketWithRawBlock('{"id": [1, 2, 3');
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/invalid.*json|json.*parse|syntax|unexpected/i);
    });

    it('should throw descriptive error for empty content', async () => {
      bucket = createBucketWithRawBlock('');
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/invalid.*json|json.*parse|empty|unexpected/i);
    });
  });

  describe('Valid JSON but Wrong Shape', () => {
    it('should throw error when block data is an array instead of object', async () => {
      bucket = createBucketWithBlockData([1, 2, 3, 4, 5]);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/block.*data.*object|invalid.*block|expected.*object/i);
    });

    it('should throw error when block data is a primitive (string)', async () => {
      bucket = createBucketWithBlockData('just a string');
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/block.*data.*object|invalid.*block|expected.*object/i);
    });

    it('should throw error when block data is a primitive (number)', async () => {
      bucket = createBucketWithBlockData(42);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/block.*data.*object|invalid.*block|expected.*object/i);
    });

    it('should throw error when block data is null', async () => {
      bucket = createBucketWithBlockData(null);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/block.*data.*object|invalid.*block|expected.*object|null/i);
    });

    it('should throw error when block data is boolean', async () => {
      bucket = createBucketWithBlockData(true);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/block.*data.*object|invalid.*block|expected.*object/i);
    });
  });

  describe('Column Value Type Validation', () => {
    it('should throw error when column value is not an array', async () => {
      const invalidBlock = {
        id: 'not an array',
        user_id: ['u1', 'u2'],
      };
      bucket = createBucketWithBlockData(invalidBlock);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/column.*array|invalid.*column|id.*array/i);
    });

    it('should throw error when column value is an object instead of array', async () => {
      const invalidBlock = {
        id: { values: [1, 2, 3] },
        user_id: ['u1', 'u2', 'u3'],
      };
      bucket = createBucketWithBlockData(invalidBlock);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/column.*array|invalid.*column|id.*array/i);
    });

    it('should throw error when column value is null', async () => {
      const invalidBlock = {
        id: null,
        user_id: ['u1', 'u2'],
      };
      bucket = createBucketWithBlockData(invalidBlock);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/column.*array|invalid.*column|id.*null/i);
    });

    it('should throw error when column value is a number', async () => {
      const invalidBlock = {
        id: 123,
        user_id: ['u1', 'u2'],
      };
      bucket = createBucketWithBlockData(invalidBlock);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/column.*array|invalid.*column|id.*array/i);
    });
  });

  describe('Column Length Consistency', () => {
    it('should throw error when columns have inconsistent lengths', async () => {
      const invalidBlock = {
        id: [1, 2, 3, 4, 5],
        user_id: ['u1', 'u2'], // Different length
        event_type: ['click', 'view', 'purchase'],
      };
      bucket = createBucketWithBlockData(invalidBlock);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id', 'user_id'],
        })
      ).rejects.toThrow(/column.*length|inconsistent|mismatch/i);
    });
  });

  describe('Extra Fields Handling', () => {
    it('should ignore extra fields not in schema (silent)', async () => {
      const blockWithExtra = {
        id: [1, 2, 3],
        user_id: ['u1', 'u2', 'u3'],
        event_type: ['click', 'view', 'click'],
        timestamp: [1700000000000, 1700000001000, 1700000002000],
        status: ['active', 'active', 'pending'],
        amount: [null, null, null],
        _internal_metadata: ['meta1', 'meta2', 'meta3'], // Extra field
        _debug_info: [true, false, true], // Extra field
      };
      bucket = createBucketWithBlockData(blockWithExtra);
      engine = createQueryEngine({ bucket });

      // Should succeed and just ignore extra fields
      const result = await engine.scanBlock({
        blockPath: 'data/events/block_001.json',
        columns: ['id', 'user_id'],
      });

      expect(result.rowCount).toBe(3);
      expect(result.data.get('id')).toEqual([1, 2, 3]);
    });
  });

  describe('Null Values in Data', () => {
    it('should handle null values in arrays correctly', async () => {
      const blockWithNulls = {
        id: [1, 2, 3],
        user_id: [null, 'u2', null], // Nulls in string column
        event_type: ['click', null, 'view'],
        timestamp: [1700000000000, null, 1700000002000],
        status: ['active', 'pending', null],
        amount: [null, 99.99, null],
      };
      bucket = createBucketWithBlockData(blockWithNulls);
      engine = createQueryEngine({ bucket });

      const result = await engine.scanBlock({
        blockPath: 'data/events/block_001.json',
        columns: ['id', 'user_id', 'amount'],
      });

      expect(result.rowCount).toBe(3);
      expect(result.data.get('user_id')).toEqual([null, 'u2', null]);
      expect(result.data.get('amount')).toEqual([null, 99.99, null]);
    });
  });

  describe('Error Messages Quality', () => {
    it('should include block path in error message', async () => {
      bucket = createBucketWithBlockData([1, 2, 3]);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['id'],
        })
      ).rejects.toThrow(/block_001\.json|data\/events/i);
    });

    it('should include column name in column validation error', async () => {
      const invalidBlock = {
        my_special_column: 'not an array',
        other_column: [1, 2, 3],
      };
      bucket = createBucketWithBlockData(invalidBlock);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.scanBlock({
          blockPath: 'data/events/block_001.json',
          columns: ['my_special_column'],
        })
      ).rejects.toThrow(/my_special_column/i);
    });
  });

  describe('Query Method Validation', () => {
    it('should validate block data during full query execution', async () => {
      bucket = createBucketWithBlockData('not valid json structure');
      engine = createQueryEngine({ bucket });

      await expect(
        engine.query({
          table: 'events',
          columns: ['id'],
        })
      ).rejects.toThrow(/block.*data|invalid|json/i);
    });

    it('should validate all blocks in query - fail on second block', async () => {
      const objects = new Map<string, unknown>([
        ['manifest.json', SAMPLE_MANIFEST],
        ['data/events/block_001.json', SAMPLE_BLOCK_1], // Valid
        ['data/events/block_002.json', { id: 'not an array' }], // Invalid
      ]);
      bucket = createMockR2Bucket(objects);
      engine = createQueryEngine({ bucket });

      await expect(
        engine.query({
          table: 'events',
          columns: ['id'],
        })
      ).rejects.toThrow(/column.*array|invalid.*column|block/i);
    });
  });
});

// ============================================================================
// Manifest JSON Validation Tests
// ============================================================================

describe('Manifest JSON Validation', () => {
  /**
   * Helper to create a mock bucket with custom manifest data
   */
  function createBucketWithManifest(manifestData: unknown): R2Bucket {
    const objects = new Map<string, unknown>([
      ['manifest.json', manifestData],
      ['data/events/block_001.json', SAMPLE_BLOCK_1],
      ['data/events/block_002.json', SAMPLE_BLOCK_2],
    ]);
    return createMockR2Bucket(objects);
  }

  /**
   * Helper to create a mock bucket that returns raw bytes for manifest (for invalid JSON)
   */
  function createBucketWithRawManifest(rawContent: string): R2Bucket {
    const buffer = new TextEncoder().encode(rawContent).buffer;
    return {
      get: vi.fn(async (key: string) => {
        if (key === 'manifest.json') {
          return {
            key,
            size: buffer.byteLength,
            etag: '"test"',
            httpEtag: '"test"',
            uploaded: new Date(),
            customMetadata: {},
            arrayBuffer: vi.fn().mockResolvedValue(buffer),
            text: vi.fn().mockResolvedValue(rawContent),
            json: vi.fn().mockRejectedValue(new SyntaxError('Invalid JSON')),
          };
        }
        if (key === 'data/events/block_001.json') {
          return createMockR2Object(key, SAMPLE_BLOCK_1);
        }
        if (key === 'data/events/block_002.json') {
          return createMockR2Object(key, SAMPLE_BLOCK_2);
        }
        return null;
      }),
      head: vi.fn(async () => null),
      list: vi.fn(async () => ({ objects: [], truncated: false })),
    };
  }

  describe('Valid Manifest Parsing', () => {
    it('should parse valid manifest correctly', async () => {
      const bucket = createBucketWithManifest(SAMPLE_MANIFEST);
      const engine = createQueryEngine({ bucket });

      const tables = await engine.listTables();
      expect(tables).toContain('events');
      expect(tables).toContain('users');
    });

    it('should handle manifest with single table', async () => {
      const singleTableManifest = {
        version: 1,
        tables: {
          events: SAMPLE_MANIFEST.tables.events,
        },
      };
      const bucket = createBucketWithManifest(singleTableManifest);
      const engine = createQueryEngine({ bucket });

      const tables = await engine.listTables();
      expect(tables).toEqual(['events']);
    });

    it('should handle manifest with empty tables object', async () => {
      const emptyTablesManifest = {
        version: 1,
        tables: {},
      };
      const bucket = createBucketWithManifest(emptyTablesManifest);
      const engine = createQueryEngine({ bucket });

      const tables = await engine.listTables();
      expect(tables).toEqual([]);
    });
  });

  describe('Invalid Manifest JSON Syntax', () => {
    it('should throw descriptive error for malformed JSON', async () => {
      const bucket = createBucketWithRawManifest('{ invalid json }');
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/invalid.*json|json.*parse|syntax|manifest/i);
    });

    it('should throw descriptive error for truncated JSON', async () => {
      const bucket = createBucketWithRawManifest('{"version": 1, "tables":');
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/invalid.*json|json.*parse|syntax|unexpected|manifest/i);
    });

    it('should throw descriptive error for empty manifest content', async () => {
      const bucket = createBucketWithRawManifest('');
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/invalid.*json|json.*parse|empty|unexpected|manifest/i);
    });
  });

  describe('Valid JSON but Missing Required Fields', () => {
    it('should throw error when manifest is missing version field', async () => {
      const invalidManifest = {
        tables: SAMPLE_MANIFEST.tables,
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/version|missing.*field|invalid.*manifest/i);
    });

    it('should throw error when manifest is missing tables field', async () => {
      const invalidManifest = {
        version: 1,
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/tables|missing.*field|invalid.*manifest/i);
    });

    it('should throw error when table is missing name field', async () => {
      const invalidManifest = {
        version: 1,
        tables: {
          events: {
            schema: SAMPLE_MANIFEST.tables.events.schema,
            blockPaths: SAMPLE_MANIFEST.tables.events.blockPaths,
            rowCount: 100,
            lastUpdated: Date.now(),
          },
        },
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.getTableMetadata('events')).rejects.toThrow(/name|missing.*field|invalid.*table/i);
    });

    it('should throw error when table is missing schema field', async () => {
      const invalidManifest = {
        version: 1,
        tables: {
          events: {
            name: 'events',
            blockPaths: SAMPLE_MANIFEST.tables.events.blockPaths,
            rowCount: 100,
            lastUpdated: Date.now(),
          },
        },
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.getTableMetadata('events')).rejects.toThrow(/schema|missing.*field|invalid.*table/i);
    });

    it('should throw error when table is missing blockPaths field', async () => {
      const invalidManifest = {
        version: 1,
        tables: {
          events: {
            name: 'events',
            schema: SAMPLE_MANIFEST.tables.events.schema,
            rowCount: 100,
            lastUpdated: Date.now(),
          },
        },
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.getTableMetadata('events')).rejects.toThrow(/blockPaths|missing.*field|invalid.*table/i);
    });

    it('should throw error when table is missing rowCount field', async () => {
      const invalidManifest = {
        version: 1,
        tables: {
          events: {
            name: 'events',
            schema: SAMPLE_MANIFEST.tables.events.schema,
            blockPaths: SAMPLE_MANIFEST.tables.events.blockPaths,
            lastUpdated: Date.now(),
          },
        },
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.getTableMetadata('events')).rejects.toThrow(/rowCount|missing.*field|invalid.*table/i);
    });
  });

  describe('Valid JSON but Wrong Types', () => {
    it('should throw error when manifest is null', async () => {
      const bucket = createBucketWithManifest(null);
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/manifest.*object|null|invalid.*manifest/i);
    });

    it('should throw error when manifest is an array', async () => {
      const bucket = createBucketWithManifest([1, 2, 3]);
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/manifest.*object|array|invalid.*manifest/i);
    });

    it('should throw error when manifest is a primitive (string)', async () => {
      const bucket = createBucketWithManifest('just a string');
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/manifest.*object|string|invalid.*manifest/i);
    });

    it('should throw error when manifest is a primitive (number)', async () => {
      const bucket = createBucketWithManifest(42);
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/manifest.*object|number|invalid.*manifest/i);
    });

    it('should throw error when version is not a number', async () => {
      const invalidManifest = {
        version: 'one',
        tables: SAMPLE_MANIFEST.tables,
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/version.*number|invalid.*version/i);
    });

    it('should throw error when tables is not an object', async () => {
      const invalidManifest = {
        version: 1,
        tables: ['events', 'users'],
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/tables.*object|invalid.*tables/i);
    });

    it('should throw error when schema is not an array', async () => {
      const invalidManifest = {
        version: 1,
        tables: {
          events: {
            name: 'events',
            schema: 'not an array',
            blockPaths: [],
            rowCount: 0,
            lastUpdated: Date.now(),
          },
        },
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.getTableMetadata('events')).rejects.toThrow(/schema.*array|invalid.*schema/i);
    });

    it('should throw error when blockPaths is not an array', async () => {
      const invalidManifest = {
        version: 1,
        tables: {
          events: {
            name: 'events',
            schema: [],
            blockPaths: 'not an array',
            rowCount: 0,
            lastUpdated: Date.now(),
          },
        },
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.getTableMetadata('events')).rejects.toThrow(/blockPaths.*array|invalid.*blockPaths/i);
    });

    it('should throw error when rowCount is not a number', async () => {
      const invalidManifest = {
        version: 1,
        tables: {
          events: {
            name: 'events',
            schema: [],
            blockPaths: [],
            rowCount: 'many',
            lastUpdated: Date.now(),
          },
        },
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.getTableMetadata('events')).rejects.toThrow(/rowCount.*number|invalid.*rowCount/i);
    });
  });

  describe('Column Schema Validation', () => {
    it('should throw error when column schema is missing name', async () => {
      const invalidManifest = {
        version: 1,
        tables: {
          events: {
            name: 'events',
            schema: [
              { type: 'int64', nullable: false }, // Missing name
            ],
            blockPaths: [],
            rowCount: 0,
            lastUpdated: Date.now(),
          },
        },
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.getTableMetadata('events')).rejects.toThrow(/column.*name|missing.*name|invalid.*column/i);
    });

    it('should throw error when column schema is missing type', async () => {
      const invalidManifest = {
        version: 1,
        tables: {
          events: {
            name: 'events',
            schema: [
              { name: 'id', nullable: false }, // Missing type
            ],
            blockPaths: [],
            rowCount: 0,
            lastUpdated: Date.now(),
          },
        },
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.getTableMetadata('events')).rejects.toThrow(/column.*type|missing.*type|invalid.*column/i);
    });

    it('should throw error when column type is invalid', async () => {
      const invalidManifest = {
        version: 1,
        tables: {
          events: {
            name: 'events',
            schema: [
              { name: 'id', type: 'invalid_type', nullable: false },
            ],
            blockPaths: [],
            rowCount: 0,
            lastUpdated: Date.now(),
          },
        },
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.getTableMetadata('events')).rejects.toThrow(/invalid.*type|unknown.*type|invalid_type/i);
    });
  });

  describe('Query with Invalid Manifest', () => {
    it('should throw validation error during query with invalid manifest', async () => {
      const invalidManifest = {
        version: 'not a number',
        tables: SAMPLE_MANIFEST.tables,
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(
        engine.query({ table: 'events', columns: ['id'] })
      ).rejects.toThrow(/version|invalid.*manifest/i);
    });

    it('should throw validation error during query with missing tables', async () => {
      const invalidManifest = {
        version: 1,
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(
        engine.query({ table: 'events', columns: ['id'] })
      ).rejects.toThrow(/tables|missing|invalid.*manifest/i);
    });
  });

  describe('Error Message Quality', () => {
    it('should include context in manifest validation errors', async () => {
      const invalidManifest = {
        version: 'invalid',
        tables: {},
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.listTables()).rejects.toThrow(/manifest|version/i);
    });

    it('should include table name in table validation errors', async () => {
      const invalidManifest = {
        version: 1,
        tables: {
          my_broken_table: {
            name: 'my_broken_table',
            schema: 'not an array',
            blockPaths: [],
            rowCount: 0,
            lastUpdated: Date.now(),
          },
        },
      };
      const bucket = createBucketWithManifest(invalidManifest);
      const engine = createQueryEngine({ bucket });

      await expect(engine.getTableMetadata('my_broken_table')).rejects.toThrow(/my_broken_table|schema/i);
    });
  });
});
