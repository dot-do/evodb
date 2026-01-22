/**
 * @evodb/test-utils
 *
 * Shared test utilities and mock data generators for EvoDB testing.
 *
 * Provides consistent mock implementations for:
 * - R2 Bucket
 * - Durable Object Storage
 * - Schema and Column generators
 * - Partition and Zone Map generators
 * - WAL Entry generators
 * - Columnar data blocks
 */

import type {
  TableSchema as CoreTableSchema,
  TableSchemaColumn as CoreTableSchemaColumn,
  TableColumnType as CoreTableColumnType,
  WalEntry as CoreWalEntry,
} from '@evodb/core';

// =============================================================================
// Type Definitions
// Note: Test-utils defines its own R2 types for mock implementations.
// Canonical R2 types are in @evodb/core/types/r2.ts (Issue evodb-sdgz).
// =============================================================================

/**
 * R2 Object type for test mocks.
 * Compatible with @evodb/core R2Object but with optional fields for easier mocking.
 */
export type R2Object = {
  key: string;
  version?: string;
  size: number;
  etag: string;
  httpEtag: string;
  checksums?: Record<string, string>;
  uploaded: Date;
  customMetadata?: Record<string, string>;
  body?: ReadableStream;
  bodyUsed?: boolean;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
  json: <T>() => Promise<T>;
  blob?: () => Promise<Blob>;
};

export type R2ObjectHead = Omit<R2Object, 'arrayBuffer' | 'text' | 'json' | 'blob' | 'body' | 'bodyUsed'>;

export type R2ListResult = {
  objects: R2ObjectHead[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes?: string[];
};

/**
 * R2 Bucket type for test mocks.
 * Compatible with @evodb/core R2Bucket but simplified for testing.
 */
export type R2Bucket = {
  get: (key: string) => Promise<R2Object | null>;
  put: (key: string, value: ArrayBuffer | Uint8Array | string, options?: {
    customMetadata?: Record<string, string>;
  }) => Promise<R2Object>;
  delete: (keys: string | string[]) => Promise<void>;
  list: (options?: { prefix?: string; limit?: number; cursor?: string }) => Promise<R2ListResult>;
  head: (key: string) => Promise<R2ObjectHead | null>;
};

export type DurableObjectStorage = {
  get: <T>(key: string) => Promise<T | undefined>;
  put: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<boolean>;
  list: () => Promise<Map<string, unknown>>;
};

/**
 * Column types for test schemas.
 * Compatible with CoreTableColumnType from @evodb/core.
 */
export type ColumnType =
  | 'string'
  | 'int32'
  | 'int64'
  | 'float64'
  | 'boolean'
  | 'timestamp'
  | 'uuid'
  | 'binary';

/**
 * Column definition for test schemas.
 * Compatible with CoreTableSchemaColumn from @evodb/core.
 */
export interface ColumnDef {
  name: string;
  type: ColumnType;
  nullable: boolean;
  defaultValue?: unknown;
  doc?: string;
}

/**
 * Schema type for test utilities.
 * Compatible with CoreTableSchema from @evodb/core.
 */
export interface Schema {
  schemaId: number;
  version: number;
  columns: ColumnDef[];
  createdAt: number;
}

// Re-export core types for consumers who need the unified types
export type { CoreTableSchema, CoreTableSchemaColumn, CoreTableColumnType };

export interface ColumnStats {
  min?: unknown;
  max?: unknown;
  nullCount: number;
  distinctCount?: number;
}

export interface FileStats {
  rowCount: number;
  columnStats: Record<string, ColumnStats>;
}

export interface PartitionValue {
  name: string;
  value: unknown;
}

export interface ManifestFile {
  path: string;
  length: number;
  format: string;
  partitions: PartitionValue[];
  stats: FileStats;
  sourceDoId?: string;
  lsnRange?: { minLsn: string; maxLsn: string };
}

export interface ZoneMap {
  columns: Record<string, {
    min: unknown;
    max: unknown;
    nullCount: number;
    allNull?: boolean;
  }>;
}

export interface PartitionInfo {
  path: string;
  partitionValues: Record<string, unknown>;
  sizeBytes: number;
  rowCount: number;
  zoneMap: ZoneMap;
  isCached: boolean;
  cacheKey?: string;
  bloomFilter?: {
    column: string;
    sizeBits: number;
    numHashFunctions: number;
    falsePositiveRate: number;
  };
}

/**
 * WAL entry type for test utilities.
 * Uses the unified CoreWalEntry from @evodb/core.
 */
export type WalEntry = CoreWalEntry;

export interface ColumnarBlock<T = unknown> {
  [column: string]: T[];
}

// =============================================================================
// Mock R2 Bucket Factory
// =============================================================================

/**
 * Create a mock R2 bucket for testing
 *
 * @example
 * ```ts
 * const bucket = createMockR2Bucket();
 * await bucket.put('test.bin', new Uint8Array([1, 2, 3]));
 * const result = await bucket.get('test.bin');
 * ```
 */
export function createMockR2Bucket(): R2Bucket & {
  _storage: Map<string, { data: Uint8Array; metadata?: Record<string, string> }>;
  _clear: () => void;
} {
  const storage = new Map<string, { data: Uint8Array; metadata?: Record<string, string> }>();

  const bucket: R2Bucket & {
    _storage: Map<string, { data: Uint8Array; metadata?: Record<string, string> }>;
    _clear: () => void;
  } = {
    _storage: storage,
    _clear: () => storage.clear(),

    async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { customMetadata?: Record<string, string> }): Promise<R2Object> {
      let data: Uint8Array;
      if (typeof value === 'string') {
        data = new TextEncoder().encode(value);
      } else if (value instanceof ArrayBuffer) {
        data = new Uint8Array(value);
      } else {
        data = value;
      }
      storage.set(key, { data: new Uint8Array(data), metadata: options?.customMetadata });
      return {
        key,
        version: '1',
        size: data.length,
        etag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
        httpEtag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
        checksums: {},
        uploaded: new Date(),
        customMetadata: options?.customMetadata,
        async arrayBuffer(): Promise<ArrayBuffer> {
          return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        },
        async text() {
          return new TextDecoder().decode(data);
        },
        async json<T>() {
          return JSON.parse(new TextDecoder().decode(data)) as T;
        },
      };
    },

    async get(key: string): Promise<R2Object | null> {
      const item = storage.get(key);
      if (!item) return null;
      const data = item.data;
      return {
        key,
        version: '1',
        size: data.length,
        etag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
        httpEtag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
        checksums: {},
        uploaded: new Date(),
        customMetadata: item.metadata,
        async arrayBuffer(): Promise<ArrayBuffer> {
          return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
        },
        async text() {
          return new TextDecoder().decode(data);
        },
        async json<T>() {
          return JSON.parse(new TextDecoder().decode(data)) as T;
        },
      };
    },

    async delete(keys: string | string[]): Promise<void> {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        storage.delete(key);
      }
    },

    async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<R2ListResult> {
      const prefix = options?.prefix || '';
      const objects: R2ObjectHead[] = [];

      for (const [key, item] of storage.entries()) {
        if (key.startsWith(prefix)) {
          objects.push({
            key,
            version: '1',
            size: item.data.length,
            etag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
            httpEtag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
            checksums: {},
            uploaded: new Date(),
            customMetadata: item.metadata,
          });
        }
      }

      return {
        objects: objects.sort((a, b) => a.key.localeCompare(b.key)),
        truncated: false,
      };
    },

    async head(key: string): Promise<R2ObjectHead | null> {
      const item = storage.get(key);
      if (!item) return null;
      return {
        key,
        version: '1',
        size: item.data.length,
        etag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
        httpEtag: `"${key.replace(/[^a-z0-9]/gi, '')}"`,
        checksums: {},
        uploaded: new Date(),
        customMetadata: item.metadata,
      };
    },
  };

  return bucket;
}

/**
 * Create a mock R2 bucket with pre-seeded data
 *
 * @example
 * ```ts
 * const bucket = createMockR2BucketWithData(new Map([
 *   ['manifest.json', { version: 1 }],
 *   ['data/block.bin', { id: [1, 2, 3] }]
 * ]));
 * ```
 */
export function createMockR2BucketWithData(
  data: Map<string, unknown>
): R2Bucket {
  const bucket = createMockR2Bucket();

  for (const [key, value] of data.entries()) {
    const content = typeof value === 'string' ? value : JSON.stringify(value);
    bucket._storage.set(key, {
      data: new TextEncoder().encode(content),
    });
  }

  return bucket;
}

// =============================================================================
// Mock Durable Object Storage Factory
// =============================================================================

/**
 * Create a mock Durable Object storage for testing
 *
 * @example
 * ```ts
 * const storage = createMockDOStorage();
 * await storage.put('state', { counter: 0 });
 * const state = await storage.get<{ counter: number }>('state');
 * ```
 */
export function createMockDOStorage(): DurableObjectStorage & {
  _storage: Map<string, unknown>;
  _clear: () => void;
} {
  const storage = new Map<string, unknown>();

  return {
    _storage: storage,
    _clear: () => storage.clear(),

    async get<T>(key: string): Promise<T | undefined> {
      return storage.get(key) as T | undefined;
    },

    async put(key: string, value: unknown): Promise<void> {
      storage.set(key, value);
    },

    async delete(key: string): Promise<boolean> {
      return storage.delete(key);
    },

    async list(): Promise<Map<string, unknown>> {
      return new Map(storage);
    },
  };
}

// =============================================================================
// Schema and Column Generators
// =============================================================================

/**
 * Generate a mock column definition
 *
 * @example
 * ```ts
 * const column = generateMockColumn('user_id', 'string', false);
 * ```
 */
export function generateMockColumn(
  name: string,
  type: ColumnType = 'string',
  nullable: boolean = true,
  options?: { defaultValue?: unknown; doc?: string }
): ColumnDef {
  return {
    name,
    type,
    nullable,
    defaultValue: options?.defaultValue,
    doc: options?.doc,
  };
}

/**
 * Generate a mock schema with multiple columns
 *
 * @example
 * ```ts
 * const schema = generateMockSchema([
 *   { name: 'id', type: 'int64', nullable: false },
 *   { name: 'name', type: 'string', nullable: false },
 *   { name: 'email', type: 'string', nullable: true },
 * ]);
 * ```
 */
export function generateMockSchema(
  columns: Array<Partial<ColumnDef> & { name: string }>,
  schemaId: number = 1,
  version: number = 1
): Schema {
  return {
    schemaId,
    version,
    columns: columns.map((col) => ({
      name: col.name,
      type: col.type || 'string',
      nullable: col.nullable ?? true,
      defaultValue: col.defaultValue,
      doc: col.doc,
    })),
    createdAt: Date.now(),
  };
}

/**
 * Generate a standard events table schema (commonly used in tests)
 */
export function generateEventsSchema(schemaId: number = 1): Schema {
  return generateMockSchema(
    [
      { name: 'id', type: 'int64', nullable: false },
      { name: 'user_id', type: 'string', nullable: false },
      { name: 'event_type', type: 'string', nullable: false },
      { name: 'timestamp', type: 'timestamp', nullable: false },
      { name: 'status', type: 'string', nullable: true },
      { name: 'amount', type: 'float64', nullable: true },
    ],
    schemaId
  );
}

/**
 * Generate a standard users table schema (commonly used in tests)
 */
export function generateUsersSchema(schemaId: number = 1): Schema {
  return generateMockSchema(
    [
      { name: 'id', type: 'string', nullable: false },
      { name: 'name', type: 'string', nullable: false },
      { name: 'email', type: 'string', nullable: true },
      { name: 'age', type: 'int32', nullable: true },
      { name: 'created_at', type: 'timestamp', nullable: false },
    ],
    schemaId
  );
}

// =============================================================================
// Column Stats Generators
// =============================================================================

/**
 * Generate column statistics
 *
 * @example
 * ```ts
 * const stats = generateColumnStats(0, 100, 5);
 * ```
 */
export function generateColumnStats(
  min: unknown,
  max: unknown,
  nullCount: number = 0,
  distinctCount?: number
): ColumnStats {
  return {
    min,
    max,
    nullCount,
    distinctCount,
  };
}

/**
 * Generate file statistics with column stats
 *
 * @example
 * ```ts
 * const stats = generateFileStats(1000, {
 *   id: { min: 1, max: 1000, nullCount: 0 },
 *   name: { nullCount: 50, distinctCount: 500 }
 * });
 * ```
 */
export function generateFileStats(
  rowCount: number,
  columnStats: Record<string, Partial<ColumnStats>> = {}
): FileStats {
  const normalizedStats: Record<string, ColumnStats> = {};

  for (const [name, stats] of Object.entries(columnStats)) {
    normalizedStats[name] = {
      min: stats.min,
      max: stats.max,
      nullCount: stats.nullCount ?? 0,
      distinctCount: stats.distinctCount,
    };
  }

  return {
    rowCount,
    columnStats: normalizedStats,
  };
}

// =============================================================================
// Manifest File Generators
// =============================================================================

/**
 * Generate a manifest file entry
 *
 * @example
 * ```ts
 * const file = generateManifestFile(
 *   'data/year=2026/block-001.bin',
 *   65536,
 *   [{ name: 'year', value: 2026 }],
 *   generateFileStats(1000, { id: { min: 1, max: 1000, nullCount: 0 } })
 * );
 * ```
 */
export function generateManifestFile(
  path: string,
  length: number,
  partitions: PartitionValue[] = [],
  stats: FileStats = { rowCount: 0, columnStats: {} },
  options?: {
    format?: string;
    sourceDoId?: string;
    lsnRange?: { minLsn: string; maxLsn: string };
  }
): ManifestFile {
  return {
    path,
    length,
    format: options?.format || 'columnar-json-lite',
    partitions,
    stats,
    sourceDoId: options?.sourceDoId,
    lsnRange: options?.lsnRange,
  };
}

// =============================================================================
// Partition and Zone Map Generators
// =============================================================================

/**
 * Generate a zone map for partition pruning tests
 *
 * @example
 * ```ts
 * const zoneMap = generateZoneMap({
 *   age: { min: 10, max: 30, nullCount: 0 },
 *   price: { min: 10.0, max: 99.99, nullCount: 5 }
 * });
 * ```
 */
export function generateZoneMap(
  columns: Record<string, { min: unknown; max: unknown; nullCount: number; allNull?: boolean }>
): ZoneMap {
  return { columns };
}

/**
 * Generate partition info for query planning tests
 *
 * @example
 * ```ts
 * const partition = generatePartitionInfo(
 *   'data/partition-001.bin',
 *   1000,
 *   { age: { min: 10, max: 30, nullCount: 0 } }
 * );
 * ```
 */
export function generatePartitionInfo(
  path: string,
  rowCount: number,
  columnStats: Record<string, { min: unknown; max: unknown; nullCount: number }> = {},
  options?: {
    partitionValues?: Record<string, unknown>;
    isCached?: boolean;
    cacheKey?: string;
    bloomFilter?: PartitionInfo['bloomFilter'];
  }
): PartitionInfo {
  const zoneMap: ZoneMap = {
    columns: Object.fromEntries(
      Object.entries(columnStats).map(([col, stats]) => [
        col,
        {
          min: stats.min,
          max: stats.max,
          nullCount: stats.nullCount,
          allNull: stats.nullCount === rowCount,
        },
      ])
    ),
  };

  return {
    path,
    partitionValues: options?.partitionValues || {},
    sizeBytes: rowCount * 100, // Estimated size
    rowCount,
    zoneMap,
    isCached: options?.isCached ?? false,
    cacheKey: options?.cacheKey,
    bloomFilter: options?.bloomFilter,
  };
}

/**
 * Generate partition info with partition values (for partition pruning tests)
 *
 * @example
 * ```ts
 * const partition = generatePartitionedInfo(
 *   'data/year=2026/month=1/block.bin',
 *   { year: 2026, month: 1 },
 *   1000
 * );
 * ```
 */
export function generatePartitionedInfo(
  path: string,
  partitionValues: Record<string, unknown>,
  rowCount: number = 100
): PartitionInfo {
  return {
    path,
    partitionValues,
    sizeBytes: rowCount * 100,
    rowCount,
    zoneMap: { columns: {} },
    isCached: false,
  };
}

// =============================================================================
// WAL Entry Generators
// =============================================================================

/**
 * Generate a WAL entry for CDC testing
 *
 * @example
 * ```ts
 * const entry = generateWalEntry(1, 'test-data');
 * // Or with custom options
 * const entry2 = generateWalEntry(2, { id: 1, name: 'test' }, { op: 2 });
 * ```
 */
export function generateWalEntry(
  lsn: number | bigint,
  data: string | object,
  options?: {
    op?: number;
    flags?: number;
    timestamp?: bigint;
    checksum?: number;
  }
): WalEntry {
  const encoder = new TextEncoder();
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

  return {
    lsn: typeof lsn === 'bigint' ? lsn : BigInt(lsn),
    timestamp: options?.timestamp ?? BigInt(Date.now()),
    op: options?.op ?? 1, // 1 = Insert by default
    flags: options?.flags ?? 0,
    data: encoder.encode(dataStr),
    checksum: options?.checksum ?? 12345,
  };
}

/**
 * Generate multiple WAL entries
 *
 * @example
 * ```ts
 * const entries = generateWalEntries(10, (i) => `record-${i}`);
 * ```
 */
export function generateWalEntries(
  count: number,
  dataGenerator: (index: number) => string | object = (i) => `record-${i}`
): WalEntry[] {
  return Array.from({ length: count }, (_, i) =>
    generateWalEntry(i + 1, dataGenerator(i))
  );
}

// =============================================================================
// Columnar Block Generators
// =============================================================================

/**
 * Generate a columnar data block
 *
 * @example
 * ```ts
 * const block = generateColumnarBlock({
 *   id: [1, 2, 3, 4, 5],
 *   name: ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'],
 *   age: [30, 25, 35, 28, 32]
 * });
 * ```
 */
export function generateColumnarBlock<T extends Record<string, unknown[]>>(
  columns: T
): T {
  return columns;
}

/**
 * Generate a sample events block (commonly used in reader tests)
 */
export function generateEventsBlock(rowCount: number = 5): ColumnarBlock {
  const events: string[] = ['click', 'view', 'purchase', 'scroll', 'hover'];
  const statuses: (string | null)[] = ['active', 'pending', 'completed', null];

  return {
    id: Array.from({ length: rowCount }, (_, i) => i + 1),
    user_id: Array.from({ length: rowCount }, (_, i) => `u${(i % 5) + 1}`),
    event_type: Array.from({ length: rowCount }, (_, i) => events[i % events.length]),
    timestamp: Array.from({ length: rowCount }, (_, i) => Date.now() - i * 1000),
    status: Array.from({ length: rowCount }, (_, i) => statuses[i % statuses.length]),
    amount: Array.from({ length: rowCount }, (_, i) =>
      i % 3 === 0 ? null : Math.round(Math.random() * 10000) / 100
    ),
  };
}

/**
 * Generate a sample users block (commonly used in reader tests)
 */
export function generateUsersBlock(rowCount: number = 5): ColumnarBlock {
  const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
  const domains = ['test.com', 'example.com', 'sample.org'];

  return {
    id: Array.from({ length: rowCount }, (_, i) => `u${i + 1}`),
    name: Array.from({ length: rowCount }, (_, i) => names[i % names.length]),
    email: Array.from(
      { length: rowCount },
      (_, i) => `${names[i % names.length].toLowerCase()}@${domains[i % domains.length]}`
    ),
    age: Array.from({ length: rowCount }, (_, i) => 20 + (i * 5)),
    created_at: Array.from({ length: rowCount }, (_, i) => Date.now() - i * 86400000),
  };
}

// =============================================================================
// Table Manifest Generators
// =============================================================================

export interface TableManifest {
  formatVersion: number;
  tableId: string;
  location: string;
  currentSchemaId: number;
  schemas: Array<{ schemaId: number; path: string }>;
  partitionSpec: { specId: number; fields: unknown[] };
  currentSnapshotId: string | null;
  snapshots: unknown[];
  stats: {
    totalRows: number;
    totalFiles: number;
    totalSizeBytes: number;
    lastSnapshotTimestamp: number | null;
  };
  properties: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Generate a table manifest
 *
 * @example
 * ```ts
 * const manifest = generateTableManifest('com/example/api/users', {
 *   totalRows: 1000,
 *   totalFiles: 5
 * });
 * ```
 */
export function generateTableManifest(
  location: string,
  stats?: Partial<TableManifest['stats']>,
  options?: {
    tableId?: string;
    schemaId?: number;
    properties?: Record<string, string>;
  }
): TableManifest {
  const now = Date.now();
  const tableId = options?.tableId ?? `table-${now}`;
  const schemaId = options?.schemaId ?? 1;

  return {
    formatVersion: 1,
    tableId,
    location,
    currentSchemaId: schemaId,
    schemas: [{ schemaId, path: `_schema/v${schemaId}.json` }],
    partitionSpec: { specId: 0, fields: [] },
    currentSnapshotId: null,
    snapshots: [],
    stats: {
      totalRows: stats?.totalRows ?? 0,
      totalFiles: stats?.totalFiles ?? 0,
      totalSizeBytes: stats?.totalSizeBytes ?? 0,
      lastSnapshotTimestamp: stats?.lastSnapshotTimestamp ?? null,
    },
    properties: options?.properties ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

// =============================================================================
// Query Test Fixtures
// =============================================================================

export interface QueryManifest {
  version: number;
  tables: Record<string, {
    name: string;
    schema: ColumnDef[];
    blockPaths: string[];
    rowCount: number;
    lastUpdated: number;
  }>;
}

/**
 * Generate a query manifest for reader/query engine tests
 *
 * @example
 * ```ts
 * const manifest = generateQueryManifest({
 *   events: {
 *     schema: generateEventsSchema().columns,
 *     blockPaths: ['data/events/block_001.json', 'data/events/block_002.json'],
 *     rowCount: 100
 *   }
 * });
 * ```
 */
export function generateQueryManifest(
  tables: Record<string, {
    schema?: ColumnDef[];
    blockPaths?: string[];
    rowCount?: number;
  }>
): QueryManifest {
  const result: QueryManifest = {
    version: 1,
    tables: {},
  };

  for (const [name, config] of Object.entries(tables)) {
    result.tables[name] = {
      name,
      schema: config.schema ?? [],
      blockPaths: config.blockPaths ?? [`data/${name}/block_001.json`],
      rowCount: config.rowCount ?? 100,
      lastUpdated: Date.now(),
    };
  }

  return result;
}

// =============================================================================
// ID Generators
// =============================================================================

let idCounter = 0;

/**
 * Generate a unique ID for testing
 */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${++idCounter}-${Date.now().toString(36)}`;
}

/**
 * Generate a ULID-like snapshot ID (time-sortable)
 */
export function generateSnapshotId(): string {
  const timestamp = Date.now().toString(36).padStart(10, '0');
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}${random}`;
}

/**
 * Reset the ID counter (useful between tests)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

// =============================================================================
// Random Data Generators
// =============================================================================

/**
 * Generate random string of specified length
 */
export function randomString(length: number = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Generate random integer in range [min, max]
 */
export function randomInt(min: number = 0, max: number = 1000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random float in range [min, max]
 */
export function randomFloat(min: number = 0, max: number = 1000, decimals: number = 2): number {
  const value = Math.random() * (max - min) + min;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Pick a random element from an array
 */
export function randomPick<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate a random email address
 */
export function randomEmail(domain: string = 'test.com'): string {
  return `${randomString(8).toLowerCase()}@${domain}`;
}

/**
 * Generate a random timestamp within the last N days
 */
export function randomTimestamp(daysBack: number = 30): number {
  const now = Date.now();
  const msBack = daysBack * 24 * 60 * 60 * 1000;
  return now - Math.floor(Math.random() * msBack);
}

// =============================================================================
// Chaos Testing Utilities (Issue evodb-187, evodb-6zh)
// Moved from @evodb/core to reduce production bundle size
// =============================================================================

export {
  // Chaos wrappers
  ChaosR2Bucket,
  ChaosStorage,
  DelayInjector,
  PartialWriteSimulator,
  ConcurrencyConflictSimulator,
  MemoryPressureSimulator,
  ClockSkewSimulator,
  // Seeded random for reproducibility
  SeededRandom,
  // Error classes
  ChaosNetworkError,
  PartialWriteError,
  CorruptionDetectedError,
  MemoryPressureError,
  ConflictError,
  ETagMismatchError,
  TimeoutError,
  // Factory function
  createChaosStack,
  // Types
  type ChaosConfig,
  type FailureMode,
  type AffectedOperation,
  type CorruptionMode,
  type DelayMode,
  type ConflictMode,
  type ChaosR2BucketOptions,
  type ChaosStorageOptions,
  type DelayInjectorOptions,
  type PartialWriteSimulatorOptions,
  type ConcurrencyConflictSimulatorOptions,
  type MemoryPressureSimulatorOptions,
  type ClockSkewSimulatorOptions,
} from './chaos-testing.js';
