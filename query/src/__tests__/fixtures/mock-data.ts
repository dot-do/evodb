/**
 * @evodb/query - Mock Data Fixtures
 *
 * This module provides mock data generators and a MockDataSource implementation
 * for testing the query engine. All mock data that was previously hardcoded in
 * the production QueryEngine class has been moved here.
 *
 * Usage:
 * ```typescript
 * import { createMockDataSource, MockDataSource } from './fixtures/mock-data.js';
 *
 * const dataSource = createMockDataSource();
 * const engine = createQueryEngine({ bucket, dataSource });
 * ```
 */

import type {
  PartitionInfo,
  TableDataSource,
  TableDataSourceMetadata,
} from '../../types.js';

// =============================================================================
// Mock Data Generators
// =============================================================================

/**
 * Generate mock user rows with realistic data patterns.
 */
export function generateUserRows(count: number): Record<string, unknown>[] {
  const statuses = ['active', 'inactive', 'suspended', 'banned'];
  const countries = ['USA', 'UK', 'Canada', 'Australia', 'Germany'];
  const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    _id: `user-${i + 1}`,
    _version: 1,
    user_id: `user-${i + 1}`,
    name: names[i % names.length],
    email: `user${i + 1}@example.com`,
    status: statuses[i % statuses.length],
    age: 18 + (i % 60),
    country: countries[i % countries.length],
    deleted_at: i % 2 === 0 ? null : new Date(Date.now() - i * 1000000).toISOString(),
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
    updated_at: new Date(Date.now() - i * 3600000).toISOString(),
  }));
}

/**
 * Generate mock order rows with realistic data patterns.
 */
export function generateOrderRows(count: number): Record<string, unknown>[] {
  const statuses = ['pending', 'processing', 'completed', 'cancelled'];
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    customer_id: (i % 50) + 1,
    status: statuses[i % statuses.length],
    total: 10 + ((i * 5) % 990),
  }));
}

/**
 * Generate mock event rows with realistic data patterns.
 */
export function generateEventRows(count: number): Record<string, unknown>[] {
  const eventTypes = ['click', 'view', 'purchase', 'signup'];
  return Array.from({ length: count }, (_, i) => ({
    timestamp: 1000 + i,
    user_id: `user-${(i % 100) + 1}`,
    event_type: eventTypes[i % eventTypes.length],
    value: i % 500,
    day: i < 500 ? '2026-01-01' : '2026-01-02',
  }));
}

/**
 * Generate mock product rows with realistic data patterns.
 */
export function generateProductRows(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Product ${i + 1}`,
    price: 10 + ((i * 20) % 990),
  }));
}

/**
 * Generate mock profile rows with nested column patterns.
 */
export function generateProfileRows(count: number): Record<string, unknown>[] {
  const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
  return Array.from({ length: count }, (_, i) => ({
    'user.name': `User ${i + 1}`,
    'user.email': `user${i + 1}@example.com`,
    'address.city': cities[i % cities.length],
  }));
}

/**
 * Generate mock large table rows for performance testing.
 */
export function generateLargeTableRows(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, data: `data-${i + 1}` }));
}

/**
 * Generate mock large event rows for streaming tests.
 */
export function generateLargeEventRows(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, event: `event-${i + 1}` }));
}

// =============================================================================
// Table Definitions
// =============================================================================

/**
 * Default table definitions for mock data.
 * Each table has partitions, rows, and schema information.
 */
export interface MockTableDefinition {
  partitions: PartitionInfo[];
  rows: Record<string, unknown>[];
  schema: Record<string, string>;
}

/**
 * Create the default set of mock tables for testing.
 */
export function createDefaultMockTables(): Map<string, MockTableDefinition> {
  const tables = new Map<string, MockTableDefinition>();

  // Users table
  tables.set('com/example/api/users', {
    partitions: [
      {
        path: 'data/users/p1.bin',
        partitionValues: {},
        sizeBytes: 10000,
        rowCount: 100,
        zoneMap: {
          columns: {
            id: { min: 1, max: 100, nullCount: 0, allNull: false },
            user_id: { min: 'user-1', max: 'user-100', nullCount: 0, allNull: false },
            name: { min: 'Alice', max: 'Zoe', nullCount: 0, allNull: false },
            email: { min: 'a@example.com', max: 'z@example.com', nullCount: 0, allNull: false },
            status: { min: 'active', max: 'suspended', nullCount: 0, allNull: false },
            age: { min: 18, max: 80, nullCount: 0, allNull: false },
            country: { min: 'Australia', max: 'USA', nullCount: 0, allNull: false },
            deleted_at: { min: null, max: null, nullCount: 50, allNull: false },
          },
        },
        isCached: false,
      },
    ],
    rows: generateUserRows(100),
    schema: {
      id: 'number',
      user_id: 'string',
      name: 'string',
      email: 'string',
      status: 'string',
      age: 'number',
      country: 'string',
      deleted_at: 'string',
      created_at: 'string',
      updated_at: 'string',
    },
  });

  // Orders table
  tables.set('com/example/api/orders', {
    partitions: [
      {
        path: 'data/orders/p1.bin',
        partitionValues: {},
        sizeBytes: 20000,
        rowCount: 200,
        zoneMap: {
          columns: {
            id: { min: 1, max: 200, nullCount: 0, allNull: false },
            customer_id: { min: 1, max: 50, nullCount: 0, allNull: false },
            status: { min: 'cancelled', max: 'processing', nullCount: 0, allNull: false },
            total: { min: 10, max: 1000, nullCount: 0, allNull: false },
          },
        },
        isCached: false,
      },
    ],
    rows: generateOrderRows(200),
    schema: {
      id: 'number',
      customer_id: 'number',
      status: 'string',
      total: 'number',
    },
  });

  // Events table with multiple partitions
  tables.set('com/example/api/events', {
    partitions: [
      {
        path: 'data/events/p1.bin',
        partitionValues: { day: '2026-01-01' },
        sizeBytes: 50000,
        rowCount: 500,
        zoneMap: {
          columns: {
            timestamp: { min: 1000, max: 2000, nullCount: 0, allNull: false },
            user_id: { min: 'user-001', max: 'user-100', nullCount: 0, allNull: false },
            event_type: { min: 'click', max: 'view', nullCount: 0, allNull: false },
            value: { min: 0, max: 500, nullCount: 0, allNull: false },
            day: { min: '2026-01-01', max: '2026-01-01', nullCount: 0, allNull: false },
          },
        },
        isCached: false,
      },
      {
        path: 'data/events/p2.bin',
        partitionValues: { day: '2026-01-02' },
        sizeBytes: 60000,
        rowCount: 600,
        zoneMap: {
          columns: {
            timestamp: { min: 2001, max: 3000, nullCount: 0, allNull: false },
            user_id: { min: 'user-001', max: 'user-100', nullCount: 0, allNull: false },
            event_type: { min: 'click', max: 'view', nullCount: 0, allNull: false },
            value: { min: 0, max: 500, nullCount: 0, allNull: false },
            day: { min: '2026-01-02', max: '2026-01-02', nullCount: 0, allNull: false },
          },
        },
        isCached: false,
      },
    ],
    rows: generateEventRows(1100),
    schema: {
      timestamp: 'number',
      user_id: 'string',
      event_type: 'string',
      value: 'number',
      day: 'string',
    },
  });

  // Products table
  tables.set('com/example/api/products', {
    partitions: [
      {
        path: 'data/products/p1.bin',
        partitionValues: {},
        sizeBytes: 5000,
        rowCount: 50,
        zoneMap: {
          columns: {
            id: { min: 1, max: 50, nullCount: 0, allNull: false },
            name: { min: 'Apple', max: 'Zebra', nullCount: 0, allNull: false },
            price: { min: 10, max: 1000, nullCount: 0, allNull: false },
          },
        },
        isCached: false,
      },
    ],
    rows: generateProductRows(50),
    schema: { id: 'number', name: 'string', price: 'number' },
  });

  // Profiles table with nested columns
  tables.set('com/example/api/profiles', {
    partitions: [
      {
        path: 'data/profiles/p1.bin',
        partitionValues: {},
        sizeBytes: 8000,
        rowCount: 80,
        zoneMap: { columns: {} },
        isCached: false,
      },
    ],
    rows: generateProfileRows(80),
    schema: { 'user.name': 'string', 'user.email': 'string', 'address.city': 'string' },
  });

  // Large table for performance tests
  tables.set('com/example/api/large_table', {
    partitions: [
      {
        path: 'data/large_table/p1.bin',
        partitionValues: {},
        sizeBytes: 1000000,
        rowCount: 10000,
        zoneMap: { columns: {} },
        isCached: false,
      },
    ],
    rows: generateLargeTableRows(10000),
    schema: { id: 'number', data: 'string' },
  });

  // Large events for streaming
  tables.set('com/example/api/large_events', {
    partitions: [
      {
        path: 'data/large_events/p1.bin',
        partitionValues: {},
        sizeBytes: 5000000,
        rowCount: 100000,
        zoneMap: { columns: {} },
        isCached: false,
      },
    ],
    rows: generateLargeEventRows(100000),
    schema: { id: 'number', event: 'string' },
  });

  // Empty table
  tables.set('com/example/api/empty', {
    partitions: [],
    rows: [],
    schema: {},
  });

  // Huge table (for timeout/memory tests)
  tables.set('com/example/api/huge_table', {
    partitions: [
      {
        path: 'data/huge_table/p1.bin',
        partitionValues: {},
        sizeBytes: 100000000,
        rowCount: 10000000,
        zoneMap: { columns: {} },
        isCached: false,
      },
    ],
    rows: [],
    schema: { id: 'number' },
  });

  return tables;
}

// =============================================================================
// MockDataSource Implementation
// =============================================================================

/**
 * MockDataSource - Provides in-memory test data for query engine testing.
 *
 * This data source contains pre-configured test tables (users, orders, events, etc.)
 * with realistic mock data. It's designed to be used in test environments where
 * actual R2 bucket access is not needed or desired.
 *
 * @example
 * ```typescript
 * const dataSource = new MockDataSource();
 * const engine = createQueryEngine({ bucket, dataSource });
 *
 * // Or use the factory function
 * const dataSource = createMockDataSource();
 * ```
 */
export class MockDataSource implements TableDataSource {
  private tables: Map<string, MockTableDefinition>;

  constructor(tables?: Map<string, MockTableDefinition>) {
    this.tables = tables ?? createDefaultMockTables();
  }

  async getTableMetadata(tableName: string): Promise<TableDataSourceMetadata | null> {
    const table = this.tables.get(tableName);
    if (!table) {
      return null;
    }

    return {
      tableName,
      partitions: table.partitions,
      schema: table.schema,
      rowCount: table.rows.length,
    };
  }

  async readPartition(partition: PartitionInfo, columns?: string[]): Promise<Record<string, unknown>[]> {
    for (const [, table] of this.tables) {
      if (table.partitions.some((p) => p.path === partition.path)) {
        if (!columns) {
          return table.rows;
        }
        return table.rows.map((row) => {
          const projected: Record<string, unknown> = {};
          for (const col of columns) {
            projected[col] = row[col];
          }
          return projected;
        });
      }
    }
    return [];
  }

  async *streamPartition(
    partition: PartitionInfo,
    columns?: string[]
  ): AsyncIterableIterator<Record<string, unknown>> {
    const rows = await this.readPartition(partition, columns);
    for (const row of rows) {
      yield row;
    }
  }

  /** @internal Get all rows for a table */
  getTableRows(tableName: string): Record<string, unknown>[] | null {
    const table = this.tables.get(tableName);
    return table ? table.rows : null;
  }

  /** @internal Check if this is a simulated huge table */
  isHugeTable(tableName: string): boolean {
    return tableName === 'com/example/api/huge_table';
  }

  /** @internal Add a custom table for testing */
  addTable(tableName: string, definition: MockTableDefinition): void {
    this.tables.set(tableName, definition);
  }

  /** @internal Remove a table */
  removeTable(tableName: string): boolean {
    return this.tables.delete(tableName);
  }

  /** @internal Get all table names */
  getTableNames(): string[] {
    return Array.from(this.tables.keys());
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a MockDataSource with default test data.
 */
export function createMockDataSource(): MockDataSource {
  return new MockDataSource();
}

/**
 * Create a MockDataSource with custom tables.
 */
export function createMockDataSourceWithTables(
  tables: Map<string, MockTableDefinition>
): MockDataSource {
  return new MockDataSource(tables);
}

/**
 * Create an empty MockDataSource (no tables).
 */
export function createEmptyMockDataSource(): MockDataSource {
  return new MockDataSource(new Map());
}
