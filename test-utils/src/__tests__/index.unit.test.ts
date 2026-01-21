/**
 * @evodb/test-utils - Tests
 *
 * Tests to verify the test utilities work correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // R2 Bucket mocks
  createMockR2Bucket,
  createMockR2BucketWithData,

  // DO Storage mocks
  createMockDOStorage,

  // Schema generators
  generateMockColumn,
  generateMockSchema,
  generateEventsSchema,
  generateUsersSchema,

  // Stats generators
  generateColumnStats,
  generateFileStats,
  generateManifestFile,

  // Partition generators
  generateZoneMap,
  generatePartitionInfo,
  generatePartitionedInfo,

  // WAL generators
  generateWalEntry,
  generateWalEntries,

  // Columnar block generators
  generateColumnarBlock,
  generateEventsBlock,
  generateUsersBlock,

  // Manifest generators
  generateTableManifest,
  generateQueryManifest,

  // ID generators
  generateId,
  generateSnapshotId,
  resetIdCounter,

  // Random generators
  randomString,
  randomInt,
  randomFloat,
  randomPick,
  randomEmail,
  randomTimestamp,
} from '../index.js';

// =============================================================================
// R2 Bucket Mock Tests
// =============================================================================

describe('createMockR2Bucket', () => {
  it('should create empty bucket', () => {
    const bucket = createMockR2Bucket();
    expect(bucket._storage.size).toBe(0);
  });

  it('should put and get data', async () => {
    const bucket = createMockR2Bucket();
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    await bucket.put('test/file.bin', data);
    const result = await bucket.get('test/file.bin');

    expect(result).not.toBeNull();
    const buffer = await result!.arrayBuffer();
    expect(new Uint8Array(buffer)).toEqual(data);
  });

  it('should put and get string data', async () => {
    const bucket = createMockR2Bucket();
    await bucket.put('test.txt', 'Hello, World!');

    const result = await bucket.get('test.txt');
    expect(await result!.text()).toBe('Hello, World!');
  });

  it('should return null for non-existent key', async () => {
    const bucket = createMockR2Bucket();
    const result = await bucket.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should delete keys', async () => {
    const bucket = createMockR2Bucket();
    await bucket.put('file1.txt', 'content1');
    await bucket.put('file2.txt', 'content2');

    await bucket.delete('file1.txt');

    expect(await bucket.get('file1.txt')).toBeNull();
    expect(await bucket.get('file2.txt')).not.toBeNull();
  });

  it('should list keys with prefix', async () => {
    const bucket = createMockR2Bucket();
    await bucket.put('data/file1.bin', 'content1');
    await bucket.put('data/file2.bin', 'content2');
    await bucket.put('other/file.bin', 'content3');

    const result = await bucket.list({ prefix: 'data/' });
    expect(result.objects).toHaveLength(2);
    expect(result.objects.map((o) => o.key)).toContain('data/file1.bin');
    expect(result.objects.map((o) => o.key)).toContain('data/file2.bin');
  });

  it('should head key', async () => {
    const bucket = createMockR2Bucket();
    await bucket.put('test.txt', 'Hello');

    const head = await bucket.head('test.txt');
    expect(head).not.toBeNull();
    expect(head!.size).toBe(5);
  });

  it('should clear storage', async () => {
    const bucket = createMockR2Bucket();
    await bucket.put('file1.txt', 'content1');
    await bucket.put('file2.txt', 'content2');

    bucket._clear();

    expect(bucket._storage.size).toBe(0);
  });
});

describe('createMockR2BucketWithData', () => {
  it('should create bucket with pre-seeded data', async () => {
    const bucket = createMockR2BucketWithData(
      new Map([
        ['manifest.json', { version: 1, tables: {} }],
        ['data/block.json', { id: [1, 2, 3] }],
      ])
    );

    const manifest = await bucket.get('manifest.json');
    expect(await manifest!.json()).toEqual({ version: 1, tables: {} });

    const block = await bucket.get('data/block.json');
    expect(await block!.json()).toEqual({ id: [1, 2, 3] });
  });
});

// =============================================================================
// DO Storage Mock Tests
// =============================================================================

describe('createMockDOStorage', () => {
  it('should create empty storage', () => {
    const storage = createMockDOStorage();
    expect(storage._storage.size).toBe(0);
  });

  it('should put and get data', async () => {
    const storage = createMockDOStorage();
    await storage.put('state', { counter: 42 });

    const result = await storage.get<{ counter: number }>('state');
    expect(result).toEqual({ counter: 42 });
  });

  it('should return undefined for non-existent key', async () => {
    const storage = createMockDOStorage();
    const result = await storage.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('should delete keys', async () => {
    const storage = createMockDOStorage();
    await storage.put('key1', 'value1');

    const deleted = await storage.delete('key1');
    expect(deleted).toBe(true);
    expect(await storage.get('key1')).toBeUndefined();
  });

  it('should list all entries', async () => {
    const storage = createMockDOStorage();
    await storage.put('key1', 'value1');
    await storage.put('key2', 'value2');

    const entries = await storage.list();
    expect(entries.size).toBe(2);
    expect(entries.get('key1')).toBe('value1');
    expect(entries.get('key2')).toBe('value2');
  });
});

// =============================================================================
// Schema Generator Tests
// =============================================================================

describe('generateMockColumn', () => {
  it('should generate column with defaults', () => {
    const column = generateMockColumn('name');

    expect(column.name).toBe('name');
    expect(column.type).toBe('string');
    expect(column.nullable).toBe(true);
  });

  it('should generate column with custom type', () => {
    const column = generateMockColumn('id', 'int64', false);

    expect(column.name).toBe('id');
    expect(column.type).toBe('int64');
    expect(column.nullable).toBe(false);
  });

  it('should include doc and default value', () => {
    const column = generateMockColumn('status', 'string', false, {
      defaultValue: 'pending',
      doc: 'Order status',
    });

    expect(column.defaultValue).toBe('pending');
    expect(column.doc).toBe('Order status');
  });
});

describe('generateMockSchema', () => {
  it('should generate schema with columns', () => {
    const schema = generateMockSchema([
      { name: 'id', type: 'int64', nullable: false },
      { name: 'name', type: 'string' },
    ]);

    expect(schema.schemaId).toBe(1);
    expect(schema.version).toBe(1);
    expect(schema.columns).toHaveLength(2);
    expect(schema.columns[0].name).toBe('id');
    expect(schema.columns[0].type).toBe('int64');
    expect(schema.columns[1].nullable).toBe(true); // default
  });

  it('should use custom schema ID and version', () => {
    const schema = generateMockSchema([{ name: 'x' }], 42, 3);

    expect(schema.schemaId).toBe(42);
    expect(schema.version).toBe(3);
  });
});

describe('generateEventsSchema', () => {
  it('should generate standard events schema', () => {
    const schema = generateEventsSchema();

    expect(schema.columns.find((c) => c.name === 'id')).toBeDefined();
    expect(schema.columns.find((c) => c.name === 'user_id')).toBeDefined();
    expect(schema.columns.find((c) => c.name === 'event_type')).toBeDefined();
    expect(schema.columns.find((c) => c.name === 'timestamp')).toBeDefined();
  });
});

describe('generateUsersSchema', () => {
  it('should generate standard users schema', () => {
    const schema = generateUsersSchema();

    expect(schema.columns.find((c) => c.name === 'id')).toBeDefined();
    expect(schema.columns.find((c) => c.name === 'name')).toBeDefined();
    expect(schema.columns.find((c) => c.name === 'email')).toBeDefined();
  });
});

// =============================================================================
// Stats Generator Tests
// =============================================================================

describe('generateColumnStats', () => {
  it('should generate stats with min/max', () => {
    const stats = generateColumnStats(0, 100, 5);

    expect(stats.min).toBe(0);
    expect(stats.max).toBe(100);
    expect(stats.nullCount).toBe(5);
  });

  it('should include distinct count', () => {
    const stats = generateColumnStats('A', 'Z', 0, 26);

    expect(stats.distinctCount).toBe(26);
  });
});

describe('generateFileStats', () => {
  it('should generate file stats', () => {
    const stats = generateFileStats(1000, {
      id: { min: 1, max: 1000, nullCount: 0 },
      name: { nullCount: 50, distinctCount: 500 },
    });

    expect(stats.rowCount).toBe(1000);
    expect(stats.columnStats.id.min).toBe(1);
    expect(stats.columnStats.id.max).toBe(1000);
    expect(stats.columnStats.name.nullCount).toBe(50);
  });
});

describe('generateManifestFile', () => {
  it('should generate manifest file entry', () => {
    const file = generateManifestFile(
      'data/block-001.bin',
      65536,
      [{ name: 'year', value: 2026 }],
      generateFileStats(1000)
    );

    expect(file.path).toBe('data/block-001.bin');
    expect(file.length).toBe(65536);
    expect(file.format).toBe('columnar-json-lite');
    expect(file.partitions).toHaveLength(1);
    expect(file.stats.rowCount).toBe(1000);
  });

  it('should support custom format', () => {
    const file = generateManifestFile('data/file.parquet', 1024, [], generateFileStats(100), {
      format: 'parquet',
    });

    expect(file.format).toBe('parquet');
  });

  it('should support LSN range', () => {
    const file = generateManifestFile('data/block.bin', 2048, [], generateFileStats(500), {
      sourceDoId: 'do-123',
      lsnRange: { minLsn: '1000', maxLsn: '1500' },
    });

    expect(file.sourceDoId).toBe('do-123');
    expect(file.lsnRange?.minLsn).toBe('1000');
  });
});

// =============================================================================
// Partition Generator Tests
// =============================================================================

describe('generateZoneMap', () => {
  it('should generate zone map', () => {
    const zoneMap = generateZoneMap({
      age: { min: 10, max: 30, nullCount: 0 },
      price: { min: 10.0, max: 99.99, nullCount: 5 },
    });

    expect(zoneMap.columns.age.min).toBe(10);
    expect(zoneMap.columns.price.nullCount).toBe(5);
  });
});

describe('generatePartitionInfo', () => {
  it('should generate partition info', () => {
    const partition = generatePartitionInfo('data/p1.bin', 1000, {
      age: { min: 10, max: 30, nullCount: 0 },
    });

    expect(partition.path).toBe('data/p1.bin');
    expect(partition.rowCount).toBe(1000);
    expect(partition.zoneMap.columns.age.min).toBe(10);
    expect(partition.isCached).toBe(false);
  });

  it('should support cached partition', () => {
    const partition = generatePartitionInfo('data/p1.bin', 100, {}, {
      isCached: true,
      cacheKey: 'evodb:test:p1',
    });

    expect(partition.isCached).toBe(true);
    expect(partition.cacheKey).toBe('evodb:test:p1');
  });
});

describe('generatePartitionedInfo', () => {
  it('should generate partitioned info', () => {
    const partition = generatePartitionedInfo(
      'data/year=2026/month=1/block.bin',
      { year: 2026, month: 1 },
      1000
    );

    expect(partition.partitionValues.year).toBe(2026);
    expect(partition.partitionValues.month).toBe(1);
    expect(partition.rowCount).toBe(1000);
  });
});

// =============================================================================
// WAL Generator Tests
// =============================================================================

describe('generateWalEntry', () => {
  it('should generate WAL entry with string data', () => {
    const entry = generateWalEntry(1, 'test-data');

    expect(entry.lsn).toBe(1n);
    expect(entry.op).toBe(1);
    expect(new TextDecoder().decode(entry.data)).toBe('test-data');
  });

  it('should generate WAL entry with object data', () => {
    const entry = generateWalEntry(2, { id: 1, name: 'test' });

    expect(entry.lsn).toBe(2n);
    expect(JSON.parse(new TextDecoder().decode(entry.data))).toEqual({ id: 1, name: 'test' });
  });

  it('should accept bigint LSN', () => {
    const entry = generateWalEntry(BigInt('9007199254740993'), 'data');

    expect(entry.lsn).toBe(9007199254740993n);
  });

  it('should support custom operation', () => {
    const entry = generateWalEntry(1, 'data', { op: 2 });

    expect(entry.op).toBe(2);
  });
});

describe('generateWalEntries', () => {
  it('should generate multiple entries', () => {
    const entries = generateWalEntries(10);

    expect(entries).toHaveLength(10);
    expect(entries[0].lsn).toBe(1n);
    expect(entries[9].lsn).toBe(10n);
  });

  it('should use custom data generator', () => {
    const entries = generateWalEntries(3, (i) => ({ id: i }));

    expect(JSON.parse(new TextDecoder().decode(entries[0].data))).toEqual({ id: 0 });
    expect(JSON.parse(new TextDecoder().decode(entries[1].data))).toEqual({ id: 1 });
  });
});

// =============================================================================
// Columnar Block Generator Tests
// =============================================================================

describe('generateColumnarBlock', () => {
  it('should generate columnar block', () => {
    const block = generateColumnarBlock({
      id: [1, 2, 3],
      name: ['Alice', 'Bob', 'Charlie'],
    });

    expect(block.id).toEqual([1, 2, 3]);
    expect(block.name).toEqual(['Alice', 'Bob', 'Charlie']);
  });
});

describe('generateEventsBlock', () => {
  it('should generate events block', () => {
    const block = generateEventsBlock(10);

    expect(block.id).toHaveLength(10);
    expect(block.user_id).toHaveLength(10);
    expect(block.event_type).toHaveLength(10);
    expect(block.timestamp).toHaveLength(10);
  });

  it('should use default row count', () => {
    const block = generateEventsBlock();

    expect(block.id).toHaveLength(5);
  });
});

describe('generateUsersBlock', () => {
  it('should generate users block', () => {
    const block = generateUsersBlock(10);

    expect(block.id).toHaveLength(10);
    expect(block.name).toHaveLength(10);
    expect(block.email).toHaveLength(10);
  });
});

// =============================================================================
// Manifest Generator Tests
// =============================================================================

describe('generateTableManifest', () => {
  it('should generate table manifest', () => {
    const manifest = generateTableManifest('com/example/api/users');

    expect(manifest.formatVersion).toBe(1);
    expect(manifest.location).toBe('com/example/api/users');
    expect(manifest.currentSchemaId).toBe(1);
    expect(manifest.stats.totalRows).toBe(0);
  });

  it('should support custom stats', () => {
    const manifest = generateTableManifest('test', { totalRows: 1000, totalFiles: 5 });

    expect(manifest.stats.totalRows).toBe(1000);
    expect(manifest.stats.totalFiles).toBe(5);
  });
});

describe('generateQueryManifest', () => {
  it('should generate query manifest', () => {
    const manifest = generateQueryManifest({
      events: {
        schema: generateEventsSchema().columns,
        blockPaths: ['data/events/block_001.json'],
        rowCount: 100,
      },
    });

    expect(manifest.version).toBe(1);
    expect(manifest.tables.events.name).toBe('events');
    expect(manifest.tables.events.rowCount).toBe(100);
  });
});

// =============================================================================
// ID Generator Tests
// =============================================================================

describe('generateId', () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();

    expect(id1).not.toBe(id2);
  });

  it('should use prefix', () => {
    const id = generateId('user');

    expect(id.startsWith('user-')).toBe(true);
  });
});

describe('generateSnapshotId', () => {
  it('should generate time-sortable IDs', async () => {
    const id1 = generateSnapshotId();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const id2 = generateSnapshotId();

    expect(id1.localeCompare(id2)).toBeLessThan(0);
  });
});

// =============================================================================
// Random Generator Tests
// =============================================================================

describe('randomString', () => {
  it('should generate string of specified length', () => {
    const str = randomString(20);

    expect(str).toHaveLength(20);
  });
});

describe('randomInt', () => {
  it('should generate integer in range', () => {
    for (let i = 0; i < 100; i++) {
      const num = randomInt(10, 20);
      expect(num).toBeGreaterThanOrEqual(10);
      expect(num).toBeLessThanOrEqual(20);
    }
  });
});

describe('randomFloat', () => {
  it('should generate float in range', () => {
    for (let i = 0; i < 100; i++) {
      const num = randomFloat(0, 100, 2);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(100);
    }
  });
});

describe('randomPick', () => {
  it('should pick element from array', () => {
    const items = ['a', 'b', 'c'];

    for (let i = 0; i < 100; i++) {
      const picked = randomPick(items);
      expect(items).toContain(picked);
    }
  });
});

describe('randomEmail', () => {
  it('should generate valid email', () => {
    const email = randomEmail();

    expect(email).toMatch(/.+@test\.com$/);
  });

  it('should use custom domain', () => {
    const email = randomEmail('example.org');

    expect(email).toMatch(/.+@example\.org$/);
  });
});

describe('randomTimestamp', () => {
  it('should generate timestamp in range', () => {
    const now = Date.now();
    const daysBack = 30;
    const msBack = daysBack * 24 * 60 * 60 * 1000;

    for (let i = 0; i < 100; i++) {
      const ts = randomTimestamp(daysBack);
      expect(ts).toBeGreaterThanOrEqual(now - msBack);
      expect(ts).toBeLessThanOrEqual(now);
    }
  });
});
