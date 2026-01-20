/**
 * @evodb/e2e - Query Engine + Lakehouse Integration Test
 *
 * This test exercises the integration between:
 * 1. @evodb/lakehouse - Table manifest management and partition pruning
 * 2. @evodb/query - Query execution with zone map optimization
 *
 * Scenarios:
 * - Create lakehouse table with schema and partition spec
 * - Append data files with column statistics
 * - Query data using zone map pruning
 * - Time-travel queries across snapshots
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTable,
  createManifestFile,
  createFileStats,
  appendFiles,
  queryFiles,
  getFilesForQuery,
  pruneFiles,
  createMemoryAdapter,
  type TableManifest,
  type Snapshot,
  type ManifestFile,
  type QueryFilter,
  type Schema,
} from '@evodb/lakehouse';
import {
  createQueryEngine,
  type Query,
  type QueryEngineConfig,
  type PartitionInfo,
  type TableDataSource,
  type TableDataSourceMetadata,
} from '@evodb/query';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Sample events data for testing
 */
const sampleEvents = [
  { id: 1, user_id: 'u1', event_type: 'click', timestamp: Date.now() - 3600000, amount: 10.5 },
  { id: 2, user_id: 'u2', event_type: 'view', timestamp: Date.now() - 3000000, amount: 0 },
  { id: 3, user_id: 'u1', event_type: 'purchase', timestamp: Date.now() - 2400000, amount: 99.99 },
  { id: 4, user_id: 'u3', event_type: 'click', timestamp: Date.now() - 1800000, amount: 5.0 },
  { id: 5, user_id: 'u2', event_type: 'purchase', timestamp: Date.now() - 1200000, amount: 150.0 },
];

/**
 * Mock data source that uses lakehouse manifest for metadata
 */
class LakehouseDataSource implements TableDataSource {
  private readonly dataByPath: Map<string, Record<string, unknown>[]>;
  private readonly manifest: TableManifest;
  private readonly snapshot: Snapshot | null;

  constructor(
    manifest: TableManifest,
    snapshot: Snapshot | null,
    dataByPath: Map<string, Record<string, unknown>[]>
  ) {
    this.manifest = manifest;
    this.snapshot = snapshot;
    this.dataByPath = dataByPath;
  }

  async getTableMetadata(tableName: string): Promise<TableDataSourceMetadata | null> {
    // Check if the table matches our manifest location
    if (!this.manifest.location.includes(tableName)) {
      return null;
    }

    const files = this.snapshot?.manifestList ?? [];

    const partitions: PartitionInfo[] = files.map((file) => ({
      path: file.path,
      partitionValues: Object.fromEntries(
        file.partitions.map((p) => [p.name, p.value])
      ),
      sizeBytes: file.length,
      rowCount: file.stats.rowCount,
      zoneMap: {
        columns: Object.fromEntries(
          Object.entries(file.stats.columnStats).map(([col, stats]) => [
            col,
            {
              min: stats.min,
              max: stats.max,
              nullCount: stats.nullCount,
              allNull: stats.nullCount === file.stats.rowCount,
            },
          ])
        ),
      },
      isCached: false,
    }));

    const totalRows = files.reduce((sum, f) => sum + f.stats.rowCount, 0);

    return {
      tableName,
      partitions,
      schema: {},
      rowCount: totalRows,
    };
  }

  async readPartition(partition: PartitionInfo): Promise<Record<string, unknown>[]> {
    return this.dataByPath.get(partition.path) ?? [];
  }

  async *streamPartition(partition: PartitionInfo): AsyncIterableIterator<Record<string, unknown>> {
    const rows = await this.readPartition(partition);
    for (const row of rows) {
      yield row;
    }
  }

  // Optional method for optimization
  getTableRows(tableName: string): Record<string, unknown>[] | null {
    if (!this.manifest.location.includes(tableName)) {
      return null;
    }

    const allRows: Record<string, unknown>[] = [];
    for (const rows of this.dataByPath.values()) {
      allRows.push(...rows);
    }
    return allRows;
  }
}

// =============================================================================
// Test Suite
// =============================================================================

describe('Query -> Lakehouse Integration', () => {
  let manifest: TableManifest;
  let schema: Schema;
  let snapshot: Snapshot | null;
  let dataByPath: Map<string, Record<string, unknown>[]>;

  beforeEach(() => {
    // Create a lakehouse table
    const result = createTable({
      location: 'data/events',
      schema: {
        columns: [
          { name: 'id', type: 'int64', nullable: false },
          { name: 'user_id', type: 'string', nullable: false },
          { name: 'event_type', type: 'string', nullable: false },
          { name: 'timestamp', type: 'timestamp', nullable: false },
          { name: 'amount', type: 'float64', nullable: true },
        ],
      },
    });

    manifest = result.manifest;
    schema = result.schema;
    snapshot = null;
    dataByPath = new Map();
  });

  describe('Table Creation and File Append', () => {
    it('should create a lakehouse table and append files', () => {
      // Create manifest file entries with column statistics
      const file1 = createManifestFile(
        'data/events/block-001.bin',
        5000,
        [], // No partitions for this simple test
        createFileStats(3, {
          id: { min: 1, max: 3, nullCount: 0 },
          amount: { min: 0, max: 99.99, nullCount: 0 },
        })
      );

      const file2 = createManifestFile(
        'data/events/block-002.bin',
        3000,
        [],
        createFileStats(2, {
          id: { min: 4, max: 5, nullCount: 0 },
          amount: { min: 5.0, max: 150.0, nullCount: 0 },
        })
      );

      // Append files to table
      const appendResult = appendFiles(manifest, snapshot, [file1, file2]);
      manifest = appendResult.manifest;
      snapshot = appendResult.snapshot;

      // Verify manifest state
      expect(manifest.stats.totalFiles).toBe(2);
      expect(manifest.stats.totalRows).toBe(5);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.manifestList.length).toBe(2);
    });
  });

  describe('Zone Map Pruning via Lakehouse', () => {
    beforeEach(() => {
      // Set up files with distinct zone map ranges
      const file1 = createManifestFile(
        'data/events/block-001.bin',
        5000,
        [],
        createFileStats(3, {
          id: { min: 1, max: 3, nullCount: 0 },
          amount: { min: 0, max: 99.99, nullCount: 0 },
        })
      );

      const file2 = createManifestFile(
        'data/events/block-002.bin',
        3000,
        [],
        createFileStats(2, {
          id: { min: 4, max: 5, nullCount: 0 },
          amount: { min: 100.0, max: 200.0, nullCount: 0 },
        })
      );

      const appendResult = appendFiles(manifest, snapshot, [file1, file2]);
      manifest = appendResult.manifest;
      snapshot = appendResult.snapshot;

      // Store mock data
      dataByPath.set('data/events/block-001.bin', sampleEvents.slice(0, 3));
      dataByPath.set('data/events/block-002.bin', sampleEvents.slice(3));
    });

    it('should prune files based on column statistics', () => {
      const filter: QueryFilter = {
        columns: { amount: { gte: 100 } },
      };

      // Use lakehouse pruneFiles to filter
      const files = snapshot!.manifestList;
      const prunedFiles = pruneFiles(files, filter);

      // Should only include block-002 (amount range 100-200)
      expect(prunedFiles.length).toBe(1);
      expect(prunedFiles[0].path).toBe('data/events/block-002.bin');
    });

    it('should return all files when no filter matches zone maps', () => {
      const filter: QueryFilter = {
        columns: { amount: { gte: 0 } },
      };

      const files = snapshot!.manifestList;
      const prunedFiles = pruneFiles(files, filter);

      // Both files have amount >= 0
      expect(prunedFiles.length).toBe(2);
    });

    it('should return no files when filter excludes all ranges', () => {
      const filter: QueryFilter = {
        columns: { id: { gt: 100 } },
      };

      const files = snapshot!.manifestList;
      const prunedFiles = pruneFiles(files, filter);

      // No files have id > 100
      expect(prunedFiles.length).toBe(0);
    });
  });

  describe('Query Engine with Lakehouse Metadata', () => {
    beforeEach(() => {
      // Set up files with data
      const file1 = createManifestFile(
        'data/events/block-001.bin',
        5000,
        [],
        createFileStats(3, {
          id: { min: 1, max: 3, nullCount: 0 },
          user_id: { min: 'u1', max: 'u2', nullCount: 0 },
          amount: { min: 0, max: 99.99, nullCount: 0 },
        })
      );

      const file2 = createManifestFile(
        'data/events/block-002.bin',
        3000,
        [],
        createFileStats(2, {
          id: { min: 4, max: 5, nullCount: 0 },
          user_id: { min: 'u2', max: 'u3', nullCount: 0 },
          amount: { min: 5.0, max: 150.0, nullCount: 0 },
        })
      );

      const appendResult = appendFiles(manifest, snapshot, [file1, file2]);
      manifest = appendResult.manifest;
      snapshot = appendResult.snapshot;

      // Store actual event data
      dataByPath.set('data/events/block-001.bin', sampleEvents.slice(0, 3));
      dataByPath.set('data/events/block-002.bin', sampleEvents.slice(3));
    });

    it('should execute query with lakehouse data source', async () => {
      const dataSource = new LakehouseDataSource(manifest, snapshot, dataByPath);

      // Create a minimal bucket mock (not used when dataSource is provided)
      const mockBucket = {
        get: async () => null,
        put: async () => ({}),
        delete: async () => {},
        list: async () => ({ objects: [], truncated: false }),
        head: async () => null,
      } as unknown as QueryEngineConfig['bucket'];

      const engine = createQueryEngine({
        bucket: mockBucket,
        dataSource,
      });

      const query: Query = {
        table: 'events',
        projection: { columns: ['id', 'user_id', 'amount'] },
      };

      const result = await engine.execute(query);

      expect(result.rows.length).toBe(5);
      expect(result.stats.partitionsScanned).toBe(2);
    });

    it('should filter results using predicate', async () => {
      const dataSource = new LakehouseDataSource(manifest, snapshot, dataByPath);

      const mockBucket = {
        get: async () => null,
        put: async () => ({}),
        delete: async () => {},
        list: async () => ({ objects: [], truncated: false }),
        head: async () => null,
      } as unknown as QueryEngineConfig['bucket'];

      const engine = createQueryEngine({
        bucket: mockBucket,
        dataSource,
      });

      const query: Query = {
        table: 'events',
        projection: { columns: ['id', 'user_id', 'amount'] },
        predicates: [{ column: 'amount', operator: 'gt', value: 50 }],
      };

      const result = await engine.execute(query);

      // Should return events with amount > 50: purchase (99.99), purchase (150.0)
      expect(result.rows.length).toBe(2);
      for (const row of result.rows) {
        expect((row as Record<string, unknown>).amount).toBeGreaterThan(50);
      }
    });

    it('should aggregate data with lakehouse source', async () => {
      const dataSource = new LakehouseDataSource(manifest, snapshot, dataByPath);

      const mockBucket = {
        get: async () => null,
        put: async () => ({}),
        delete: async () => {},
        list: async () => ({ objects: [], truncated: false }),
        head: async () => null,
      } as unknown as QueryEngineConfig['bucket'];

      const engine = createQueryEngine({
        bucket: mockBucket,
        dataSource,
      });

      const query: Query = {
        table: 'events',
        aggregations: [
          { function: 'count', column: null, alias: 'total' },
          { function: 'sum', column: 'amount', alias: 'total_amount' },
          { function: 'avg', column: 'amount', alias: 'avg_amount' },
        ],
      };

      const result = await engine.execute(query);

      expect(result.rows.length).toBe(1);
      const agg = result.rows[0] as Record<string, unknown>;
      expect(agg.total).toBe(5);
      expect(typeof agg.total_amount).toBe('number');
      expect(typeof agg.avg_amount).toBe('number');
    });

    it('should group by and aggregate', async () => {
      const dataSource = new LakehouseDataSource(manifest, snapshot, dataByPath);

      const mockBucket = {
        get: async () => null,
        put: async () => ({}),
        delete: async () => {},
        list: async () => ({ objects: [], truncated: false }),
        head: async () => null,
      } as unknown as QueryEngineConfig['bucket'];

      const engine = createQueryEngine({
        bucket: mockBucket,
        dataSource,
      });

      const query: Query = {
        table: 'events',
        groupBy: ['event_type'],
        aggregations: [
          { function: 'count', column: null, alias: 'count' },
          { function: 'sum', column: 'amount', alias: 'total_amount' },
        ],
      };

      const result = await engine.execute(query);

      // Should have 3 event types: click, view, purchase
      expect(result.rows.length).toBe(3);

      const byType = new Map(
        result.rows.map((r) => [(r as Record<string, unknown>).event_type, r])
      );

      expect(byType.has('click')).toBe(true);
      expect(byType.has('view')).toBe(true);
      expect(byType.has('purchase')).toBe(true);
    });
  });

  describe('Time Travel Queries', () => {
    it('should support multiple snapshots', () => {
      // First append
      const file1 = createManifestFile(
        'data/events/block-001.bin',
        5000,
        [],
        createFileStats(3, { id: { min: 1, max: 3, nullCount: 0 } })
      );
      let result = appendFiles(manifest, snapshot, [file1]);
      manifest = result.manifest;
      const snapshot1 = result.snapshot;
      const snapshot1Id = snapshot1.snapshotId;

      // Second append
      const file2 = createManifestFile(
        'data/events/block-002.bin',
        3000,
        [],
        createFileStats(2, { id: { min: 4, max: 5, nullCount: 0 } })
      );
      result = appendFiles(manifest, snapshot1, [file2]);
      manifest = result.manifest;
      const snapshot2 = result.snapshot;

      // Verify we have two snapshots
      expect(manifest.snapshots.length).toBe(2);
      expect(snapshot1.manifestList.length).toBe(1);
      expect(snapshot2.manifestList.length).toBe(2);

      // Query files as of snapshot 1 vs snapshot 2
      const filesAtSnapshot1 = getFilesForQuery(snapshot1);
      const filesAtSnapshot2 = getFilesForQuery(snapshot2);

      expect(filesAtSnapshot1.length).toBe(1);
      expect(filesAtSnapshot2.length).toBe(2);
    });
  });

  describe('Partition Pruning', () => {
    it('should prune files by partition values', () => {
      // Create files with different partition values
      const file1 = createManifestFile(
        'data/events/year=2025/block-001.bin',
        5000,
        [{ name: 'year', value: 2025 }],
        createFileStats(100, {})
      );

      const file2 = createManifestFile(
        'data/events/year=2026/block-001.bin',
        5000,
        [{ name: 'year', value: 2026 }],
        createFileStats(100, {})
      );

      const result = appendFiles(manifest, snapshot, [file1, file2]);
      snapshot = result.snapshot;

      // Query with partition filter (using Record format)
      const filter: QueryFilter = {
        partitions: { year: { eq: 2026 } },
      };

      const files = snapshot!.manifestList;
      const prunedFiles = pruneFiles(files, filter);

      // Should only include 2026 file
      expect(prunedFiles.length).toBe(1);
      expect(prunedFiles[0].partitions[0].value).toBe(2026);
    });
  });

  describe('Memory Adapter Integration', () => {
    it('should work with in-memory storage adapter', async () => {
      const adapter = createMemoryAdapter();

      // Store manifest as JSON
      await adapter.writeJson('data/events/_manifest.json', manifest);

      // Read it back
      const readManifest = await adapter.readJson<TableManifest>('data/events/_manifest.json');
      expect(readManifest).not.toBeNull();

      // Verify it was stored correctly
      expect(readManifest!.location).toBe('data/events');
      expect(readManifest!.formatVersion).toBe(1);
    });

    it('should support binary data storage', async () => {
      const adapter = createMemoryAdapter();

      const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
      await adapter.writeBinary('data/events/block.bin', binaryData);

      const readData = await adapter.readBinary('data/events/block.bin');
      expect(readData).not.toBeNull();
      expect(Array.from(readData!)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should list files by prefix', async () => {
      const adapter = createMemoryAdapter();

      await adapter.writeJson('data/events/manifest.json', {});
      await adapter.writeJson('data/events/schema.json', {});
      await adapter.writeJson('data/users/manifest.json', {});

      const eventFiles = await adapter.list('data/events/');
      expect(eventFiles.length).toBe(2);
      expect(eventFiles).toContain('data/events/manifest.json');
      expect(eventFiles).toContain('data/events/schema.json');
    });
  });
});
