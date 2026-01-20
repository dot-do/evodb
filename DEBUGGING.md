# EvoDB Debugging Guide

This guide covers common debugging scenarios for EvoDB.

## Common Error Messages

### Schema and Type Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid BlockId format: X. Expected format: prefix:timestamp:seq` | BlockId string doesn't match pattern | Ensure format is `prefix:base36timestamp:base36seq` |
| `Invalid SnapshotId format: X. Expected format: timestamp-random` | SnapshotId string malformed | Use format `base36timestamp-randomchars` |
| `Invalid TableId format: X. Expected UUID format` | TableId not a valid UUID | Use standard UUID v4 format |
| `Invalid SchemaId: X. Must be a non-negative integer` | Schema version is negative or non-integer | Use 0 or positive integers only |
| `WAL entry checksum mismatch` | Corrupted WAL data | Check for data corruption; verify network integrity |

### Query Engine Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Table not found: X` | Table doesn't exist or manifest not loaded | Check table name; call `refreshManifest()` |
| `Column not found: X` | Column not in table schema | Verify column name against schema |
| `Invalid column name: X` | Column name fails validation | Names must start with letter/underscore, contain only alphanumeric/underscore/dot |
| `Invalid filter operator: X` | Unsupported filter operation | Use: eq, ne, lt, le, gt, ge, in, notIn, isNull, isNotNull, like, between |
| `Invalid aggregate function: X` | Unsupported aggregation | Use: count, sum, avg, min, max, countDistinct |
| `Query timeout exceeded` | Query took longer than `timeoutMs` | Increase timeout or optimize query predicates |
| `Memory limit exceeded` | Query processing exceeded `memoryLimitBytes` | Add filters to reduce result set; increase limit |
| `Manifest not found` | R2 bucket missing manifest.json | Ensure lakehouse is initialized with manifest |

### Storage Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Object not found: X` | R2 object doesn't exist | Verify path; check if data was written |
| `Invalid table name: X` | SQL injection prevention triggered | Use only alphanumeric characters and underscores |

## Enabling Verbose Logging

EvoDB uses minimal logging by design. To add debug output:

### Query Engine Debugging

```typescript
import { createQueryEngine } from '@evodb/query';

const engine = createQueryEngine({
  bucket: env.R2_BUCKET,
  // Enable detailed stats in results
});

const result = await engine.execute(query);

// Inspect detailed statistics
console.log('Query Stats:', {
  executionTimeMs: result.stats.executionTimeMs,
  planningTimeMs: result.stats.planningTimeMs,
  ioTimeMs: result.stats.ioTimeMs,
  partitionsScanned: result.stats.partitionsScanned,
  partitionsPruned: result.stats.partitionsPruned,
  rowsScanned: result.stats.rowsScanned,
  rowsMatched: result.stats.rowsMatched,
  zoneMapEffectiveness: result.stats.zoneMapEffectiveness,
  bloomFilterChecks: result.stats.bloomFilterChecks,
  bloomFilterHits: result.stats.bloomFilterHits,
  blockPruneRatio: result.stats.blockPruneRatio,
});
```

### Cache Debugging

```typescript
// Get cache statistics
const cacheStats = engine.getCacheStats();
console.log('Cache Stats:', {
  hits: cacheStats.hits,
  misses: cacheStats.misses,
  hitRatio: cacheStats.hitRatio,
  bytesFromCache: cacheStats.bytesFromCache,
  bytesFromR2: cacheStats.bytesFromR2,
});
```

### Reader Debugging

```typescript
import { createQueryEngine } from '@evodb/reader';

const reader = createQueryEngine({ bucket: env.R2_BUCKET });
const result = await reader.query(request);

console.log('Reader Stats:', {
  blocksScanned: result.stats.blocksScanned,
  blocksSkipped: result.stats.blocksSkipped,
  rowsScanned: result.stats.rowsScanned,
  bytesFromR2: result.stats.bytesFromR2,
  bytesFromCache: result.stats.bytesFromCache,
});
```

## Inspecting WAL Entries

### Deserializing WAL Data

```typescript
import {
  deserializeWalEntry,
  unbatchWalEntries,
  getWalRange,
  WalOp
} from '@evodb/core';

// Single entry
const entry = deserializeWalEntry(walBytes);
console.log('WAL Entry:', {
  lsn: entry.lsn.toString(),
  timestamp: new Date(Number(entry.timestamp)),
  operation: WalOp[entry.op], // 'Insert', 'Update', or 'Delete'
  dataLength: entry.data.length,
  checksum: entry.checksum.toString(16),
});

// Batch of entries
const entries = unbatchWalEntries(batchBytes);
console.log(`Batch contains ${entries.length} entries`);

// Get LSN range without fully parsing
const range = getWalRange(batchBytes);
console.log('WAL Range:', {
  minLsn: range.minLsn.toString(),
  maxLsn: range.maxLsn.toString(),
  count: range.count,
});
```

### WAL Entry Structure

```
Header (24 bytes):
  - lsn:       8 bytes (bigint, little-endian)
  - timestamp: 8 bytes (bigint, ms since epoch)
  - op:        1 byte  (1=Insert, 2=Update, 3=Delete)
  - flags:     1 byte
  - reserved:  2 bytes
  - dataLen:   4 bytes (uint32)
Data:
  - [dataLen bytes of column data]
Footer:
  - checksum:  4 bytes (CRC32)
```

### Block ID Utilities

```typescript
import { makeBlockId, parseBlockId, makeWalId, parseWalId } from '@evodb/core';

// Create IDs
const blockId = makeBlockId('data', Date.now(), 0);
const walId = makeWalId(BigInt(12345));

// Parse IDs
const parsed = parseBlockId(blockId);
if (parsed) {
  console.log('Block:', parsed.prefix, new Date(parsed.timestamp), parsed.seq);
}

const lsn = parseWalId(walId);
console.log('WAL LSN:', lsn?.toString());
```

## Debugging Query Performance

### Using Query Plans

```typescript
// Get execution plan without running query
const plan = await engine.plan(query);

console.log('Query Plan:', {
  planId: plan.planId,
  partitionsSelected: plan.selectedPartitions.length,
  partitionsPruned: plan.prunedPartitions.length,
  usesZoneMaps: plan.usesZoneMaps,
  usesBloomFilters: plan.usesBloomFilters,
  estimatedCost: plan.estimatedCost,
});

// Check pruning reasons
for (const pruned of plan.prunedPartitions) {
  console.log(`Pruned ${pruned.path}: ${pruned.reason} on column ${pruned.column}`);
}
```

### Zone Map Optimization

Zone maps track min/max values per column per partition. To maximize pruning:

```typescript
// Good: Predicates that enable zone map pruning
const query = {
  table: 'events',
  predicates: [
    { column: 'timestamp', operator: 'gte', value: startDate },
    { column: 'timestamp', operator: 'lt', value: endDate },
    { column: 'user_id', operator: 'eq', value: userId },
  ],
};

// Check zone map effectiveness in results
if (result.stats.zoneMapEffectiveness < 0.3) {
  console.warn('Low zone map effectiveness - consider partition layout');
}
```

### Bloom Filter Debugging

```typescript
import { createBloomFilterManager } from '@evodb/query';

const bloomManager = createBloomFilterManager();

// Check bloom filter stats
const stats = bloomManager.getStats();
console.log('Bloom Filter Stats:', {
  checks: stats.checks,
  hits: stats.hits,
  falsePositiveRate: stats.falsePositiveRate,
  targetFpr: stats.targetFpr,
});
```

### Performance Checklist

1. **High `rowsScanned` vs `rowsMatched`**: Add more selective predicates
2. **Low `zoneMapEffectiveness`**: Predicates don't match partition boundaries
3. **Low `cacheHitRatio`**: Enable caching or increase cache size
4. **High `ioTimeMs`**: Data not cached; consider prefetching hot partitions
5. **Many `partitionsScanned`**: Add partition-pruning predicates

## Troubleshooting R2 Connectivity

### Verify Bucket Access

```typescript
// Check if bucket is accessible
const testObject = await env.R2_BUCKET.head('manifest.json');
if (!testObject) {
  console.error('Cannot access manifest - check bucket binding');
}

// List objects to verify permissions
const list = await env.R2_BUCKET.list({ limit: 1 });
console.log('Bucket accessible, objects:', list.objects.length);
```

### Common R2 Issues

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| All reads return null | Wrong bucket binding | Verify `wrangler.toml` bucket binding name |
| Intermittent failures | Network timeouts | Implement retry logic; check worker region |
| Slow reads | Large objects, no caching | Enable Cache API tier; use range reads |
| Permission denied | Bucket not bound | Add bucket to `wrangler.toml` bindings |

### Wrangler Configuration

```toml
# wrangler.toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "evodb-data"
```

### Testing Storage Adapter

```typescript
import { MemoryStorage, R2Storage } from '@evodb/core';

// Use memory storage for testing
const testStorage = new MemoryStorage();
await testStorage.write('test', new Uint8Array([1, 2, 3]));
const data = await testStorage.read('test');
console.log('Memory storage working:', data?.length === 3);

// Test R2 storage
const r2Storage = new R2Storage(env.R2_BUCKET);
try {
  await r2Storage.write('test-key', new Uint8Array([1, 2, 3]));
  const r2Data = await r2Storage.read('test-key');
  console.log('R2 storage working:', r2Data?.length === 3);
  await r2Storage.delete('test-key');
} catch (e) {
  console.error('R2 error:', e);
}
```

### Lakehouse Debugging

```typescript
import { TableStorage, createR2AdapterFromObjectStorage, R2ObjectStorageAdapter } from '@evodb/lakehouse';

const objectStorage = new R2ObjectStorageAdapter(env.R2_BUCKET);
const adapter = createR2AdapterFromObjectStorage(objectStorage);
const tableStorage = new TableStorage(adapter, 'tables/users');

// Check manifest
const manifest = await tableStorage.readManifest();
if (!manifest) {
  console.error('No manifest found for table');
} else {
  console.log('Table manifest:', {
    tableId: manifest.tableId,
    schemaVersion: manifest.currentSchemaId,
    snapshotCount: manifest.snapshots?.length,
  });
}

// List available schemas
const schemaVersions = await tableStorage.listSchemas();
console.log('Schema versions:', schemaVersions);

// List snapshots
const snapshots = await tableStorage.listSnapshots();
console.log('Snapshots:', snapshots);
```

## Memory and Resource Issues

### Vitest Memory Management

Multiple vitest instances can exhaust memory. Follow these guidelines:

```bash
# Kill orphaned processes
pkill -9 -f vitest; pkill -9 -f vite

# Run tests one file at a time
npx vitest run path/to/test.test.ts

# Use run mode, not watch mode for CI
npx vitest run
```

### Debugging Memory in Workers

```typescript
// Check memory pressure before expensive operations
const estimatedMemory = result.stats.peakMemoryBytes;
if (estimatedMemory > 100 * 1024 * 1024) { // 100MB
  console.warn('High memory usage:', estimatedMemory);
}

// Use streaming for large result sets
const stream = await engine.executeStream(query);
for await (const row of stream.rows) {
  // Process one row at a time
}
```
