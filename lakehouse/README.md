# @evodb/lakehouse

Iceberg-inspired manifest management optimized for Cloudflare R2.

## Installation

```bash
npm install @evodb/lakehouse
```

## Overview

This package provides lakehouse table management:

- **Table Manifests**: Track data files with snapshots for time-travel
- **Schema Evolution**: Add/drop columns with compatibility checking
- **Partition Specs**: Define and prune by partition columns
- **URL-based Paths**: Reverse hostname organization (e.g., `com/example/api/users`)
- **Snapshot History**: Query historical versions of tables
- **Compaction**: Merge small files into larger ones

## Quick Start

```typescript
import {
  createTable,
  appendFiles,
  queryFiles,
  createR2Adapter,
} from '@evodb/lakehouse';

// Create storage adapter
const storage = createR2Adapter(env.R2_BUCKET);

// Create a new table
let table = createTable({
  tableId: 'users',
  location: 'com/example/users',
  schema: {
    schemaId: 1,
    columns: [
      { name: 'id', type: 'int64', nullable: false },
      { name: 'name', type: 'string', nullable: false },
      { name: 'email', type: 'string', nullable: true },
    ],
  },
  partitionSpec: {
    specId: 0,
    fields: [{ name: 'created_date', transform: 'day', sourceId: 3 }],
  },
});

// Append data files
table = appendFiles(table, {
  files: [
    {
      filePath: 'data/part-0001.parquet',
      format: 'parquet',
      rowCount: 10000,
      sizeBytes: 1_000_000,
      partitionValues: { created_date: '2024-01-15' },
    },
  ],
});

// Query files for a partition range
const files = queryFiles(table, {
  partitionFilters: [
    { column: 'created_date', operator: 'gte', value: '2024-01-01' },
    { column: 'created_date', operator: 'lt', value: '2024-02-01' },
  ],
});
```

## API Reference

### Table Operations

```typescript
createTable(options)           // Create new table manifest
appendFiles(table, options)    // Add data files (append snapshot)
overwriteFiles(table, options) // Replace files (overwrite snapshot)
compact(table, options)        // Merge small files
```

### Schema Operations

```typescript
createSchema(columns)          // Create schema definition
evolveSchema(schema, changes)  // Evolve schema
inferSchema(rows)              // Infer from sample data
isCompatible(old, new)         // Check compatibility
addSchema(table, schema)       // Add schema version
setCurrentSchema(table, id)    // Set active schema
```

### Partition Operations

```typescript
createPartitionSpec(fields)    // Create partition spec
identityField(name)            // Partition by column value
yearField(name)                // Partition by year
monthField(name)               // Partition by month
dayField(name)                 // Partition by day
bucketField(name, n)           // Hash bucket partitioning
truncateField(name, width)     // Truncate string/int
```

### Partition Pruning

```typescript
pruneByPartition(files, filters)    // Prune by partition values
pruneByColumnStats(files, filters)  // Prune by zone maps
pruneFiles(files, query)            // Full pruning pipeline

// Optimized pruning with index
const index = createPartitionIndex(files);
const pruned = pruneFilesOptimized(index, filters);
```

### Snapshot Operations

```typescript
findSnapshotById(table, id)         // Get specific snapshot
findSnapshotAsOf(table, timestamp)  // Time-travel query
getSnapshotHistory(table)           // List all snapshots
diffSnapshots(table, id1, id2)      // Compare snapshots
getExpiredSnapshots(table, options) // Find old snapshots
getOrphanedFiles(table)             // Find unreferenced files
```

### Path Utilities

```typescript
urlToR2Path(url)      // 'https://api.example.com/v1' -> 'com/example/api/v1'
r2PathToUrl(path)     // Reverse conversion
manifestPath(table)   // Get manifest file path
dataDir(table)        // Get data directory path
```

### R2 Storage

```typescript
const adapter = createR2Adapter(bucket);

await adapter.read(path)              // Read file
await adapter.write(path, data)       // Write file
await adapter.delete(path)            // Delete file
await adapter.list(prefix)            // List files

// Atomic commit (optimistic concurrency)
await atomicCommit(adapter, table, newManifest);
```

## Time-Travel Queries

```typescript
// Query table as of a specific time
const historicalSnapshot = findSnapshotAsOf(table, new Date('2024-01-01'));
const files = getFilesForQuery(table, historicalSnapshot.snapshotId);

// Use snapshot cache for repeated time-travel
const cache = createSnapshotCache();
const traverser = createSnapshotTraverser(table, cache);
const query = new TimeTravelQuery(traverser);
```

## Related Packages

- `@evodb/core` - Columnar encoding primitives
- `@evodb/writer` - Write data files to R2
- `@evodb/reader` - Query data from R2
- `@evodb/edge-cache` - Edge caching for hot data

## License

MIT
