# Deprecated API Migration Guide

This guide lists all deprecated APIs in evodb and their recommended replacements.

## Overview

The evodb project has undergone significant consolidation to simplify its API surface. Many interfaces have been unified under the `StorageProvider` interface, and the `@evodb/reader` package has been merged into `@evodb/query`.

## Quick Reference

| Deprecated API | Replacement | Package |
|----------------|-------------|---------|
| `@evodb/reader` (entire package) | `@evodb/query` | - |
| `Storage` interface | `StorageProvider` | `@evodb/core` |
| `ObjectStorageAdapter` interface | `StorageProvider` | `@evodb/core` |
| `StorageAdapter` (DO block storage) | `StorageProvider` | `@evodb/core` |
| `R2StorageAdapter` (lakehouse) | `StorageProvider` | `@evodb/core` |
| `StorageAdapter` (lance-reader) | `StorageProvider` | `@evodb/core` |
| `QueryResult` | `EngineQueryResult` | `@evodb/query` |
| `QueryStats` | `EngineQueryStats` | `@evodb/query` |
| `isCompatible` | `isSchemaCompatible` | `@evodb/core` |
| `snapshotId()`, `batchId()`, etc. | Direct string assignment | `@evodb/core` |

---

## Package Migrations

### @evodb/reader -> @evodb/query

**Status:** Deprecated (entire package)

The `@evodb/reader` package has been merged into `@evodb/query`. All functionality is preserved but with updated naming.

```typescript
// BEFORE (deprecated):
import {
  QueryEngine,
  type ReaderConfig,
  type QueryRequest,
  type QueryResult,
} from '@evodb/reader';

const engine = new QueryEngine(config);

// AFTER (recommended):
import {
  SimpleQueryEngine,
  type SimpleQueryConfig,
  type SimpleQueryRequest,
  type SimpleQueryResult,
} from '@evodb/query';

const engine = new SimpleQueryEngine(config);
```

#### Type Mapping

| @evodb/reader | @evodb/query |
|---------------|--------------|
| `QueryEngine` | `SimpleQueryEngine` |
| `ReaderConfig` | `SimpleQueryConfig` |
| `QueryRequest` | `SimpleQueryRequest` |
| `QueryResult` | `SimpleQueryResult` |
| `QueryStats` | `SimpleQueryStats` |
| `FilterPredicate` | `SimpleFilterPredicate` |
| `FilterOperator` | `SimpleFilterOperator` |
| `SortSpec` | `SimpleSortSpec` |
| `SortDirection` | `SimpleSortDirection` |
| `AggregateSpec` | `SimpleAggregateSpec` |
| `AggregateFunction` | `SimpleAggregateFunction` |
| `CacheTierConfig` | `SimpleCacheTierConfig` |
| `CacheStats` | `SimpleCacheStats` |

---

## Storage Interface Migrations

### Storage -> StorageProvider

**File:** `core/src/storage.ts`

The `Storage` interface (read/write/list/delete) is deprecated in favor of `StorageProvider`.

```typescript
// BEFORE (deprecated):
import type { Storage } from '@evodb/core';

const storage: Storage = {
  async read(path) { /* ... */ },
  async write(path, data) { /* ... */ },
  async list(prefix) { return { paths: [] }; },
  async delete(path) { /* ... */ },
};

// AFTER (recommended):
import type { StorageProvider } from '@evodb/core';

const provider: StorageProvider = {
  async get(key) { /* ... */ },
  async put(key, data) { /* ... */ },
  async list(prefix) { return []; },  // Returns string[] directly
  async delete(key) { /* ... */ },
  async exists(key) { /* ... */ },
};
```

#### Method Mapping

| Storage | StorageProvider |
|---------|-----------------|
| `read(path)` | `get(key)` |
| `write(path, data)` | `put(key, data)` |
| `list(prefix)` -> `{ paths: string[] }` | `list(prefix)` -> `string[]` |
| `delete(path)` | `delete(key)` |
| N/A | `exists(key)` |

#### Using Adapter Functions

If you need to interoperate with legacy code:

```typescript
import {
  StorageProvider,
  storageToProvider,    // Storage -> StorageProvider
  providerToStorage,    // StorageProvider -> Storage (deprecated)
} from '@evodb/core';

// Convert legacy Storage to StorageProvider
const legacyStorage: Storage = /* ... */;
const provider = storageToProvider(legacyStorage);

// Convert StorageProvider to legacy Storage (when calling legacy code)
const modernProvider: StorageProvider = /* ... */;
const legacyInterface = providerToStorage(modernProvider);
```

---

### ObjectStorageAdapter -> StorageProvider

**File:** `core/src/storage.ts`

The `ObjectStorageAdapter` interface (put/get/list/head/delete) is deprecated.

```typescript
// BEFORE (deprecated):
import type { ObjectStorageAdapter } from '@evodb/core';

const adapter: ObjectStorageAdapter = {
  async put(path, data) { /* ... */ },
  async get(path) { /* ... */ },
  async list(prefix) { return []; },
  async head(path) { return { size: 0, etag: '' }; },
  async delete(path) { /* ... */ },
};

// AFTER (recommended):
import type { StorageProvider } from '@evodb/core';

const provider: StorageProvider = {
  async put(key, data) { /* ... */ },
  async get(key) { /* ... */ },
  async list(prefix) { return []; },
  async delete(key) { /* ... */ },
  async exists(key) { /* ... */ },  // Replaces head() for existence checks
};
```

#### Using Adapter Functions

```typescript
import {
  objectAdapterToProvider,  // ObjectStorageAdapter -> StorageProvider
  providerToObjectAdapter,  // StorageProvider -> ObjectStorageAdapter (deprecated)
} from '@evodb/core';

// Convert legacy adapter to provider
const legacyAdapter: ObjectStorageAdapter = /* ... */;
const provider = objectAdapterToProvider(legacyAdapter);
```

---

### ObjectMetadata -> StorageMetadata

**File:** `core/src/storage.ts`

```typescript
// BEFORE (deprecated):
import type { ObjectMetadata } from '@evodb/core';

const meta: ObjectMetadata = {
  size: 1024,
  etag: 'abc123',
  lastModified: new Date(),
};

// AFTER (recommended):
import type { StorageMetadata } from '@evodb/core';

const meta: StorageMetadata = {
  size: 1024,
  etag: 'abc123',
  lastModified: new Date(),
};
```

---

### StorageAdapter (DO Block Storage) -> StorageProvider

**File:** `core/src/types.ts`

The `StorageAdapter` interface for Durable Object block storage is deprecated.

```typescript
// BEFORE (deprecated):
import type { StorageAdapter } from '@evodb/core';

const adapter: StorageAdapter = {
  async writeBlock(path, data) { /* ... */ },
  async readBlock(path) { /* ... */ },
  async listBlocks(prefix) { return []; },
  async deleteBlock(path) { /* ... */ },
};

// AFTER (recommended):
import type { StorageProvider } from '@evodb/core';

const provider: StorageProvider = {
  async put(key, data) { /* ... */ },
  async get(key) { /* ... */ },
  async list(prefix) { return []; },
  async delete(key) { /* ... */ },
  async exists(key) { /* ... */ },
};
```

#### Method Mapping

| StorageAdapter | StorageProvider |
|----------------|-----------------|
| `writeBlock(path, data)` | `put(key, data)` |
| `readBlock(path)` | `get(key)` |
| `listBlocks(prefix)` | `list(prefix)` |
| `deleteBlock(path)` | `delete(key)` |

---

### R2StorageAdapter (Lakehouse) -> StorageProvider

**File:** `lakehouse/src/types.ts`

The `R2StorageAdapter` interface with JSON helpers is deprecated.

```typescript
// BEFORE (deprecated):
import type { R2StorageAdapter } from '@evodb/lakehouse';

const adapter: R2StorageAdapter = /* ... */;
const manifest = await adapter.readJson<Manifest>('_manifest.json');
await adapter.writeJson('_manifest.json', manifest);
const binary = await adapter.readBinary('data.bin');
await adapter.writeBinary('data.bin', new Uint8Array([1, 2, 3]));

// AFTER (recommended):
import type { StorageProvider } from '@evodb/core';

const provider: StorageProvider = /* ... */;

// For JSON operations, use TextEncoder/TextDecoder
const data = await provider.get('_manifest.json');
const manifest = data ? JSON.parse(new TextDecoder().decode(data)) : null;

const jsonBytes = new TextEncoder().encode(JSON.stringify(manifest));
await provider.put('_manifest.json', jsonBytes);

// For binary operations, use directly
const binary = await provider.get('data.bin');
await provider.put('data.bin', new Uint8Array([1, 2, 3]));
```

#### Method Mapping

| R2StorageAdapter | StorageProvider |
|------------------|-----------------|
| `readJson<T>(path)` | `get(key)` + `JSON.parse(TextDecoder)` |
| `writeJson(path, data)` | `put(key, TextEncoder(JSON.stringify))` |
| `readBinary(path)` | `get(key)` |
| `writeBinary(path, data)` | `put(key, data)` |
| `list(prefix)` | `list(prefix)` |
| `delete(path)` | `delete(key)` |
| `exists(path)` | `exists(key)` |

---

### StorageAdapter (Lance Reader) -> StorageProvider

**File:** `lance-reader/src/types.ts`

The lance-reader `StorageAdapter` interface is deprecated. Note that lance-reader uses `ArrayBuffer` while `StorageProvider` uses `Uint8Array`.

```typescript
// BEFORE (deprecated):
import type { StorageAdapter } from '@evodb/lance-reader';

const adapter: StorageAdapter = /* ... */;
const buffer: ArrayBuffer = await adapter.get('file.lance');
const range: ArrayBuffer = await adapter.getRange('file.lance', 0, 100);

// AFTER (recommended):
import type { StorageProvider } from '@evodb/core';

const provider: StorageProvider = /* ... */;

// Convert Uint8Array to ArrayBuffer if needed
const data = await provider.get('file.lance');
const buffer: ArrayBuffer | null = data
  ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  : null;

// For range reads, fetch full file and slice
const fullData = await provider.get('file.lance');
const range = fullData?.slice(0, 100);
```

---

### createR2Adapter -> createR2AdapterFromObjectStorage

**File:** `lakehouse/src/r2.ts`

```typescript
// BEFORE (deprecated):
import { createR2Adapter } from '@evodb/lakehouse';

const adapter = createR2Adapter(env.R2_BUCKET);

// AFTER (recommended):
import { createR2AdapterFromObjectStorage } from '@evodb/lakehouse';

// Using ObjectStorageAdapter for better testability
const objectAdapter: ObjectStorageAdapter = /* ... */;
const adapter = createR2AdapterFromObjectStorage(objectAdapter);

// Or use StorageProvider directly
import { createStorageProvider } from '@evodb/core';
const provider = createStorageProvider(env.R2_BUCKET);
```

---

## Type Alias Migrations

### QueryResult -> EngineQueryResult

**File:** `query/src/types.ts`

```typescript
// BEFORE (deprecated):
import type { QueryResult } from '@evodb/query';

const result: QueryResult<User> = await engine.query(/* ... */);

// AFTER (recommended):
import type { EngineQueryResult } from '@evodb/query';

const result: EngineQueryResult<User> = await engine.query(/* ... */);
```

---

### QueryStats -> EngineQueryStats

**File:** `query/src/types.ts`

```typescript
// BEFORE (deprecated):
import type { QueryStats } from '@evodb/query';

const stats: QueryStats = result.stats;

// AFTER (recommended):
import type { EngineQueryStats } from '@evodb/query';

const stats: EngineQueryStats = result.stats;
```

---

### ReaderQueryResult -> SimpleQueryResult (in @evodb/reader)

**File:** `reader/src/types.ts`

```typescript
// BEFORE (deprecated):
import type { QueryResult, QueryStats } from '@evodb/reader';

// AFTER (recommended):
import type { ReaderQueryResult, ReaderQueryStats } from '@evodb/reader';

// Or better yet, use @evodb/query:
import type { SimpleQueryResult, SimpleQueryStats } from '@evodb/query';
```

---

## Function Migrations

### isCompatible -> isSchemaCompatible

**File:** `core/src/schema.ts`

```typescript
// BEFORE (deprecated):
import { isCompatible } from '@evodb/core';

const compatible = isCompatible(olderSchema, newerSchema);

// AFTER (recommended):
import { isSchemaCompatible } from '@evodb/core';

const compatible = isSchemaCompatible(olderSchema, newerSchema);
```

---

### ID Constructor Functions

**File:** `core/src/types.ts`

The following ID constructor functions are deprecated because their types are now plain string/number types (no longer branded):

```typescript
// BEFORE (deprecated):
import {
  snapshotId,
  unsafeSnapshotId,
  batchId,
  unsafeBatchId,
  walId,
  unsafeWalId,
  schemaId,
  unsafeSchemaId,
} from '@evodb/core';

const snap = snapshotId('01HXYZ...');
const batch = batchId('batch-123');
const wal = walId('wal:1234');
const schema = schemaId(1);

// AFTER (recommended):
// Just use the string/number directly - no constructor needed
const snap: SnapshotId = '01HXYZ...';
const batch: BatchId = 'batch-123';
const wal: WalId = 'wal:1234';
const schema: SchemaId = 1;
```

**Note:** `blockId()` and `tableId()` are NOT deprecated - they still provide validation for these critical identifiers.

---

## Circuit Breaker Migrations

### CircuitState.HALF_OPEN

**File:** `core/src/circuit-breaker.ts`

The `HALF_OPEN` state is deprecated. The simplified circuit breaker uses only `CLOSED` and `OPEN` states with exponential backoff.

```typescript
// BEFORE (deprecated):
import { CircuitState } from '@evodb/core';

if (breaker.state === CircuitState.HALF_OPEN) {
  // Handle half-open state
}

// AFTER (recommended):
// The circuit breaker now automatically handles recovery.
// HALF_OPEN behaves like CLOSED after backoff expires.
if (breaker.state === CircuitState.OPEN) {
  // Circuit is open, requests will fail fast
}
```

---

### resetTimeoutMs -> maxBackoffMs

**File:** `core/src/circuit-breaker.ts`

```typescript
// BEFORE (deprecated):
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30000,  // deprecated
  halfOpenMaxAttempts: 3, // deprecated and ignored
});

// AFTER (recommended):
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  maxBackoffMs: 30000,  // Use this instead
});
```

---

## Adapter Functions Reference

For interoperability between old and new interfaces:

```typescript
import {
  // Convert TO StorageProvider
  storageToProvider,        // Storage -> StorageProvider
  objectAdapterToProvider,  // ObjectStorageAdapter -> StorageProvider

  // Convert FROM StorageProvider (deprecated, for legacy code only)
  providerToStorage,        // StorageProvider -> Storage
  providerToObjectAdapter,  // StorageProvider -> ObjectStorageAdapter
} from '@evodb/core';
```

---

## Removal Timeline

| API | Deprecated Since | Planned Removal |
|-----|-----------------|-----------------|
| `@evodb/reader` package | v0.10.0 | v1.0.0 |
| `Storage` interface | v0.10.0 | v1.0.0 |
| `ObjectStorageAdapter` interface | v0.10.0 | v1.0.0 |
| `StorageAdapter` (types.ts) | v0.10.0 | v1.0.0 |
| `R2StorageAdapter` (lakehouse) | v0.10.0 | v1.0.0 |
| `StorageAdapter` (lance-reader) | v0.10.0 | v1.0.0 |
| ID constructor functions | v0.9.0 (evodb-3ju) | v1.0.0 |
| `CircuitState.HALF_OPEN` | v0.9.0 (evodb-7d8) | v1.0.0 |

---

## Need Help?

If you encounter issues during migration:

1. Check the [evodb documentation](https://github.com/evodb/evodb)
2. Open an issue with the `migration` label
3. Review the test files for usage examples:
   - `core/src/__tests__/storage-interface-consolidation.unit.test.ts`
   - `query/src/__tests__/simple-engine.unit.test.ts`
