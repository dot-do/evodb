# @evodb/snippets-lance

**Vector Search in 5ms**

Yes, we can do semantic search within Cloudflare Snippets' brutal constraints. IVF-PQ vector search, edge-cached indices, under 5ms CPU and 32MB RAM.

## The Proof

| Dataset | CPU Time (P99) | Memory | Verdict |
|---------|----------------|--------|---------|
| 1K vectors | 0.6ms | 535KB | PASS |
| 10K vectors | 0.2ms | 1.1MB | PASS |
| 50K vectors | 0.3ms | 816KB | PASS |
| 100K vectors | ~2ms | 2MB | PASS |

**It works.** Vector search in Snippets isn't just possible - it's fast.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Snippet                            │
│                    (5ms CPU, 32MB RAM, 5 subrequests)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   IN MEMORY (pre-loaded):                                       │
│   ┌─────────────────┐  ┌─────────────────┐                     │
│   │ Centroid Index  │  │  PQ Codebook    │                     │
│   │  (384KB-1.5MB)  │  │   (384KB-768KB) │                     │
│   └─────────────────┘  └─────────────────┘                     │
│                                                                  │
│   COMPUTED PER-QUERY:                                           │
│   ┌─────────────────────────────────────────────────────┐      │
│   │              Lookup Tables (48KB-96KB)               │      │
│   └─────────────────────────────────────────────────────┘      │
│                                                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Range request (1-3 per query)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Edge Cache (cdn.workers.do)                    │
├─────────────────────────────────────────────────────────────────┤
│   ┌─────────────────────────────────────────────────────┐      │
│   │              Partition Data (lazy-loaded)            │      │
│   │              50-200KB per partition                  │      │
│   │              Only requested partitions fetched       │      │
│   └─────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

**The trick**: Keep the small stuff in memory (centroids, codebook). Load the big stuff (partition data) from edge cache only when needed.

## Installation

```bash
npm install @evodb/snippets-lance
```

## Quick Start

### Production (Edge Cache)

```typescript
import { CachedLanceReader, SnippetsVectorSearch } from '@evodb/snippets-lance';

// Create reader with edge cache
const reader = new CachedLanceReader({
  baseUrl: 'https://cdn.workers.do/lance',
  dataset: 'product-embeddings',
});

// Initialize (loads centroids + codebook to memory)
const search = new SnippetsVectorSearch(reader);
await search.initialize();  // ~200KB loaded

// Search (loads 1-3 partitions from edge cache)
const results = await search.search(queryVector, {
  k: 10,       // Top 10 results
  nprobes: 1,  // Search 1 partition (fastest)
});

// Results:
// [
//   { rowId: 42n, distance: 0.15, score: 0.85 },
//   { rowId: 17n, distance: 0.23, score: 0.77 },
//   ...
// ]
```

### Testing (In-Memory)

```typescript
import {
  InMemoryVectorSearch,
  buildCachedIndex,
  generateRandomVectors,
} from '@evodb/snippets-lance';

// Generate test data
const vectors = generateRandomVectors(10000, 384);

// Build index
const index = buildCachedIndex({
  numPartitions: 128,
  dimension: 384,
  numSubVectors: 48,
  vectors,
});

// Search
const search = new InMemoryVectorSearch(
  index.centroids,
  index.pqCodebook,
  index.partitionData
);

const results = search.search(queryVector, { k: 10, nprobes: 1 });
```

## Memory Budget

Everything fits in 32MB with room to spare:

| Component | Formula | 384d, 256 partitions |
|-----------|---------|---------------------|
| Centroids | `partitions * dim * 4` | 384KB |
| Codebook | `256 * subVectors * subDim * 4` | 384KB |
| Lookup Tables | `256 * subVectors * 4` | 48KB |
| **Total** | | **816KB** |

Partition data stays on edge cache until needed.

## Performance Tuning

### Partition Count

More partitions = better recall, slower centroid search:

| Partitions | Centroid Search | Best For |
|------------|-----------------|----------|
| 64 | <0.1ms | 1K-5K vectors |
| 128 | ~0.1ms | 5K-20K vectors |
| 256 | ~0.2ms | 20K-50K vectors |
| 512 | ~0.4ms | 50K-100K vectors |

### nprobes

More probes = better recall, more subrequests:

| nprobes | Subrequests | CPU Overhead |
|---------|-------------|--------------|
| 1 | 1 | Baseline |
| 2 | 2 | +0.1ms |
| 3 | 3 | +0.2ms |
| 5 | 5 (max) | +0.3ms |

**Tip**: For Snippets, start with `nprobes=1`. Recall is usually good enough.

### Recommended Configs

**Small (1K-10K vectors)**
```typescript
{ numPartitions: 64, numSubVectors: 48, nprobes: 2 }
// ~500KB memory, <1ms, 2 subrequests
```

**Medium (10K-50K vectors)**
```typescript
{ numPartitions: 256, numSubVectors: 48, nprobes: 1 }
// ~800KB memory, 1-2ms, 1 subrequest
```

**Large (50K-100K vectors)**
```typescript
{ numPartitions: 512, numSubVectors: 48, nprobes: 1 }
// ~1.5MB memory, 2-3ms, 1 subrequest
```

## Benchmark Results

Node.js v20 (V8 similar to Workers):

```
=== 10K Vectors, nprobes=1 ===
Average: 0.191ms
P99: 0.246ms
Memory: 1.14MB

=== 50K Vectors, nprobes=1 ===
Average: 0.216ms
P99: 0.273ms
Memory: 816KB (Snippets-safe)

=== nprobes Scaling (20K vectors) ===
nprobes=1: avg=0.189ms, p99=0.208ms
nprobes=2: avg=0.352ms, p99=1.539ms
nprobes=5: avg=0.278ms, p99=0.316ms
```

## Search Algorithm

1. **Centroid Search** (~50% CPU)
   - Linear scan of all centroids
   - Find `nprobes` nearest partitions

2. **Build Lookup Tables** (~10% CPU)
   - Precompute distances from query to PQ codes

3. **Partition Search** (~35% CPU)
   - Load partition data from edge cache
   - Asymmetric Distance Computation (ADC)
   - Top-k heap for results

4. **Sort Results** (~5% CPU)
   - Return k nearest neighbors

## API Reference

### Classes

```typescript
// Production - uses edge cache
const search = new SnippetsVectorSearch(reader);
await search.initialize();
const results = await search.search(vector, options);

// Testing - fully in-memory
const search = new InMemoryVectorSearch(centroids, codebook, partitions);
const results = search.search(vector, options);

// Edge-cache reader
const reader = new CachedLanceReader({ baseUrl, dataset });
```

### Types

```typescript
interface SnippetsSearchOptions {
  k?: number;           // Results to return (default: 10)
  nprobes?: number;     // Partitions to search (default: 1)
  includeDistance?: boolean;
}

interface SearchResult {
  rowId: bigint;        // Vector ID
  distance: number;     // Distance to query
  score: number;        // Similarity (0-1)
}
```

### Utilities

```typescript
buildCachedIndex(options)      // Build index from vectors
generateRandomVectors(n, dim)  // Generate test data
normalizeVector(vec)           // Normalize to unit length
```

## Limitations

1. **Index building** - Must be done offline (too expensive for Snippets)
2. **Max dataset** - ~100K vectors for reliable <5ms
3. **Approximate** - IVF-PQ may miss some results (tune nprobes for recall)
4. **Read-only** - Rebuild index for new vectors

## Related Packages

- [@evodb/lance-reader](../lance-reader) - Full Lance reader (not Snippets-optimized)
- [@evodb/snippets-chain](../snippets-chain) - Chain multiple Snippets
- [@evodb/edge-cache](../edge-cache) - Edge caching

## License

MIT - Copyright 2026 .do
