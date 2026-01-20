# @evodb/core

Columnar JSON shredding and encoding for Cloudflare Durable Objects.

## Installation

```bash
npm install @evodb/core
```

## Overview

This package provides the core primitives for EvoDB's columnar storage format:

- **JSON Shredding**: Convert nested JSON to columnar representation
- **Encoding**: Dictionary, delta, and bit-packed encodings
- **Block Format**: Read/write columnar data blocks
- **WAL**: Write-ahead log for durability
- **Schema**: Inference and evolution
- **Partition Modes**: DO-SQLite (2MB), Standard (500MB), Enterprise (5GB)

## Quick Start

```typescript
import { shred, unshred, writeBlock, readBlock } from '@evodb/core';

// Shred JSON into columns
const rows = [
  { id: 1, name: 'Alice', score: 95 },
  { id: 2, name: 'Bob', score: 87 },
];

const columns = shred(rows);
// columns = { id: [1, 2], name: ['Alice', 'Bob'], score: [95, 87] }

// Reconstruct rows
const restored = unshred(columns);
```

## API Reference

### JSON Shredding

```typescript
shred(rows)              // Convert rows to columnar format
unshred(columns)         // Convert columns back to rows
extractPath(columns, path) // Extract nested path
appendRows(columns, rows)  // Append rows to existing columns
```

### Encoding

```typescript
encode(column, encoding)  // Encode column with specified encoding
decode(encoded)           // Decode back to values
fastDecodeInt32(buffer)   // SIMD-friendly int32 decode
fastDecodeFloat64(buffer) // SIMD-friendly float64 decode
```

### Block Format

```typescript
writeBlock(columns, options)  // Write columns to block
readBlock(buffer)             // Read block to columns
getBlockStats(block)          // Get block statistics
```

### WAL Operations

```typescript
createWalEntry(op, data)      // Create WAL entry
serializeWalEntry(entry)      // Serialize to bytes
deserializeWalEntry(buffer)   // Deserialize from bytes
batchWalEntries(entries)      // Batch multiple entries
```

### Schema

```typescript
inferSchema(rows)             // Infer schema from data
isCompatible(schema1, schema2) // Check compatibility
migrateColumns(columns, diff)  // Migrate to new schema
```

### Partition Modes

```typescript
import {
  DO_SQLITE_CONFIG,      // 2MB max, 64KB blocks
  STANDARD_CONFIG,       // 500MB max, 4MB blocks
  ENTERPRISE_CONFIG,     // 5GB max, 32MB blocks
  selectPartitionMode,
  calculatePartitions
} from '@evodb/core';

const mode = selectPartitionMode(dataSize, accountTier);
const partitions = calculatePartitions(dataSize, mode);
```

### Snippet-Optimized Format

Optimized for Cloudflare Snippets constraints (5ms CPU, 32MB RAM):

```typescript
import {
  encodeSnippetColumn,
  decodeSnippetColumn,
  BloomFilter,
  computeZoneMap,
} from '@evodb/core';

// Zero-copy decode for hot paths
const values = zeroCopyDecodeInt32(buffer);
```

## Related Packages

- `@evodb/writer` - Parent DO CDC buffer to R2
- `@evodb/reader` - Worker query from R2
- `@evodb/lakehouse` - Iceberg-inspired manifest management

## License

MIT
