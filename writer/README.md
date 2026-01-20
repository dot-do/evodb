# @evodb/writer

**From Edge to Lakehouse**

The write path. Aggregates CDC streams from distributed edge databases, buffers efficiently, and writes optimized columnar blocks to R2.

## The Flow

Changes happen at the edge. The Writer brings them home:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Edge (Global)                            │
│                                                                  │
│    User writes → SQLite → CDC event → RPC → Writer DO           │
│                                                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ DO 1    │  │ DO 2    │  │ DO 3    │  │ DO N    │            │
│  │ (user)  │  │ (user)  │  │ (user)  │  │ (user)  │            │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │
│       │            │            │            │                   │
│       └────────────┴─────┬──────┴────────────┘                  │
│                          ▼                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Writer DO                               │  │
│  │                                                            │  │
│  │  Buffer: [entry, entry, entry, ...]                       │  │
│  │                                                            │  │
│  │  When buffer full or timer fires:                         │  │
│  │  1. Shred to columnar                                     │  │
│  │  2. Compress (dictionary, delta, RLE)                     │  │
│  │  3. Write block to R2                                     │  │
│  │  4. Update manifest                                       │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
│                            ▼                                     │
│                       ┌────────┐                                 │
│                       │   R2   │  Columnar blocks               │
│                       └────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Buffer efficiently** - Batch small writes into optimal blocks.

**Compress intelligently** - Dictionary encoding for strings, delta for timestamps.

**Write atomically** - Manifest updates are all-or-nothing.

## Installation

```bash
npm install @evodb/writer
```

## Quick Start

```typescript
import { LakehouseWriter, CDCBuffer } from '@evodb/writer';

// Create a writer
const writer = new LakehouseWriter({
  bucket: env.R2_BUCKET,
  tablePath: 'com/example/events',
});

// Buffer CDC entries
const buffer = new CDCBuffer({
  maxSize: 10_000,        // Flush at 10K entries
  maxBytes: 10_000_000,   // Or 10MB
  maxAgeMs: 30_000,       // Or 30 seconds
});

// Add entries as they arrive
buffer.add({
  op: 'INSERT',
  table: 'events',
  data: { type: 'click', userId: 123 },
  lsn: 100n,
});

// Flush when ready
if (buffer.shouldFlush()) {
  const entries = buffer.drain();
  const result = await writer.flush(entries);
  // { blockPath: 'data/blk_abc123.parquet', rowCount: 10000 }
}
```

## Durable Object Setup

```typescript
import { createLakehouseParentDOClass } from '@evodb/writer';

// Create a configured Writer DO
export const WriterDO = createLakehouseParentDOClass({
  bucket: 'LAKEHOUSE',
  flushThreshold: 10_000,
  flushIntervalMs: 30_000,
  partitionMode: 'standard',
});

// wrangler.toml
// [[durable_objects.bindings]]
// name = "WRITER"
// class_name = "WriterDO"
//
// [[r2_buckets]]
// binding = "LAKEHOUSE"
// bucket_name = "evodb-lakehouse"
```

## Partition Modes

Different scale, different configuration:

| Mode | Max Size | Block Size | Use Case |
|------|----------|------------|----------|
| `do-sqlite` | 2MB | 64KB | Per-user databases |
| `standard` | 500MB | 4MB | Most applications |
| `enterprise` | 5GB | 32MB | High-volume analytics |

```typescript
const writer = new LakehouseWriter({
  partitionMode: 'standard',  // 500MB max, 4MB blocks
  // ...
});
```

## Block Writing Strategies

### Size-Based Flushing

```typescript
const buffer = new CDCBuffer({
  maxBytes: 10_000_000,  // Flush at 10MB
});
```

### Count-Based Flushing

```typescript
const buffer = new CDCBuffer({
  maxSize: 10_000,  // Flush at 10K rows
});
```

### Time-Based Flushing

```typescript
const buffer = new CDCBuffer({
  maxAgeMs: 30_000,  // Flush every 30 seconds
});
```

### Backpressure

```typescript
const controller = new BackpressureController({
  highWaterMark: 50_000_000,  // 50MB
  lowWaterMark: 10_000_000,   // 10MB
});

// Pause upstream when buffer is full
if (controller.shouldPause()) {
  await client.pause();
}
```

## Compaction

Small blocks get merged into larger ones:

```typescript
import { BlockCompactor } from '@evodb/writer';

const compactor = new BlockCompactor({
  targetBlockSize: 64_000_000,  // 64MB target
  minBlocksToCompact: 4,        // Need 4+ small blocks
});

// Run compaction
const result = await compactor.compact(table);
// { compactedBlocks: 12, newBlocks: 3, bytesReclaimed: 100_000_000 }
```

## API Reference

### Writer

```typescript
LakehouseWriter          // Main writer class
writer.flush(entries)    // Write entries to R2
writer.compact()         // Compact small blocks
```

### Buffer

```typescript
CDCBuffer                // Basic CDC buffer
buffer.add(entry)        // Add entry
buffer.shouldFlush()     // Check flush condition
buffer.drain()           // Get and clear entries
```

### Block Writer

```typescript
R2BlockWriter            // Write blocks to R2
InMemoryBlockWriter      // For testing
createBlockWriter(opts)  // Factory function
```

### Parent DO

```typescript
LakehouseParentDO              // Base class
createLakehouseParentDOClass() // Factory
```

## Observability

```typescript
const stats = writer.getStats();
// {
//   blocksWritten: 42,
//   bytesWritten: 500_000_000,
//   rowsWritten: 5_000_000,
//   avgBlockSize: 12_000_000,
//   compactionsPending: 2
// }
```

## Related Packages

- [@evodb/core](../core) - Columnar shredding
- [@evodb/rpc](../rpc) - CDC transport
- [@evodb/lakehouse](../lakehouse) - Manifest management
- [@evodb/reader](../reader) - Query path

## License

MIT - Copyright 2026 .do
