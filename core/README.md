# @evodb/core

**The Schema Evolution Engine**

The heart of EvoDB. A columnar JSON engine with variant shredding that lets your schema evolve gracefully - from flexible discovery to locked-down production.

## The Insight

Traditional databases store rows. EvoDB stores columns.

This seemingly simple change unlocks everything:

```
Row Storage:                    Column Storage:
┌────┬───────┬───────┐         ┌────────────────────┐
│ id │ name  │ score │         │ id:    [1, 2, 3]   │
├────┼───────┼───────┤         ├────────────────────┤
│ 1  │ Alice │ 95    │   →     │ name:  [A, B, C]   │
│ 2  │ Bob   │ 87    │         ├────────────────────┤
│ 3  │ Carol │ 92    │         │ score: [95, 87, 92]│
└────┴───────┴───────┘         └────────────────────┘

Query: SELECT name WHERE score > 90
- Row: Read ALL data, filter rows
- Column: Read ONLY score + name columns (95% less I/O)
```

**Read only what you query.** When you select 2 fields from a 50-field document, you read 2 columns, not 50.

## Variant Shredding

Inspired by ClickHouse's columnar JSON and Iceberg/Parquet's variant types, EvoDB handles evolving schemas elegantly:

```typescript
import { shred, reassemble, inferSchema } from '@evodb/core';

// Notice how the schema evolves across documents
const events = [
  { id: 1, value: 'click' },        // value is string
  { id: 2, value: 42 },             // value is number
  { id: 3, value: { x: 1, y: 2 } }, // value is object
];

// Shred into columnar format with type tags
const columnar = shred(events);

// Each column tracks its types
// value: { types: ['string', 'number', 'object'], data: [...] }

// Queries work across all variants
const schema = inferSchema(columnar);
// value: { type: 'variant', variants: ['string', 'number', 'object'] }
```

No migrations. No nullable hacks. Types evolve naturally.

## Schema Evolution Modes

### Discovery Mode (Development)

Let EvoDB learn your schema:

```typescript
import { SchemaRegistry } from '@evodb/core';

const registry = new SchemaRegistry({ mode: 'discover' });

// Just write data - schema is inferred
await registry.observe('users', { name: 'Alice', email: 'alice@example.com' });
await registry.observe('users', { name: 'Bob', role: 'admin' });  // New field!

// Check what we've learned
const schema = registry.getSchema('users');
// { name: 'string', email: 'string?', role: 'string?' }
```

### Validation Mode (Staging)

Validate without rejecting:

```typescript
const registry = new SchemaRegistry({ mode: 'validate' });
registry.loadSchema('users', learnedSchema);

// Writes are validated but not rejected
const result = await registry.observe('users', {
  name: 'Carol',
  unexpected: 'field'  // Warning, not error
});
// result.warnings: ['Unknown field: unexpected']
```

### Enforcement Mode (Production)

Lock it down:

```typescript
const registry = new SchemaRegistry({ mode: 'enforce' });
registry.loadSchema('users', lockedSchema);

// Invalid writes are rejected
await registry.observe('users', { name: 123 });
// Throws: name must be string
```

## Installation

```bash
npm install @evodb/core
```

## Focused Imports (Tree-Shaking)

For optimal bundle size, use focused entry points instead of the barrel export:

```typescript
// Focused imports - only import what you need (~8KB each)
import { encode, decode } from '@evodb/core/encoding';
import { shred, unshred } from '@evodb/core/shredding';
import { evaluateFilters, sortRows } from '@evodb/core/query';
import { createDOAdapter } from '@evodb/core/storage';
import { Type, BlockId } from '@evodb/core/types';
import { EvoDBError, QueryError } from '@evodb/core/errors';
import { KB, MB, GB } from '@evodb/core/constants';
import { isArray, isRecord } from '@evodb/core/guards';

// Barrel export - includes everything (~460KB)
import { encode, decode } from '@evodb/core';
```

### Available Entry Points

| Entry Point | Description | Key Exports |
|-------------|-------------|-------------|
| `@evodb/core` | Full barrel (backward compat) | Everything |
| `@evodb/core/types` | Type definitions | `Type`, `Encoding`, `BlockId`, `SchemaId` |
| `@evodb/core/encoding` | Encoding operations | `encode`, `decode`, `SparseNullSet` |
| `@evodb/core/shredding` | JSON shredding | `shred`, `unshred`, `extractPath` |
| `@evodb/core/query` | Query operations | `evaluateFilters`, `sortRows`, `computeAggregations` |
| `@evodb/core/storage` | Storage adapters | `createDOAdapter`, `R2StorageProvider` |
| `@evodb/core/block` | Block format | `writeBlock`, `readBlock` |
| `@evodb/core/wal` | Write-ahead log | `createWalEntry` |
| `@evodb/core/schema` | Schema operations | `inferSchema` |
| `@evodb/core/errors` | Error classes | `EvoDBError`, `QueryError`, `StorageError` |
| `@evodb/core/constants` | Size constants | `KB`, `MB`, `GB` |
| `@evodb/core/guards` | Type guards | `isArray`, `isRecord` |
| `@evodb/core/evodb` | High-level facade | `EvoDB`, `QueryBuilder` |
| `@evodb/core/snippet` | Snippets format | Cloudflare Snippets optimized |
| `@evodb/core/partition` | Partition modes | DO-SQLite, Standard, Enterprise |
| `@evodb/core/merge` | Compaction | `mergeBlocks` |
| `@evodb/core/logging` | Logging types | Logger interfaces |
| `@evodb/core/tracing` | Tracing types | Span interfaces |

## Quick Start

```typescript
import { shred, unshred, writeBlock, readBlock } from '@evodb/core';

// Shred JSON into columns
const rows = [
  { id: 1, name: 'Alice', score: 95 },
  { id: 2, name: 'Bob', score: 87 },
];

const columns = shred(rows);
// { id: [1, 2], name: ['Alice', 'Bob'], score: [95, 87] }

// Reconstruct rows
const restored = unshred(columns);
```

## API Reference

### Shredding

```typescript
shred(rows)                // Convert rows to columnar format
unshred(columns)           // Convert columns back to rows
extractPath(columns, path) // Extract nested path
appendRows(columns, rows)  // Append rows to existing columns
```

### Schema

```typescript
inferSchema(rows)              // Infer schema from data
isCompatible(schema1, schema2) // Check compatibility
migrateColumns(columns, diff)  // Migrate to new schema
```

### Encoding

```typescript
encode(column, encoding)   // Encode column (dictionary, delta, bitpack)
decode(encoded)            // Decode back to values
```

### Block Format

```typescript
writeBlock(columns, opts)  // Write columns to block
readBlock(buffer)          // Read block to columns
getBlockStats(block)       // Get block statistics
```

### Branded Types

Type-safe IDs prevent mixing up identifiers:

```typescript
import { BlockId, SnapshotId, SchemaId } from '@evodb/core';

const blockId = BlockId.create();       // 'blk_abc123'
const snapshotId = SnapshotId.create(); // 'snap_xyz789'

// TypeScript prevents mixing them up
function loadBlock(id: BlockId): Promise<Block>;
loadBlock(snapshotId);  // Compile error!
```

## Performance

| Operation | 1M docs | Notes |
|-----------|---------|-------|
| Shred | 450ms | 120MB peak memory |
| Unshred | 380ms | 95MB peak memory |
| Schema infer | 12ms | 2MB memory |
| Single column read | 8ms | ~1/50th of full read |

## Related Packages

- [@evodb/writer](../writer) - Write columnar blocks to R2
- [@evodb/reader](../reader) - Read and query columnar data
- [@evodb/lakehouse](../lakehouse) - Manifest management
- [@evodb/codegen](../codegen) - Schema CLI tools

## License

MIT - Copyright 2026 .do
