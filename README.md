# EvoDB

**Distributed Lakehouse for Cloudflare Workers**

EvoDB is a distributed lakehouse architecture built natively for Cloudflare Workers. It enables real-time analytics at the edge by combining Durable Objects for coordination with R2 for columnar storage, all optimized for the constraints of edge computing.

## Architecture

```
┌─────────────┐    CDC     ┌─────────────┐    Blocks    ┌─────┐
│  Leaf DOs   │ ────────── │  Parent DO  │ ───────────► │ R2  │
│  (SQLite)   │  CapnWeb   │  (Writer)   │   Columnar   │     │
└─────────────┘            └─────────────┘              └─────┘
                                                            │
                           ┌─────────────┐     Query        │
                           │   Workers   │ ◄────────────────┘
                           │  (Reader)   │    Cache API
                           └─────────────┘
```

**Data Flow:**
1. **Leaf DOs** - Individual SQLite-backed Durable Objects capture writes
2. **Parent DO** - Aggregates CDC streams via CapnWeb RPC, buffers and compacts
3. **R2** - Stores columnar data blocks with Iceberg-inspired manifests
4. **Workers** - Query engine reads from R2 with Cache API acceleration

## Packages

| Package | Description |
|---------|-------------|
| [@evodb/core](./core) | Columnar JSON shredding with schema evolution (ClickHouse-style) |
| [@evodb/rpc](./rpc) | CapnWeb RPC for DO-to-DO CDC with WebSocket hibernation |
| [@evodb/writer](./writer) | Parent DO for CDC aggregation and R2 block writing |
| [@evodb/reader](./reader) | Worker-based query engine for R2 + Cache API |
| [@evodb/lakehouse](./lakehouse) | Iceberg-inspired manifest with snapshots and time-travel |
| [@evodb/edge-cache](./edge-cache) | Workers Cache API integration with cdn.workers.do support |
| [@evodb/query](./query) | Query engine with zone maps and bloom filter optimization |
| [@evodb/lance-reader](./lance-reader) | Pure TypeScript Lance format reader for vector search |
| [@evodb/snippets-chain](./snippets-chain) | Chained Snippets patterns (scatter-gather, map-reduce, pipeline) |
| [@evodb/snippets-lance](./snippets-lance) | Lance vector search optimized for Snippets constraints |
| [@evodb/benchmark](./benchmark) | Scale-out benchmark harness with JSONBench Bluesky data |
| [@evodb/codegen](./codegen) | Schema codegen CLI (pull, push, lock, diff) |

## Quick Start

### Installation

```bash
# Install core packages
npm install @evodb/core @evodb/writer @evodb/reader

# For vector search
npm install @evodb/lance-reader

# For Snippets deployment
npm install @evodb/snippets-lance @evodb/snippets-chain
```

### Basic Usage

```typescript
import { shred, reassemble } from '@evodb/core';
import { WriterDO } from '@evodb/writer';
import { Reader } from '@evodb/reader';

// Shred JSON into columnar format
const columnar = shred([
  { id: 1, name: 'Alice', score: 95 },
  { id: 2, name: 'Bob', score: 87 },
]);

// Query with zone map optimization
const reader = new Reader(env.R2_BUCKET, env.CACHE);
const results = await reader.query({
  table: 'users',
  filter: { score: { $gte: 90 } },
  select: ['id', 'name'],
});
```

### Durable Object Setup

```typescript
// wrangler.toml
[[durable_objects.bindings]]
name = "WRITER"
class_name = "WriterDO"

[[durable_objects.bindings]]
name = "LEAF"
class_name = "LeafDO"

[[r2_buckets]]
binding = "LAKEHOUSE"
bucket_name = "evodb-lakehouse"
```

## Snippets Constraints

EvoDB packages are designed to work within Cloudflare Snippets free tier constraints:

| Resource | Limit |
|----------|-------|
| Subrequests | 5 |
| CPU Time | 5ms |
| Memory | 32MB |

The `@evodb/snippets-lance` and `@evodb/snippets-chain` packages are specifically optimized for these constraints, using techniques like:

- Streaming decompression to minimize memory
- IVF-PQ index pruning for sub-5ms vector search
- Scatter-gather patterns across multiple Snippets

## Package Dependencies

```
@evodb/core                    # Types, shredding (no deps)
    │
    ├── @evodb/rpc             # DO-to-DO communication
    │
    ├── @evodb/lakehouse       # Manifest management
    │       │
    │       ├── @evodb/writer  # CDC buffer → R2
    │       │
    │       └── @evodb/reader  # R2 → Workers
    │               │
    │               └── @evodb/query  # Zone maps, bloom filters
    │
    ├── @evodb/edge-cache      # Cache API integration
    │
    ├── @evodb/lance-reader    # Vector index reader
    │       │
    │       └── @evodb/snippets-lance  # Snippets-optimized
    │
    ├── @evodb/snippets-chain  # Chained patterns
    │
    ├── @evodb/benchmark       # Performance testing
    │
    └── @evodb/codegen         # Schema CLI
```

## Related Projects

- [@dotdo/turso](https://github.com/dotdo/turso) - Turso/libSQL integration
- [@dotdo/poc-datafusion-wasm](https://github.com/dotdo/poc-datafusion-wasm) - DataFusion WASM for complex queries

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run tests (one at a time - see memory note below)
pnpm -r test

# Run benchmarks
cd benchmark && pnpm bench
```

**Note:** Vitest/Vite can consume significant memory. Run one test file at a time and use `npx vitest run` (not watch mode) for CI. Kill orphan processes with:

```bash
pkill -9 -f vitest; pkill -9 -f vite
```

## License

MIT
