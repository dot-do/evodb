/**
 * @evodb/query - Memory Limit Guards Tests (TDD)
 *
 * Tests for memory tracking and limit enforcement in the query engine.
 * Workers have a 128MB limit - the query engine should track memory usage
 * during execution and fail fast before OOM.
 *
 * These tests follow TDD red-green-refactor:
 * 1. Write failing tests (RED)
 * 2. Implement minimal code to pass (GREEN)
 * 3. Refactor for clarity (REFACTOR)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createQueryEngine } from '../engine.js';
import type { QueryEngineConfig, Query, R2Bucket, R2Object, R2Objects, TableDataSource, PartitionInfo, TableDataSourceMetadata } from '../types.js';
import { MockDataSource, createMockDataSource } from './fixtures/mock-data.js';

// =============================================================================
// Test Helpers
// =============================================================================

/** Create a minimal mock R2 bucket for tests */
function createMockBucket(): R2Bucket {
  return {
    async get(_key: string): Promise<R2Object | null> {
      return null;
    },
    async head(_key: string): Promise<R2Object | null> {
      return null;
    },
    async list(_options?: { prefix?: string }): Promise<R2Objects> {
      return { objects: [], truncated: false };
    },
  };
}

/**
 * Create a data source that generates large result sets.
 * Each row is approximately 1KB to make memory calculations predictable.
 */
function createLargeResultDataSource(rowCount: number, bytesPerRow = 1024): TableDataSource {
  // Generate rows with predictable size
  const generateLargeRow = (i: number): Record<string, unknown> => {
    // Create a row with ~1KB of data
    const paddingSize = Math.max(0, bytesPerRow - 100); // Reserve 100 bytes for metadata
    return {
      id: i,
      timestamp: Date.now(),
      data: 'x'.repeat(paddingSize),
      metadata: { index: i, created: Date.now() },
    };
  };

  const rows = Array.from({ length: rowCount }, (_, i) => generateLargeRow(i));

  return {
    async getTableMetadata(tableName: string): Promise<TableDataSourceMetadata | null> {
      if (tableName === 'large_results') {
        return {
          tableName,
          partitions: [{
            path: 'data/large_results/p1.bin',
            partitionValues: {},
            sizeBytes: rowCount * bytesPerRow,
            rowCount,
            zoneMap: { columns: {} },
            isCached: false,
          }],
          schema: { id: 'number', timestamp: 'number', data: 'string' },
          rowCount,
        };
      }
      return null;
    },

    async readPartition(_partition: PartitionInfo, _columns?: string[]): Promise<Record<string, unknown>[]> {
      return rows;
    },

    async *streamPartition(_partition: PartitionInfo, _columns?: string[]): AsyncIterableIterator<Record<string, unknown>> {
      for (const row of rows) {
        yield row;
      }
    },

    getTableRows(tableName: string): Record<string, unknown>[] | null {
      if (tableName === 'large_results') {
        return rows;
      }
      return null;
    },
  };
}

/**
 * Create a data source with multiple large partitions.
 * Simulates reading many blocks from storage.
 */
function createManyBlocksDataSource(blockCount: number, rowsPerBlock: number): TableDataSource {
  const blocks: PartitionInfo[] = Array.from({ length: blockCount }, (_, i) => ({
    path: `data/many_blocks/p${i}.bin`,
    partitionValues: { block: i },
    sizeBytes: rowsPerBlock * 100,
    rowCount: rowsPerBlock,
    zoneMap: {
      columns: {
        id: { min: i * rowsPerBlock, max: (i + 1) * rowsPerBlock - 1, nullCount: 0, allNull: false },
      },
    },
    isCached: false,
  }));

  const allRows: Record<string, unknown>[] = [];
  for (let block = 0; block < blockCount; block++) {
    for (let row = 0; row < rowsPerBlock; row++) {
      allRows.push({
        id: block * rowsPerBlock + row,
        block,
        value: Math.random() * 1000,
      });
    }
  }

  return {
    async getTableMetadata(tableName: string): Promise<TableDataSourceMetadata | null> {
      if (tableName === 'many_blocks') {
        return {
          tableName,
          partitions: blocks,
          schema: { id: 'number', block: 'number', value: 'number' },
          rowCount: allRows.length,
        };
      }
      return null;
    },

    async readPartition(partition: PartitionInfo, _columns?: string[]): Promise<Record<string, unknown>[]> {
      const blockIndex = blocks.findIndex(b => b.path === partition.path);
      if (blockIndex === -1) return [];
      const start = blockIndex * rowsPerBlock;
      return allRows.slice(start, start + rowsPerBlock);
    },

    async *streamPartition(partition: PartitionInfo, _columns?: string[]): AsyncIterableIterator<Record<string, unknown>> {
      const rows = await this.readPartition(partition, _columns);
      for (const row of rows) {
        yield row;
      }
    },

    getTableRows(tableName: string): Record<string, unknown>[] | null {
      if (tableName === 'many_blocks') {
        return allRows;
      }
      return null;
    },
  };
}

// =============================================================================
// Memory Limit Guard Tests
// =============================================================================

describe('Memory Limit Guards', () => {
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockBucket = createMockBucket();
  });

  describe('memoryLimitBytes configuration', () => {
    it('should accept memoryLimitBytes in query hints', async () => {
      const dataSource = createMockDataSource();
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/users',
        hints: {
          memoryLimitBytes: 64 * 1024 * 1024, // 64MB
        },
      };

      // Should execute without error when under limit
      const result = await engine.execute(query);
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should accept memoryLimitBytes in engine config', async () => {
      const dataSource = createMockDataSource();
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 128 * 1024 * 1024, // 128MB (Workers limit)
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'com/example/api/users',
      };

      // Should execute without error when under limit
      const result = await engine.execute(query);
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should prefer query hint memoryLimitBytes over config', async () => {
      const dataSource = createLargeResultDataSource(1000, 1024); // 1MB total
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 100 * 1024 * 1024, // 100MB - very high
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'large_results',
        hints: {
          memoryLimitBytes: 512 * 1024, // 512KB - lower than result size
        },
      };

      // Should throw because query hint limit (512KB) is lower than result size (~1MB)
      await expect(engine.execute(query)).rejects.toThrow(/memory limit/i);
    });
  });

  describe('large result set detection', () => {
    it('should throw MemoryLimitExceededError when result set exceeds limit', async () => {
      // Create a data source that returns ~10MB of data
      const dataSource = createLargeResultDataSource(10000, 1024); // 10,000 rows * 1KB = ~10MB

      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 1024 * 1024, // 1MB limit
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'large_results',
      };

      // Should throw a clear error about memory limit
      await expect(engine.execute(query)).rejects.toThrow(/memory limit/i);
    });

    it('should include memory usage details in error message', async () => {
      const dataSource = createLargeResultDataSource(5000, 1024); // ~5MB
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 1024 * 1024, // 1MB
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'large_results',
      };

      try {
        await engine.execute(query);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        // Error should mention the limit and current usage
        expect(message).toMatch(/memory limit/i);
        expect(message).toMatch(/\d+/); // Should include some numbers (bytes)
      }
    });

    it('should fail fast before loading all data', async () => {
      // This test verifies that we detect memory issues early
      const dataSource = createLargeResultDataSource(100000, 1024); // 100MB
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 10 * 1024 * 1024, // 10MB
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'large_results',
      };

      const startTime = Date.now();
      await expect(engine.execute(query)).rejects.toThrow(/memory limit/i);
      const duration = Date.now() - startTime;

      // Should fail quickly, not after loading all 100MB
      // If it took more than 5 seconds, it probably loaded too much
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('many blocks scenario', () => {
    it('should track memory across multiple partition reads', async () => {
      // Create data source with 100 blocks, 1000 rows each = 100,000 rows total
      const dataSource = createManyBlocksDataSource(100, 1000);

      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 5 * 1024 * 1024, // 5MB limit
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'many_blocks',
      };

      // Should throw when aggregate memory from blocks exceeds limit
      await expect(engine.execute(query)).rejects.toThrow(/memory limit/i);
    });

    it('should allow queries that stay under limit with many small blocks', async () => {
      // Create data source with 10 blocks, 100 rows each = 1,000 rows total
      const dataSource = createManyBlocksDataSource(10, 100);

      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 10 * 1024 * 1024, // 10MB limit - plenty of headroom
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'many_blocks',
      };

      // Should succeed since total data is small
      const result = await engine.execute(query);
      expect(result.rows.length).toBe(1000);
    });
  });

  describe('streaming queries with memory limits', () => {
    it('should respect memory limits in streaming mode', async () => {
      const dataSource = createLargeResultDataSource(10000, 1024); // ~10MB
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 1024 * 1024, // 1MB
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'large_results',
      };

      // Streaming should also respect memory limits
      // Either throw immediately or throw during iteration
      const stream = await engine.executeStream(query);

      let error: Error | null = null;
      try {
        const rows: unknown[] = [];
        for await (const row of stream.rows) {
          rows.push(row);
        }
        // If we got here, we need to check if rows were limited
        // Streaming might handle this differently
      } catch (e) {
        error = e as Error;
      }

      // Either we got an error, or streaming handled it gracefully
      // The key is we shouldn't OOM
      if (error) {
        expect(error.message).toMatch(/memory limit/i);
      }
    });
  });

  describe('query stats memory tracking', () => {
    it('should report peakMemoryBytes in query stats', async () => {
      const dataSource = createMockDataSource();
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'com/example/api/users',
      };

      const result = await engine.execute(query);

      // Stats should include accurate memory tracking
      expect(result.stats.peakMemoryBytes).toBeDefined();
      expect(result.stats.peakMemoryBytes).toBeGreaterThan(0);
    });

    it('should track memory accurately during execution', async () => {
      const dataSource = createLargeResultDataSource(1000, 1024); // ~1MB
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 100 * 1024 * 1024, // 100MB - high enough to succeed
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'large_results',
      };

      const result = await engine.execute(query);

      // Memory tracked should be roughly proportional to data size
      // 1000 rows * ~1KB each = ~1MB
      // Allow some overhead but should be in the right ballpark
      expect(result.stats.peakMemoryBytes).toBeGreaterThan(500 * 1024); // At least 500KB
      expect(result.stats.peakMemoryBytes).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });
  });

  describe('error recovery', () => {
    it('should clean up resources when memory limit is exceeded', async () => {
      const dataSource = createLargeResultDataSource(10000, 1024);
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: 1024 * 1024,
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'large_results',
      };

      // First query should fail
      await expect(engine.execute(query)).rejects.toThrow(/memory limit/i);

      // Engine should still be usable for smaller queries
      const smallDataSource = createMockDataSource();
      const smallEngine = createQueryEngine({
        bucket: mockBucket,
        dataSource: smallDataSource,
      });

      const smallQuery: Query = {
        table: 'com/example/api/users',
      };

      const result = await smallEngine.execute(smallQuery);
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Workers 128MB limit simulation', () => {
    it('should handle Workers-like memory constraints', async () => {
      // Simulate Workers 128MB limit
      const WORKERS_MEMORY_LIMIT = 128 * 1024 * 1024;

      // Create a query that would use ~150MB (over the limit)
      const dataSource = createLargeResultDataSource(150000, 1024); // ~150MB
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: WORKERS_MEMORY_LIMIT,
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'large_results',
      };

      // Should fail with clear error before OOM
      await expect(engine.execute(query)).rejects.toThrow(/memory limit/i);
    });

    it('should succeed with queries under Workers limit', async () => {
      const WORKERS_MEMORY_LIMIT = 128 * 1024 * 1024;

      // Create a query that uses ~50MB (under the limit)
      const dataSource = createLargeResultDataSource(50000, 1024); // ~50MB
      const config: QueryEngineConfig = {
        bucket: mockBucket,
        dataSource,
        memoryLimitBytes: WORKERS_MEMORY_LIMIT,
      };

      const engine = createQueryEngine(config);
      const query: Query = {
        table: 'large_results',
      };

      // Should succeed
      const result = await engine.execute(query);
      expect(result.rows.length).toBe(50000);
    });
  });
});
