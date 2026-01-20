# @evodb/writer

Parent DO CDC buffer to R2 with columnar block format.

## Installation

```bash
npm install @evodb/writer
```

## Overview

This package provides the write path for EvoDB:

- **CDC Buffering**: Collect changes from child DOs
- **Block Writing**: Write columnar blocks to R2
- **Compaction**: Merge small blocks into larger ones
- **Parent DO**: WebSocket-enabled aggregator implementation
- **Partition Modes**: Support for 2MB, 500MB, and 5GB partitions

## Quick Start

```typescript
import { LakehouseWriter, CDCBuffer } from '@evodb/writer';

// Create a writer
const writer = new LakehouseWriter({
  bucket: env.R2_BUCKET,
  tablePath: 'com/example/users',
  partitionMode: 'standard', // 500MB max
});

// Buffer CDC entries
const buffer = new CDCBuffer({ maxSize: 1000, maxBytes: 10_000_000 });

buffer.add({
  op: 'INSERT',
  table: 'users',
  data: { id: 1, name: 'Alice' },
  lsn: 100n,
});

// Flush to R2 when buffer is full
if (buffer.shouldFlush()) {
  const result = await writer.flush(buffer.drain());
  console.log(`Wrote ${result.rowCount} rows to ${result.blockPath}`);
}
```

## Parent DO Usage

```typescript
import { createLakehouseParentDOClass } from '@evodb/writer';

// Create a configured Parent DO class
export const MyParentDO = createLakehouseParentDOClass({
  partitionMode: 'standard',
  flushThreshold: 10_000,
  flushIntervalMs: 30_000,
});

// wrangler.jsonc
{
  "durable_objects": {
    "bindings": [{ "name": "PARENT", "class_name": "MyParentDO" }]
  }
}
```

## API Reference

### Buffer Classes

```typescript
CDCBuffer              // Simple CDC buffer
MultiTableBuffer       // Buffer for multiple tables
BackpressureController // Flow control for high throughput
SizeBasedBuffer        // Size-aware buffering
```

### R2 Writer

```typescript
R2BlockWriter          // Write single blocks
BatchR2Writer          // Batch multiple blocks
R2WriterWithManifest   // Writer with manifest updates
makeR2BlockKey(opts)   // Generate R2 key for block
generateBlockId()      // Generate unique block ID
```

### Compactor

```typescript
BlockCompactor         // Basic block compaction
CompactionScheduler    // Schedule compaction jobs
TieredCompactor        // Tiered compaction strategy
type CompactionConfig  // Compaction settings
```

### Parent DO

```typescript
LakehouseParentDO         // Base parent DO
ExampleLakehouseParentDO  // Example implementation
EdgeCacheParentDO         // Edge cache aware parent
EnterpriseParentDO        // 5GB partition support
createLakehouseParentDOClass(opts) // Factory function
```

### Types

```typescript
type WriterOptions     // Writer configuration
type PartitionMode     // 'do-sqlite' | 'standard' | 'enterprise'
type CDCEntry          // Change data capture entry
type FlushResult       // Result of flush operation
type CompactResult     // Result of compaction
type BlockMetadata     // Block metadata
type ManifestEntry     // Entry in manifest file
```

### Constants

```typescript
PARTITION_MODES = {
  'do-sqlite':  { maxBytes: 2MB,  blockSize: 64KB  },
  'standard':   { maxBytes: 500MB, blockSize: 4MB  },
  'enterprise': { maxBytes: 5GB,  blockSize: 32MB }
}
```

## Related Packages

- `@evodb/core` - Columnar encoding primitives
- `@evodb/rpc` - DO-to-DO communication
- `@evodb/reader` - Query from R2
- `@evodb/lakehouse` - Manifest management

## License

MIT
