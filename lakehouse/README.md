# @evodb/lakehouse

**Time-Travel for Your Data**

The unified storage layer. Iceberg-inspired manifest management that gives you snapshots, time-travel queries, and schema evolution - all backed by Cloudflare R2.

## The Vision

Your edge databases are distributed globally. But analytics need to see everything:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Global Lakehouse                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Unified View                           │   │
│  │                                                           │   │
│  │  • Query across all tenants                              │   │
│  │  • Time-travel to any snapshot                           │   │
│  │  • Schema evolution with compatibility                    │   │
│  │  • Partition pruning for fast queries                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         │                    │                    │             │
│  ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐       │
│  │ Tenant: acme│     │Tenant: globex│     │ Tenant: ...│       │
│  │  namespace  │     │  namespace   │     │  namespace │       │
│  └─────────────┘     └──────────────┘     └────────────┘       │
│                                                                  │
│  Storage: Cloudflare R2 (S3-compatible, zero egress)            │
└─────────────────────────────────────────────────────────────────┘
```

**Global indexes** for cross-tenant analytics. **Tenant-scoped namespaces** for isolation. **Time-travel** for auditing and debugging.

## Installation

```bash
npm install @evodb/lakehouse
```

## Quick Start

```typescript
import { createTable, appendFiles, createR2Adapter } from '@evodb/lakehouse';

// Connect to R2
const storage = createR2Adapter(env.R2_BUCKET);

// Create a table with schema
let table = createTable({
  tableId: 'events',
  location: 'com/example/events',
  schema: {
    schemaId: 1,
    columns: [
      { name: 'id', type: 'int64', nullable: false },
      { name: 'type', type: 'string', nullable: false },
      { name: 'data', type: 'variant', nullable: true },  // Flexible!
      { name: 'timestamp', type: 'timestamp', nullable: false },
    ],
  },
});

// Append data files (creates a snapshot)
table = appendFiles(table, {
  files: [{
    filePath: 'data/part-0001.parquet',
    rowCount: 10000,
    sizeBytes: 1_000_000,
  }],
});

// Every append creates a new snapshot
console.log(table.currentSnapshotId);  // 'snap_abc123'
```

## Time-Travel Queries

Query data as it existed at any point in time:

```typescript
import { findSnapshotAsOf, getFilesForQuery } from '@evodb/lakehouse';

// What did the data look like last week?
const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const historicalSnapshot = findSnapshotAsOf(table, lastWeek);

// Get files for that snapshot
const files = getFilesForQuery(table, historicalSnapshot.snapshotId);

// Query historical data
const results = await reader.query(files, { ... });
```

**Use cases:**
- Debug production issues by querying past state
- Audit trails with immutable history
- Rollback to a known-good snapshot
- Compare data between time periods

## Schema Evolution

Schemas evolve without breaking existing data:

```typescript
import { evolveSchema, addSchema, isCompatible } from '@evodb/lakehouse';

// Add a new column (backward compatible)
const newSchema = evolveSchema(table.currentSchema, {
  add: [{ name: 'region', type: 'string', nullable: true }]
});

// Verify compatibility
if (isCompatible(table.currentSchema, newSchema)) {
  table = addSchema(table, newSchema);
}

// Existing data still readable - new column is null for old rows
```

**Compatible changes:**
- Add nullable column
- Widen type (int32 → int64)
- Make required field optional

**Breaking changes (require migration):**
- Remove column
- Narrow type
- Make optional field required

## Partition Pruning

Only read relevant files:

```typescript
import { pruneFiles, dayField } from '@evodb/lakehouse';

// Partition by date
const table = createTable({
  // ...
  partitionSpec: {
    fields: [dayField('timestamp')]
  }
});

// Query only reads files for matching partitions
const files = pruneFiles(table, {
  partitionFilters: [
    { column: 'timestamp', operator: 'gte', value: '2024-01-01' },
    { column: 'timestamp', operator: 'lt', value: '2024-02-01' },
  ]
});

// Instead of scanning 365 days, we read 31
```

## Tenant Namespaces

Isolate tenant data while enabling cross-tenant analytics:

```typescript
// Tenant-specific namespace
const acmeTable = createTable({
  tableId: 'events',
  location: 'tenants/acme/events',  // Isolated
  // ...
});

// Global analytics namespace
const globalIndex = createTable({
  tableId: 'all_events',
  location: 'global/events',  // Cross-tenant
  // ...
});
```

## API Reference

### Table Operations

```typescript
createTable(opts)              // Create new table
appendFiles(table, opts)       // Add files (append snapshot)
overwriteFiles(table, opts)    // Replace files (overwrite snapshot)
compact(table, opts)           // Merge small files
```

### Snapshot Operations

```typescript
findSnapshotById(table, id)    // Get specific snapshot
findSnapshotAsOf(table, time)  // Time-travel
getSnapshotHistory(table)      // List all snapshots
diffSnapshots(table, a, b)     // Compare snapshots
```

### Schema Operations

```typescript
createSchema(columns)          // Create schema
evolveSchema(schema, changes)  // Evolve schema
isCompatible(old, new)         // Check compatibility
addSchema(table, schema)       // Add schema version
```

### Partition Operations

```typescript
dayField(name)                 // Partition by day
monthField(name)               // Partition by month
bucketField(name, n)           // Hash bucket
pruneFiles(table, query)       // Partition pruning
```

### R2 Storage

```typescript
const adapter = createR2Adapter(bucket);
await adapter.read(path)       // Read file
await adapter.write(path, data)// Write file
await adapter.list(prefix)     // List files
await atomicCommit(adapter, table, manifest)  // Atomic update
```

## Related Packages

- [@evodb/core](../core) - Columnar encoding
- [@evodb/writer](../writer) - Write data to lakehouse
- [@evodb/reader](../reader) - Query from lakehouse
- [@evodb/edge-cache](../edge-cache) - Edge caching

## License

MIT - Copyright 2026 .do
