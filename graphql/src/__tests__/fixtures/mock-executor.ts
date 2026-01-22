/**
 * Mock query executor for testing GraphQL resolvers.
 */

import type {
  QueryExecutor,
  ExecutorQuery,
  ExecutorResult,
  ExecutorPlan,
} from '@evodb/query';

/**
 * Mock data store for testing.
 */
export interface MockDataStore {
  [tableName: string]: Record<string, unknown>[];
}

/**
 * Create a mock query executor with test data.
 */
export function createMockExecutor(initialData: MockDataStore = {}): QueryExecutor & {
  getData: () => MockDataStore;
  setData: (tableName: string, data: Record<string, unknown>[]) => void;
} {
  const data: MockDataStore = { ...initialData };

  return {
    getData: () => data,
    setData: (tableName: string, rows: Record<string, unknown>[]) => {
      data[tableName] = rows;
    },

    async execute<T = Record<string, unknown>>(
      query: ExecutorQuery
    ): Promise<ExecutorResult<T>> {
      const tableData = data[query.table] ?? [];
      let rows = [...tableData];

      // Apply predicates
      if (query.predicates) {
        for (const predicate of query.predicates) {
          rows = rows.filter((row) => {
            const value = row[predicate.column];

            let matches = false;
            switch (predicate.operator) {
              case 'eq':
                matches = value === predicate.value;
                break;
              case 'ne':
                matches = value !== predicate.value;
                break;
              case 'gt':
                matches = (value as number) > (predicate.value as number);
                break;
              case 'gte':
              case 'ge':
                matches = (value as number) >= (predicate.value as number);
                break;
              case 'lt':
                matches = (value as number) < (predicate.value as number);
                break;
              case 'lte':
              case 'le':
                matches = (value as number) <= (predicate.value as number);
                break;
              case 'in':
                matches = (predicate.values ?? []).includes(value);
                break;
              case 'notIn':
                matches = !(predicate.values ?? []).includes(value);
                break;
              case 'like':
                if (typeof value === 'string' && typeof predicate.value === 'string') {
                  const pattern = predicate.value.replace(/%/g, '.*').replace(/_/g, '.');
                  matches = new RegExp(`^${pattern}$`, 'i').test(value);
                }
                break;
              case 'isNull':
                matches = value === null || value === undefined;
                break;
              case 'isNotNull':
                matches = value !== null && value !== undefined;
                break;
              default:
                matches = true;
            }

            return predicate.not ? !matches : matches;
          });
        }
      }

      // Apply sorting
      if (query.orderBy) {
        rows.sort((a, b) => {
          for (const order of query.orderBy!) {
            const aVal = a[order.column];
            const bVal = b[order.column];

            if (aVal === bVal) continue;

            // Handle nulls
            if (aVal === null || aVal === undefined) {
              return order.nulls === 'first' ? -1 : 1;
            }
            if (bVal === null || bVal === undefined) {
              return order.nulls === 'first' ? 1 : -1;
            }

            const comparison = aVal < bVal ? -1 : 1;
            return order.direction === 'asc' ? comparison : -comparison;
          }
          return 0;
        });
      }

      const totalRowCount = rows.length;

      // Apply offset
      if (query.offset) {
        rows = rows.slice(query.offset);
      }

      // Apply limit
      if (query.limit) {
        rows = rows.slice(0, query.limit);
      }

      // Apply column projection
      if (query.columns) {
        rows = rows.map((row) => {
          const projected: Record<string, unknown> = {};
          for (const col of query.columns!) {
            if (col in row) {
              projected[col] = row[col];
            }
          }
          return projected;
        });
      }

      return {
        rows: rows as T[],
        totalRowCount,
        hasMore: query.limit !== undefined && totalRowCount > (query.offset ?? 0) + query.limit,
        stats: {
          executionTimeMs: 1,
          rowsScanned: tableData.length,
          rowsReturned: rows.length,
        },
      };
    },

    async explain(query: ExecutorQuery): Promise<ExecutorPlan> {
      const tableData = data[query.table] ?? [];

      return {
        planId: `plan-${Date.now()}`,
        query,
        estimatedCost: {
          rowsToScan: tableData.length,
          bytesToRead: tableData.length * 100,
          outputRows: query.limit ?? tableData.length,
          totalCost: tableData.length,
        },
        createdAt: Date.now(),
        description: `Full scan of ${query.table}`,
      };
    },
  };
}

/**
 * Sample test data for users table.
 */
export const SAMPLE_USERS = [
  {
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice',
    status: 'active',
    age: 30,
    created_at: new Date('2024-01-01'),
  },
  {
    id: 'user-2',
    email: 'bob@example.com',
    name: 'Bob',
    status: 'active',
    age: 25,
    created_at: new Date('2024-01-02'),
  },
  {
    id: 'user-3',
    email: 'charlie@example.com',
    name: 'Charlie',
    status: 'inactive',
    age: 35,
    created_at: new Date('2024-01-03'),
  },
  {
    id: 'user-4',
    email: 'diana@test.com',
    name: null,
    status: 'pending',
    age: 28,
    created_at: new Date('2024-01-04'),
  },
];

/**
 * Sample test data for orders table.
 */
export const SAMPLE_ORDERS = [
  {
    id: 'order-1',
    user_id: 'user-1',
    total: 100.0,
    status: 'completed',
    created_at: new Date('2024-02-01'),
  },
  {
    id: 'order-2',
    user_id: 'user-1',
    total: 250.0,
    status: 'pending',
    created_at: new Date('2024-02-02'),
  },
  {
    id: 'order-3',
    user_id: 'user-2',
    total: 75.0,
    status: 'completed',
    created_at: new Date('2024-02-03'),
  },
];

/**
 * Sample table definitions.
 */
export const SAMPLE_TABLES = [
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'uuid' as const, nullable: false },
      { name: 'email', type: 'string' as const, nullable: false },
      { name: 'name', type: 'string' as const, nullable: true },
      { name: 'status', type: 'string' as const, nullable: false },
      { name: 'age', type: 'int32' as const, nullable: false },
      { name: 'created_at', type: 'timestamp' as const, nullable: false },
    ],
    primaryKey: 'id',
    description: 'User accounts',
  },
  {
    name: 'orders',
    columns: [
      { name: 'id', type: 'uuid' as const, nullable: false },
      { name: 'user_id', type: 'uuid' as const, nullable: false },
      { name: 'total', type: 'float64' as const, nullable: false },
      { name: 'status', type: 'string' as const, nullable: false },
      { name: 'created_at', type: 'timestamp' as const, nullable: false },
    ],
    primaryKey: 'id',
    description: 'Customer orders',
  },
];
