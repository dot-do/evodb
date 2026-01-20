# EvoDB Architecture

## High-Level System Diagram

```
                                    GLOBAL LAKEHOUSE
    ┌─────────────────────────────────────────────────────────────────────────────┐
    │                              R2 Object Storage                               │
    │  ┌──────────────────────────────────────────────────────────────────────┐   │
    │  │  Columnar Blocks (.evodb)    Manifests (JSON)     Snapshots (JSON)   │   │
    │  │  ├── data/                   ├── manifest.json    ├── snapshots/     │   │
    │  │  │   └── blocks/             └── schemas/         │   └── v1.json    │   │
    │  │  │       └── *.evodb                              │       v2.json    │   │
    │  │  └── lance/                                       └── time-travel    │   │
    │  │      └── *.lance (vectors)                                           │   │
    │  └──────────────────────────────────────────────────────────────────────┘   │
    └───────────────────────────────────────┬─────────────────────────────────────┘
                                            │
              WRITE PATH                    │                    READ PATH
    ┌───────────────────────────────────────┼───────────────────────────────────────┐
    │                                       │                                       │
    │  ┌─────────────┐                      │                      ┌─────────────┐  │
    │  │  Edge DOs   │                      │                      │   Workers   │  │
    │  │  (SQLite)   │                      │                      │   (Query)   │  │
    │  │  per-user   │                      │                      │             │  │
    │  └──────┬──────┘                      │                      └──────┬──────┘  │
    │         │ CDC                         │                             │         │
    │         │ WebSocket                   │                             │ HTTP    │
    │         │ Hibernation                 │                             │         │
    │         ▼                             │                             ▼         │
    │  ┌─────────────┐                      │                      ┌─────────────┐  │
    │  │  Writer DO  │──────────────────────┼──────────────────────│  Cache API  │  │
    │  │  (Buffer)   │     Columnar         │    Zone Maps         │   (FREE)    │  │
    │  │  Compaction │     Blocks           │    Bloom Filters     │   Hot Data  │  │
    │  └─────────────┘                      │                      └─────────────┘  │
    │                                       │                                       │
    └───────────────────────────────────────┴───────────────────────────────────────┘

                              SNIPPET LAYER (Edge Constraints)
    ┌─────────────────────────────────────────────────────────────────────────────┐
    │   5ms CPU  │  32MB RAM  │  5 Subrequests  │  Scatter-Gather Patterns        │
    │  ┌─────────────────────────────────────────────────────────────────────┐    │
    │  │  snippets-chain: Map-Reduce orchestration                           │    │
    │  │  snippets-lance: Vector search with IVF-PQ/HNSW indices            │    │
    │  └─────────────────────────────────────────────────────────────────────┘    │
    └─────────────────────────────────────────────────────────────────────────────┘
```

## Package Responsibilities

| Package | Responsibility | Runtime |
|---------|----------------|---------|
| **@evodb/core** | Types, encoding, shredding, schema, WAL, block format | All |
| **@evodb/lakehouse** | Manifest management, snapshots, time-travel, R2 paths | Worker/DO |
| **@evodb/rpc** | DO-to-DO WebSocket RPC with hibernation for CDC | DO |
| **@evodb/writer** | CDC buffering, block writing, compaction | DO |
| **@evodb/reader** | Basic query execution with Cache API | Worker |
| **@evodb/query** | Advanced query planning with zone maps and bloom filters | Worker |
| **@evodb/edge-cache** | cdn.workers.do integration, prefetching | Worker |
| **@evodb/lance-reader** | Pure TS Lance format reader for vector search | Worker/Snippet |
| **@evodb/snippets-chain** | Scatter-gather patterns for snippet constraints | Snippet |
| **@evodb/snippets-lance** | Vector search optimized for snippets | Snippet |
| **@evodb/codegen** | CLI for schema pull/push/lock/diff | CLI |

## Package Dependency Graph

```
@evodb/core                          (no deps - foundation)
     │
     ├──► @evodb/lakehouse           (manifests, snapshots)
     │         │
     │         ├──► @evodb/reader    (basic queries + cache)
     │         │
     │         ├──► @evodb/query     (advanced queries)
     │         │
     │         └──► @evodb/writer ◄──┬── @evodb/rpc
     │                               │
     │                               └── (lakehouse for manifest updates)
     │
     ├──► @evodb/rpc                 (CDC transport)
     │
     ├──► @evodb/edge-cache          (cdn.workers.do)
     │
     ├──► @evodb/lance-reader        (vector indices)
     │
     ├──► @evodb/snippets-chain      (orchestration)
     │
     └──► @evodb/snippets-lance      (vector snippets)
```

## Data Flow

### Write Path

```
1. USER WRITE
   │
   ▼
2. Edge DO (SQLite)           Per-user/tenant database
   │                          Stores document as JSON
   │                          Generates WAL entry (LSN, op, data)
   │
   ▼ CDC via WebSocket (hibernation = 95% cost reduction)
   │
3. Writer DO (Buffer)         Aggregates CDC from many Edge DOs
   │                          Buffers in memory by table
   │                          Triggers flush on: size/time/count
   │
   ▼ Shred + Encode
   │
4. Columnar Block             JSON → Shredded columns
   │                          Columns → Run-length + Delta encoding
   │                          Zone maps (min/max per column)
   │
   ▼ Atomic write
   │
5. R2 Storage                 Block files (data/blocks/*.evodb)
   │                          Manifest update (manifest.json)
   │                          Snapshot for time-travel
   │
   ▼ Background
   │
6. Compaction                 Merge small blocks into larger ones
                              Tiered compaction strategy
```

### Read Path

```
1. QUERY REQUEST
   │
   ▼
2. Query Planner              Parse query
   │                          Load manifest from R2
   │                          Select partitions
   │
   ▼ Zone Map Pruning
   │
3. Partition Scanner          Skip blocks where min/max excludes filter
   │                          Bloom filter check for point lookups
   │
   ▼ Cache Check
   │
4. Cache API (FREE)           Check Workers Cache API
   │                          Return cached blocks if present
   │
   ▼ Cache Miss
   │
5. R2 Read                    Fetch block from R2
   │                          Decompress + decode columns
   │                          Populate cache
   │
   ▼ Filter + Project
   │
6. Result Processing          Apply remaining filters
   │                          Project requested columns
   │                          Sort/aggregate if needed
   │
   ▼
7. QUERY RESULT               Columnar → Row format
                              Return to client
```

## Key Design Decisions

### 1. Columnar JSON Shredding

**Decision**: Store JSON documents in columnar format using ClickHouse-style shredding.

**Tradeoff**: Write amplification vs read performance. Writes must shred documents into columns, but queries only read needed columns.

**Benefit**: Analytics queries scan 10-100x less data. Schema evolution handled at column level.

### 2. Dual Query Engines

**Decision**: Separate `@evodb/reader` (simple) and `@evodb/query` (advanced).

**Tradeoff**: Code duplication vs optimization opportunity.

**Benefit**: Reader is minimal for basic use. Query engine adds zone maps, bloom filters, streaming for power users.

### 3. WebSocket Hibernation for CDC

**Decision**: Use DO WebSocket hibernation (95% cost reduction) instead of HTTP polling.

**Tradeoff**: Complexity of WebSocket state management vs cost savings.

**Benefit**: Thousands of Edge DOs can stream CDC to Writer DO with minimal billing.

### 4. R2 + Cache API (Not D1)

**Decision**: Use R2 for storage with free Workers Cache API tier.

**Tradeoff**: No SQL push-down vs unlimited storage + free caching.

**Benefit**: R2 has no egress fees. Cache API is free and global. Perfect for read-heavy analytics.

### 5. Snippet-Optimized Packages

**Decision**: Dedicated packages for Cloudflare Snippet constraints (5ms CPU, 32MB RAM, 5 subrequests).

**Tradeoff**: Separate code paths vs unified codebase.

**Benefit**: Enables edge compute patterns impossible with standard Workers. Vector search in <5ms.

### 6. Iceberg-Inspired Manifests

**Decision**: JSON manifests with snapshots for time-travel instead of full Iceberg spec.

**Tradeoff**: Not Iceberg-compatible vs simplicity for edge constraints.

**Benefit**: Lightweight manifests fit in Snippets. Time-travel queries supported. No JVM dependency.

### 7. Lance Format for Vectors

**Decision**: Pure TypeScript Lance reader instead of WASM/native bindings.

**Tradeoff**: Performance ceiling vs portability and bundle size (<50KB).

**Benefit**: Works in Snippets, Durable Objects, and Workers without WASM complexity.

## Edge Constraints Reference

| Environment | CPU | Memory | Subrequests | Use Case |
|-------------|-----|--------|-------------|----------|
| Workers | 50ms | 128MB | 1000 | Query execution, API endpoints |
| Durable Objects | 30s/req | 128MB | Unlimited | CDC aggregation, state management |
| Snippets | 5ms | 32MB | 5 | Hot path routing, vector search |

## File Organization

```
evodb/
├── core/              # Foundation: types, encoding, shredding
├── lakehouse/         # Manifest, snapshots, R2 paths
├── rpc/               # WebSocket CDC transport
├── writer/            # CDC buffer, block writing, compaction
├── reader/            # Basic query engine + Cache API
├── query/             # Advanced query planning
├── edge-cache/        # cdn.workers.do integration
├── lance-reader/      # Vector index reader
├── snippets-chain/    # Scatter-gather orchestration
├── snippets-lance/    # Vector search for snippets
├── codegen/           # Schema CLI
├── benchmark/         # Performance testing
├── e2e/               # End-to-end tests
└── test-utils/        # Shared test utilities
```
