/**
 * @evodb/e2e - End-to-End Write-Read Integration Test
 *
 * This test exercises the full write-read path:
 * 1. Creates a writer with in-memory storage
 * 2. Inserts data
 * 3. Creates a reader
 * 4. Queries the data back
 * 5. Verifies results
 *
 * Uses in-memory storage adapters for CI (no real R2 needed).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockR2Bucket } from './mock-r2.js';
import { InMemoryBlockWriter } from '@evodb/writer';
import { createWalEntry, WalOp, type WalEntry } from '@evodb/core';
import { QueryEngine, type ReaderConfig } from '@evodb/reader';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Sample user data for testing
 */
const sampleUsers = [
  { id: 1, name: 'Alice', age: 30, active: true },
  { id: 2, name: 'Bob', age: 25, active: false },
  { id: 3, name: 'Charlie', age: 35, active: true },
  { id: 4, name: 'Diana', age: 28, active: true },
  { id: 5, name: 'Eve', age: 32, active: false },
];

/**
 * Convert rows to columnar format (expected by reader)
 */
function toColumnarFormat(rows: Record<string, unknown>[]): Record<string, unknown[]> {
  if (rows.length === 0) return {};

  const columns: Record<string, unknown[]> = {};
  const columnNames = Object.keys(rows[0]);

  for (const col of columnNames) {
    columns[col] = rows.map(row => row[col]);
  }

  return columns;
}

/**
 * Create a manifest.json for the mock R2 bucket
 */
function createManifest(
  tableName: string,
  blockPaths: string[],
  schema: Array<{ name: string; type: string; nullable: boolean }>,
  rowCount: number
): object {
  return {
    version: 1,
    tables: {
      [tableName]: {
        name: tableName,
        schema: schema.map(s => ({
          name: s.name,
          type: s.type,
          nullable: s.nullable,
        })),
        blockPaths,
        rowCount,
        lastUpdated: Date.now(),
      },
    },
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('E2E Write-Read Integration', () => {
  let bucket: MockR2Bucket;
  let blockWriter: InMemoryBlockWriter;

  beforeEach(() => {
    bucket = new MockR2Bucket();
    blockWriter = new InMemoryBlockWriter();
  });

  describe('Full Write-Read Path', () => {
    it('should write data and read it back via query engine', async () => {
      // Step 1: Write data to a block using createWalEntry
      // createWalEntry(doc, lsn, op) creates a proper WAL entry with timestamp
      const walEntries: WalEntry[] = sampleUsers.map((user, i) =>
        createWalEntry(user, BigInt(i + 1), WalOp.Insert)
      );

      const writeResult = await blockWriter.write(
        walEntries,
        1n, // minLsn
        5n, // maxLsn
        1   // seq
      );

      expect(writeResult.success).toBe(true);
      expect(writeResult.metadata).toBeDefined();
      expect(writeResult.metadata!.rowCount).toBe(5);

      // Step 2: Store columnar block data in mock R2
      const columnarData = toColumnarFormat(sampleUsers);
      const blockPath = 'data/users/block-001.json';
      await bucket.put(blockPath, JSON.stringify(columnarData));

      // Step 3: Create manifest and store in R2
      const manifest = createManifest(
        'users',
        [blockPath],
        [
          { name: 'id', type: 'int64', nullable: false },
          { name: 'name', type: 'string', nullable: false },
          { name: 'age', type: 'int32', nullable: false },
          { name: 'active', type: 'boolean', nullable: false },
        ],
        sampleUsers.length
      );
      await bucket.put('manifest.json', JSON.stringify(manifest));

      // Step 4: Create query engine with mock bucket
      const config: ReaderConfig = {
        bucket: bucket,
        cache: { enableCacheApi: false }, // Disable cache for tests
      };
      const queryEngine = new QueryEngine(config);

      // Step 5: Query data back
      const result = await queryEngine.query({
        table: 'users',
        columns: ['id', 'name', 'age', 'active'],
      });

      // Verify results
      expect(result.columns).toEqual(['id', 'name', 'age', 'active']);
      expect(result.rows.length).toBe(5);
      expect(result.stats.blocksScanned).toBe(1);
      expect(result.stats.rowsScanned).toBe(5);
      expect(result.stats.rowsReturned).toBe(5);

      // Verify data integrity
      const returnedIds = result.rows.map(row => row[0]);
      expect(returnedIds).toEqual([1, 2, 3, 4, 5]);
    });

    it('should filter data during read', async () => {
      // Setup: Store data in mock R2
      const columnarData = toColumnarFormat(sampleUsers);
      const blockPath = 'data/users/block-001.json';
      await bucket.put(blockPath, JSON.stringify(columnarData));

      const manifest = createManifest(
        'users',
        [blockPath],
        [
          { name: 'id', type: 'int64', nullable: false },
          { name: 'name', type: 'string', nullable: false },
          { name: 'age', type: 'int32', nullable: false },
          { name: 'active', type: 'boolean', nullable: false },
        ],
        sampleUsers.length
      );
      await bucket.put('manifest.json', JSON.stringify(manifest));

      const config: ReaderConfig = {
        bucket: bucket,
        cache: { enableCacheApi: false },
      };
      const queryEngine = new QueryEngine(config);

      // Query with filter: age > 28
      const result = await queryEngine.query({
        table: 'users',
        columns: ['id', 'name', 'age'],
        filters: [{ column: 'age', operator: 'gt', value: 28 }],
      });

      expect(result.rows.length).toBe(3); // Alice (30), Charlie (35), Eve (32)
      const names = result.rows.map(row => row[1]);
      expect(names).toContain('Alice');
      expect(names).toContain('Charlie');
      expect(names).toContain('Eve');
    });

    it('should filter by boolean equality', async () => {
      const columnarData = toColumnarFormat(sampleUsers);
      const blockPath = 'data/users/block-001.json';
      await bucket.put(blockPath, JSON.stringify(columnarData));

      const manifest = createManifest(
        'users',
        [blockPath],
        [
          { name: 'id', type: 'int64', nullable: false },
          { name: 'name', type: 'string', nullable: false },
          { name: 'age', type: 'int32', nullable: false },
          { name: 'active', type: 'boolean', nullable: false },
        ],
        sampleUsers.length
      );
      await bucket.put('manifest.json', JSON.stringify(manifest));

      const config: ReaderConfig = {
        bucket: bucket,
        cache: { enableCacheApi: false },
      };
      const queryEngine = new QueryEngine(config);

      // Query: active == true
      const result = await queryEngine.query({
        table: 'users',
        columns: ['id', 'name', 'active'],
        filters: [{ column: 'active', operator: 'eq', value: true }],
      });

      expect(result.rows.length).toBe(3); // Alice, Charlie, Diana
      for (const row of result.rows) {
        expect(row[2]).toBe(true);
      }
    });

    it('should sort results', async () => {
      const columnarData = toColumnarFormat(sampleUsers);
      const blockPath = 'data/users/block-001.json';
      await bucket.put(blockPath, JSON.stringify(columnarData));

      const manifest = createManifest(
        'users',
        [blockPath],
        [
          { name: 'id', type: 'int64', nullable: false },
          { name: 'name', type: 'string', nullable: false },
          { name: 'age', type: 'int32', nullable: false },
          { name: 'active', type: 'boolean', nullable: false },
        ],
        sampleUsers.length
      );
      await bucket.put('manifest.json', JSON.stringify(manifest));

      const config: ReaderConfig = {
        bucket: bucket,
        cache: { enableCacheApi: false },
      };
      const queryEngine = new QueryEngine(config);

      // Query with order by age desc
      const result = await queryEngine.query({
        table: 'users',
        columns: ['name', 'age'],
        orderBy: [{ column: 'age', direction: 'desc' }],
      });

      expect(result.rows.length).toBe(5);
      expect(result.rows[0][0]).toBe('Charlie'); // 35
      expect(result.rows[1][0]).toBe('Eve');     // 32
      expect(result.rows[2][0]).toBe('Alice');   // 30
      expect(result.rows[3][0]).toBe('Diana');   // 28
      expect(result.rows[4][0]).toBe('Bob');     // 25
    });

    it('should apply limit and offset', async () => {
      const columnarData = toColumnarFormat(sampleUsers);
      const blockPath = 'data/users/block-001.json';
      await bucket.put(blockPath, JSON.stringify(columnarData));

      const manifest = createManifest(
        'users',
        [blockPath],
        [
          { name: 'id', type: 'int64', nullable: false },
          { name: 'name', type: 'string', nullable: false },
          { name: 'age', type: 'int32', nullable: false },
          { name: 'active', type: 'boolean', nullable: false },
        ],
        sampleUsers.length
      );
      await bucket.put('manifest.json', JSON.stringify(manifest));

      const config: ReaderConfig = {
        bucket: bucket,
        cache: { enableCacheApi: false },
      };
      const queryEngine = new QueryEngine(config);

      // Query with limit 2, offset 1
      const result = await queryEngine.query({
        table: 'users',
        columns: ['id', 'name'],
        limit: 2,
        offset: 1,
      });

      expect(result.rows.length).toBe(2);
      expect(result.rows[0][0]).toBe(2); // Bob
      expect(result.rows[1][0]).toBe(3); // Charlie
    });

    it('should aggregate data', async () => {
      const columnarData = toColumnarFormat(sampleUsers);
      const blockPath = 'data/users/block-001.json';
      await bucket.put(blockPath, JSON.stringify(columnarData));

      const manifest = createManifest(
        'users',
        [blockPath],
        [
          { name: 'id', type: 'int64', nullable: false },
          { name: 'name', type: 'string', nullable: false },
          { name: 'age', type: 'int32', nullable: false },
          { name: 'active', type: 'boolean', nullable: false },
        ],
        sampleUsers.length
      );
      await bucket.put('manifest.json', JSON.stringify(manifest));

      const config: ReaderConfig = {
        bucket: bucket,
        cache: { enableCacheApi: false },
      };
      const queryEngine = new QueryEngine(config);

      // Aggregate: count, sum(age), avg(age), min(age), max(age)
      const result = await queryEngine.query({
        table: 'users',
        aggregates: [
          { function: 'count', alias: 'total_count' },
          { function: 'sum', column: 'age', alias: 'total_age' },
          { function: 'avg', column: 'age', alias: 'avg_age' },
          { function: 'min', column: 'age', alias: 'min_age' },
          { function: 'max', column: 'age', alias: 'max_age' },
        ],
      });

      expect(result.rows.length).toBe(1);
      expect(result.columns).toEqual(['total_count', 'total_age', 'avg_age', 'min_age', 'max_age']);

      const [count, sumAge, avgAge, minAge, maxAge] = result.rows[0];
      expect(count).toBe(5);
      expect(sumAge).toBe(150); // 30+25+35+28+32
      expect(avgAge).toBe(30);  // 150/5
      expect(minAge).toBe(25);  // Bob
      expect(maxAge).toBe(35);  // Charlie
    });
  });

  describe('Multiple Blocks', () => {
    it('should read data from multiple blocks', async () => {
      // Split users into two blocks
      const block1Users = sampleUsers.slice(0, 3);
      const block2Users = sampleUsers.slice(3);

      const blockPath1 = 'data/users/block-001.json';
      const blockPath2 = 'data/users/block-002.json';

      await bucket.put(blockPath1, JSON.stringify(toColumnarFormat(block1Users)));
      await bucket.put(blockPath2, JSON.stringify(toColumnarFormat(block2Users)));

      const manifest = createManifest(
        'users',
        [blockPath1, blockPath2],
        [
          { name: 'id', type: 'int64', nullable: false },
          { name: 'name', type: 'string', nullable: false },
          { name: 'age', type: 'int32', nullable: false },
          { name: 'active', type: 'boolean', nullable: false },
        ],
        sampleUsers.length
      );
      await bucket.put('manifest.json', JSON.stringify(manifest));

      const config: ReaderConfig = {
        bucket: bucket,
        cache: { enableCacheApi: false },
      };
      const queryEngine = new QueryEngine(config);

      const result = await queryEngine.query({
        table: 'users',
        columns: ['id', 'name'],
      });

      expect(result.rows.length).toBe(5);
      expect(result.stats.blocksScanned).toBe(2);

      const allIds = result.rows.map(row => row[0]);
      expect(allIds).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent table', async () => {
      const manifest = createManifest('users', [], [], 0);
      await bucket.put('manifest.json', JSON.stringify(manifest));

      const config: ReaderConfig = {
        bucket: bucket,
        cache: { enableCacheApi: false },
      };
      const queryEngine = new QueryEngine(config);

      await expect(
        queryEngine.query({ table: 'nonexistent' })
      ).rejects.toThrow('Table not found: nonexistent');
    });

    it('should throw error for invalid column', async () => {
      const columnarData = toColumnarFormat(sampleUsers);
      const blockPath = 'data/users/block-001.json';
      await bucket.put(blockPath, JSON.stringify(columnarData));

      const manifest = createManifest(
        'users',
        [blockPath],
        [
          { name: 'id', type: 'int64', nullable: false },
          { name: 'name', type: 'string', nullable: false },
        ],
        sampleUsers.length
      );
      await bucket.put('manifest.json', JSON.stringify(manifest));

      const config: ReaderConfig = {
        bucket: bucket,
        cache: { enableCacheApi: false },
      };
      const queryEngine = new QueryEngine(config);

      await expect(
        queryEngine.query({
          table: 'users',
          columns: ['id', 'nonexistent_column'],
        })
      ).rejects.toThrow('Column not found: nonexistent_column');
    });
  });

  describe('Query Engine Features', () => {
    it('should list tables', async () => {
      const manifest = {
        version: 1,
        tables: {
          users: {
            name: 'users',
            schema: [{ name: 'id', type: 'int64', nullable: false }],
            blockPaths: [],
            rowCount: 0,
            lastUpdated: Date.now(),
          },
          orders: {
            name: 'orders',
            schema: [{ name: 'id', type: 'int64', nullable: false }],
            blockPaths: [],
            rowCount: 0,
            lastUpdated: Date.now(),
          },
        },
      };
      await bucket.put('manifest.json', JSON.stringify(manifest));

      const config: ReaderConfig = {
        bucket: bucket,
        cache: { enableCacheApi: false },
      };
      const queryEngine = new QueryEngine(config);

      const tables = await queryEngine.listTables();
      expect(tables).toEqual(expect.arrayContaining(['users', 'orders']));
      expect(tables.length).toBe(2);
    });

    it('should get table metadata', async () => {
      const columnarData = toColumnarFormat(sampleUsers);
      const blockPath = 'data/users/block-001.json';
      await bucket.put(blockPath, JSON.stringify(columnarData));

      const manifest = createManifest(
        'users',
        [blockPath],
        [
          { name: 'id', type: 'int64', nullable: false },
          { name: 'name', type: 'string', nullable: true },
        ],
        sampleUsers.length
      );
      await bucket.put('manifest.json', JSON.stringify(manifest));

      const config: ReaderConfig = {
        bucket: bucket,
        cache: { enableCacheApi: false },
      };
      const queryEngine = new QueryEngine(config);

      const metadata = await queryEngine.getTableMetadata('users');
      expect(metadata.name).toBe('users');
      expect(metadata.schema.length).toBe(2);
      expect(metadata.blockPaths).toEqual([blockPath]);
      expect(metadata.rowCount).toBe(5);
    });
  });
});
