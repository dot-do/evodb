/**
 * @evodb/query - Data Source Injection Tests
 *
 * Tests that verify the QueryEngine works correctly with injected data sources
 * instead of hardcoded mock data. This ensures proper separation of concerns
 * and allows for flexible testing strategies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  QueryEngine,
  createQueryEngine,
} from '../engine.js';

import type {
  Query,
  QueryEngineConfig,
  TableDataSource,
  TableDataSourceMetadata,
  PartitionInfo,
  R2Bucket,
} from '../types.js';

import {
  MockDataSource,
  createMockDataSource,
  createEmptyMockDataSource,
  createMockDataSourceWithTables,
  generateUserRows,
  generateOrderRows,
  MockTableDefinition,
} from './fixtures/mock-data.js';

// =============================================================================
// Test Utilities
// =============================================================================

function createMockBucket(): R2Bucket {
  return {
    get: vi.fn().mockResolvedValue(null),
    head: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false }),
  };
}

function createTestConfig(overrides?: Partial<QueryEngineConfig>): QueryEngineConfig {
  return {
    bucket: createMockBucket(),
    maxParallelism: 4,
    defaultTimeoutMs: 30000,
    enableStats: true,
    ...overrides,
  };
}

// =============================================================================
// Data Source Injection Tests
// =============================================================================

describe('QueryEngine - Data Source Injection', () => {
  describe('Default Data Source Behavior', () => {
    it('should use R2DataSource by default when bucket is provided but no dataSource', async () => {
      const config = createTestConfig();
      // Remove dataSource to test R2DataSource default behavior
      delete (config as { dataSource?: TableDataSource }).dataSource;
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/users',
      };

      // R2DataSource with mock bucket returns null metadata (table not found)
      // because bucket.list returns no objects, so the table is considered non-existent
      await expect(engine.execute(query)).rejects.toThrow(/not found/i);
    });

    it('should throw error when neither bucket nor dataSource is provided', () => {
      const config: QueryEngineConfig = {
        maxParallelism: 4,
        defaultTimeoutMs: 30000,
      } as QueryEngineConfig;

      expect(() => createQueryEngine(config)).toThrow(/requires either config.dataSource or config.bucket/);
    });

    it('should throw for non-existent table when using MockDataSource', async () => {
      const config = createTestConfig({ dataSource: createMockDataSource() });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/nonexistent',
      };

      await expect(engine.execute(query)).rejects.toThrow(/not found/i);
    });
  });

  describe('Custom Data Source Injection', () => {
    it('should use injected MockDataSource from fixtures', async () => {
      const dataSource = createMockDataSource();
      const config = createTestConfig({ dataSource });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/users',
        predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
      };

      const result = await engine.execute(query);

      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(row.status).toBe('active');
      }
    });

    it('should use empty MockDataSource when configured', async () => {
      const dataSource = createEmptyMockDataSource();
      const config = createTestConfig({ dataSource });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/users',
      };

      await expect(engine.execute(query)).rejects.toThrow(/not found/i);
    });

    it('should use custom tables from MockDataSource', async () => {
      const customTables = new Map<string, MockTableDefinition>();
      customTables.set('custom/test/table', {
        partitions: [
          {
            path: 'data/custom/p1.bin',
            partitionValues: {},
            sizeBytes: 1000,
            rowCount: 10,
            zoneMap: { columns: {} },
            isCached: false,
          },
        ],
        rows: [
          { id: 1, value: 'custom-1' },
          { id: 2, value: 'custom-2' },
          { id: 3, value: 'custom-3' },
        ],
        schema: { id: 'number', value: 'string' },
      });

      const dataSource = createMockDataSourceWithTables(customTables);
      const config = createTestConfig({ dataSource });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'custom/test/table',
      };

      const result = await engine.execute(query);

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toHaveProperty('value', 'custom-1');
    });

    it('should support dynamically adding tables to MockDataSource', async () => {
      const dataSource = createMockDataSource();

      // Add a custom table
      dataSource.addTable('dynamic/table', {
        partitions: [
          {
            path: 'data/dynamic/p1.bin',
            partitionValues: {},
            sizeBytes: 500,
            rowCount: 5,
            zoneMap: { columns: {} },
            isCached: false,
          },
        ],
        rows: [
          { id: 1, name: 'Dynamic Row 1' },
          { id: 2, name: 'Dynamic Row 2' },
        ],
        schema: { id: 'number', name: 'string' },
      });

      const config = createTestConfig({ dataSource });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'dynamic/table',
      };

      const result = await engine.execute(query);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('Dynamic Row 1');
    });
  });

  describe('Custom TableDataSource Implementation', () => {
    it('should work with a completely custom TableDataSource', async () => {
      // Create a custom data source that returns static data
      const customDataSource: TableDataSource = {
        async getTableMetadata(tableName: string): Promise<TableDataSourceMetadata | null> {
          if (tableName === 'custom/static/table') {
            return {
              tableName,
              partitions: [
                {
                  path: 'data/static/p1.bin',
                  partitionValues: {},
                  sizeBytes: 100,
                  rowCount: 2,
                  zoneMap: { columns: {} },
                  isCached: false,
                },
              ],
              schema: { id: 'number', message: 'string' },
              rowCount: 2,
            };
          }
          return null;
        },

        async readPartition(_partition: PartitionInfo, _columns?: string[]): Promise<Record<string, unknown>[]> {
          return [
            { id: 1, message: 'Hello from custom source!' },
            { id: 2, message: 'Custom data works!' },
          ];
        },

        async *streamPartition(partition: PartitionInfo, columns?: string[]): AsyncIterableIterator<Record<string, unknown>> {
          const rows = await this.readPartition(partition, columns);
          for (const row of rows) {
            yield row;
          }
        },
      };

      const config = createTestConfig({ dataSource: customDataSource });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'custom/static/table',
      };

      const result = await engine.execute(query);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].message).toBe('Hello from custom source!');
    });

    it('should support custom data source for streaming queries', async () => {
      let streamCallCount = 0;

      const customDataSource: TableDataSource = {
        async getTableMetadata(tableName: string): Promise<TableDataSourceMetadata | null> {
          if (tableName === 'stream/test/table') {
            return {
              tableName,
              partitions: [
                {
                  path: 'data/stream/p1.bin',
                  partitionValues: {},
                  sizeBytes: 1000,
                  rowCount: 5,
                  zoneMap: { columns: {} },
                  isCached: false,
                },
              ],
              schema: { id: 'number', data: 'string' },
              rowCount: 5,
            };
          }
          return null;
        },

        async readPartition(_partition: PartitionInfo, _columns?: string[]): Promise<Record<string, unknown>[]> {
          return Array.from({ length: 5 }, (_, i) => ({
            id: i + 1,
            data: `stream-item-${i + 1}`,
          }));
        },

        async *streamPartition(partition: PartitionInfo, columns?: string[]): AsyncIterableIterator<Record<string, unknown>> {
          streamCallCount++;
          const rows = await this.readPartition(partition, columns);
          for (const row of rows) {
            yield row;
          }
        },
      };

      const config = createTestConfig({ dataSource: customDataSource });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'stream/test/table',
        limit: 3,
      };

      const stream = await engine.executeStream(query);
      const rows: Record<string, unknown>[] = [];

      for await (const row of stream.rows) {
        rows.push(row);
      }

      expect(rows.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Data Source with Predicates', () => {
    it('should correctly filter data from injected source', async () => {
      const dataSource = createMockDataSource();
      const config = createTestConfig({ dataSource });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/orders',
        predicates: [
          { column: 'status', operator: 'eq', value: 'completed' },
        ],
      };

      const result = await engine.execute(query);

      for (const row of result.rows) {
        expect(row.status).toBe('completed');
      }
    });

    it('should correctly aggregate data from injected source', async () => {
      const dataSource = createMockDataSource();
      const config = createTestConfig({ dataSource });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/orders',
        aggregations: [
          { function: 'count', column: null, alias: 'total_orders' },
          { function: 'sum', column: 'total', alias: 'total_revenue' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].total_orders).toBeDefined();
      expect(typeof result.rows[0].total_orders).toBe('number');
      expect(result.rows[0].total_revenue).toBeDefined();
      expect(typeof result.rows[0].total_revenue).toBe('number');
    });

    it('should correctly group data from injected source', async () => {
      const dataSource = createMockDataSource();
      const config = createTestConfig({ dataSource });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/orders',
        groupBy: ['status'],
        aggregations: [
          { function: 'count', column: null, alias: 'count' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows.length).toBeGreaterThan(0);
      for (const row of result.rows) {
        expect(row.status).toBeDefined();
        expect(row.count).toBeDefined();
      }
    });
  });

  describe('MockDataSource API', () => {
    it('should expose getTableRows method', () => {
      const dataSource = createMockDataSource();

      const rows = dataSource.getTableRows('com/example/api/users');

      expect(rows).not.toBeNull();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows!.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent table in getTableRows', () => {
      const dataSource = createMockDataSource();

      const rows = dataSource.getTableRows('nonexistent/table');

      expect(rows).toBeNull();
    });

    it('should expose isHugeTable method', () => {
      const dataSource = createMockDataSource();

      expect(dataSource.isHugeTable('com/example/api/huge_table')).toBe(true);
      expect(dataSource.isHugeTable('com/example/api/users')).toBe(false);
    });

    it('should expose getTableNames method', () => {
      const dataSource = createMockDataSource();

      const tableNames = dataSource.getTableNames();

      expect(tableNames).toContain('com/example/api/users');
      expect(tableNames).toContain('com/example/api/orders');
      expect(tableNames).toContain('com/example/api/events');
    });

    it('should support removeTable method', () => {
      const dataSource = createMockDataSource();

      expect(dataSource.getTableRows('com/example/api/users')).not.toBeNull();

      const removed = dataSource.removeTable('com/example/api/users');

      expect(removed).toBe(true);
      expect(dataSource.getTableRows('com/example/api/users')).toBeNull();
    });
  });

  describe('Data Generator Functions', () => {
    it('should generate correct number of user rows', () => {
      const rows = generateUserRows(50);

      expect(rows).toHaveLength(50);
      expect(rows[0]).toHaveProperty('id', 1);
      expect(rows[0]).toHaveProperty('status');
      expect(rows[0]).toHaveProperty('country');
      expect(rows[49]).toHaveProperty('id', 50);
    });

    it('should generate correct number of order rows', () => {
      const rows = generateOrderRows(100);

      expect(rows).toHaveLength(100);
      expect(rows[0]).toHaveProperty('id', 1);
      expect(rows[0]).toHaveProperty('status');
      expect(rows[0]).toHaveProperty('total');
    });

    it('should generate rows with realistic patterns', () => {
      const users = generateUserRows(100);

      // Check status distribution
      const statuses = new Set(users.map((u) => u.status));
      expect(statuses.size).toBeGreaterThan(1);

      // Check age range
      const ages = users.map((u) => u.age as number);
      expect(Math.min(...ages)).toBeGreaterThanOrEqual(18);
      expect(Math.max(...ages)).toBeLessThanOrEqual(77); // 18 + 59
    });
  });
});

// =============================================================================
// Integration Tests with Engine Features
// =============================================================================

describe('QueryEngine Features with Injected Data Source', () => {
  let dataSource: MockDataSource;
  let engine: QueryEngine;

  beforeEach(() => {
    dataSource = createMockDataSource();
    const config = createTestConfig({ dataSource });
    engine = createQueryEngine(config);
  });

  it('should support projection with injected data source', async () => {
    const query: Query = {
      table: 'com/example/api/users',
      projection: {
        columns: ['id', 'name', 'email'],
      },
    };

    const result = await engine.execute(query);

    for (const row of result.rows) {
      const keys = Object.keys(row);
      expect(keys).toContain('id');
      expect(keys).toContain('name');
      expect(keys).toContain('email');
      expect(keys).not.toContain('status');
    }
  });

  it('should support sorting with injected data source', async () => {
    const query: Query = {
      table: 'com/example/api/users',
      orderBy: [{ column: 'name', direction: 'asc' }],
    };

    const result = await engine.execute(query);

    for (let i = 1; i < result.rows.length; i++) {
      const prev = result.rows[i - 1].name as string;
      const curr = result.rows[i].name as string;
      expect(curr.localeCompare(prev)).toBeGreaterThanOrEqual(0);
    }
  });

  it('should support pagination with injected data source', async () => {
    const query: Query = {
      table: 'com/example/api/users',
      limit: 10,
      offset: 5,
    };

    const result = await engine.execute(query);

    expect(result.rows.length).toBeLessThanOrEqual(10);
    expect(result.hasMore).toBeDefined();
  });

  it('should track statistics with injected data source', async () => {
    const query: Query = {
      table: 'com/example/api/users',
      predicates: [{ column: 'status', operator: 'eq', value: 'active' }],
    };

    const result = await engine.execute(query);

    expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.rowsScanned).toBeGreaterThan(0);
    expect(result.stats.rowsMatched).toBeDefined();
  });
});
