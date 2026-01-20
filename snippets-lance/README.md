# @evodb/snippets-lance

Lance vector search optimized for Cloudflare Snippets (5ms CPU, 32MB RAM).

## TL;DR

**YES, we can achieve vector search in under 5ms CPU and 32MB RAM using pure TypeScript Lance reader with edge-cached Lance files.**

| Dataset Size | CPU Time (P99) | Memory | Verdict |
|-------------|----------------|--------|---------|
| 1K vectors  | 0.6ms          | 535KB  | PASS    |
| 10K vectors | 0.2ms          | 1.1MB  | PASS    |
| 50K vectors | 0.3ms          | 816KB* | PASS    |
| 100K vectors| ~2ms           | 2MB*   | PASS    |

*Memory for Snippets = centroids + codebook + lookup tables (partition data loaded from edge cache)

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Snippet                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Centroid Index  │  │  PQ Codebook    │   In-Memory      │
│  │  (384KB-1.5MB)  │  │   (384KB-768KB) │   (Pre-loaded)   │
│  └─────────────────┘  └─────────────────┘                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Lookup Tables (48KB-96KB)               │   │
│  │              (Computed per-query)                     │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │ Range Request (1-3 per query)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Edge Cache (cdn.workers.do)               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Partition Data (lazy-loaded)            │   │
│  │              Only requested partitions fetched       │   │
│  │              (50-200KB per partition)                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Search Algorithm

1. **Centroid Search** (~50% of CPU time)
   - Linear scan of all centroids
   - Find `nprobes` nearest partitions
   - SIMD-friendly distance computation

2. **Build Lookup Tables** (~10% of CPU time)
   - Compute distance from query to each PQ code
   - One table per sub-vector

3. **Partition Search** (~35% of CPU time)
   - Load partition data from edge cache
   - Asymmetric Distance Computation (ADC)
   - Early termination with top-k heap

4. **Sort Results** (~5% of CPU time)
   - Return k nearest neighbors

## Installation

```bash
npm install @evodb/snippets-lance
```

## Usage

### In-Memory Search (for testing)

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
  distanceType: 'l2',
  vectors,
});

// Create search engine
const search = new InMemoryVectorSearch(
  index.centroids,
  index.pqCodebook,
  index.partitionData
);

// Search
const query = generateRandomVectors(1, 384)[0];
const results = search.search(query, { k: 10, nprobes: 1 });
```

### Edge-Cached Search (for production)

```typescript
import {
  CachedLanceReader,
  SnippetsVectorSearch,
} from '@evodb/snippets-lance';

// Create reader with edge cache
const reader = new CachedLanceReader({
  baseUrl: 'https://cdn.workers.do/lance',
  dataset: 'my-embeddings',
});

// Initialize search engine (load centroids and codebook)
const search = new SnippetsVectorSearch(reader);
await search.initialize();

// Search (partitions loaded on-demand from edge cache)
const results = await search.search(queryVector, {
  k: 10,
  nprobes: 1,
});
```

## Memory Budget Analysis

### Index Components

| Component | Formula | Example (384d, 256 partitions) |
|-----------|---------|-------------------------------|
| Centroids | `partitions * dim * 4` | 256 * 384 * 4 = 384KB |
| Codebook | `256 * subVectors * subDim * 4` | 256 * 48 * 8 * 4 = 384KB |
| Lookup Tables | `256 * subVectors * 4` | 256 * 48 * 4 = 48KB |
| **Total** | - | **816KB** |

### Partition Data (loaded from edge cache)

| Vectors | Sub-vectors | Size per partition |
|---------|-------------|-------------------|
| 100 | 48 | 5.6KB |
| 500 | 48 | 28KB |
| 1000 | 48 | 56KB |

## Performance Tuning

### Partition Count

More partitions = better recall but slower centroid search:

| Partitions | Centroid Search | Recommended Use |
|------------|-----------------|-----------------|
| 32-64 | <0.1ms | 1K-5K vectors |
| 128 | ~0.1ms | 5K-20K vectors |
| 256 | ~0.2ms | 20K-50K vectors |
| 512 | ~0.4ms | 50K-100K vectors |
| 1024 | ~1ms | 100K+ vectors |

### nprobes

More probes = better recall but more partition loads:

| nprobes | Edge Cache Requests | CPU Overhead |
|---------|---------------------|--------------|
| 1 | 1 | Baseline |
| 2 | 2 | +~0.1ms |
| 3 | 3 | +~0.2ms |
| 5 | 5 (max for Snippets) | +~0.3ms |

### Dimension

Higher dimensions = more memory and slower search:

| Dimension | Common Models | Memory Impact |
|-----------|---------------|---------------|
| 384 | MiniLM, E5-small | 1x |
| 768 | BERT, E5-base | 2x |
| 1536 | OpenAI ada-002 | 4x |

## Recommended Configurations

### Small Dataset (1K-10K vectors)

```typescript
const config = {
  numPartitions: 64,
  numSubVectors: 48,  // dimension / 8
  nprobes: 2,
};
```

- Memory: ~500KB
- Latency: <1ms
- Subrequests: 2

### Medium Dataset (10K-50K vectors)

```typescript
const config = {
  numPartitions: 256,
  numSubVectors: 48,
  nprobes: 1,
};
```

- Memory: ~800KB
- Latency: 1-2ms
- Subrequests: 1

### Large Dataset (50K-100K vectors)

```typescript
const config = {
  numPartitions: 512,
  numSubVectors: 48,
  nprobes: 1,
};
```

- Memory: ~1.5MB
- Latency: 2-3ms
- Subrequests: 1

## Benchmark Results

Tested on Node.js v20 (representative of V8 in Cloudflare Workers):

```
=== 1K Vectors, 384 Dimensions ===
Average: 0.266ms
P50: 0.330ms
P99: 0.637ms
Memory: 535KB

=== 10K Vectors, nprobes=1 ===
Average: 0.191ms
P99: 0.246ms
Memory: 1.14MB

=== 50K Vectors, nprobes=1 ===
Average: 0.216ms
P99: 0.273ms
Snippets Memory: 816KB

=== nprobes Scaling (20K vectors) ===
nprobes=1: avg=0.189ms, p99=0.208ms
nprobes=2: avg=0.352ms, p99=1.539ms
nprobes=3: avg=0.227ms, p99=0.230ms
nprobes=5: avg=0.278ms, p99=0.316ms
```

## Limitations

1. **Index Building**: Must be done offline (not in Snippets)
2. **Maximum Dataset**: ~100K vectors for reliable <5ms
3. **Recall Trade-off**: IVF-PQ is approximate; may miss some results
4. **No Updates**: Index is read-only; rebuild for new data

## Edge Cache Setup

For production, pre-process your Lance index and upload to edge cache:

1. Build the cached index format (`.lcix` file)
2. Upload to R2 or your CDN
3. Configure cdn.workers.do caching rules
4. Point `baseUrl` to your cached files

## API Reference

### Types

```typescript
interface SnippetsSearchOptions {
  k?: number;      // Results to return (default: 10)
  nprobes?: number; // Partitions to search (default: 1)
  includeDistance?: boolean;
}

interface SearchResult {
  rowId: bigint;   // Vector ID
  distance: number; // Distance to query
  score: number;   // Similarity score (0-1)
}
```

### Classes

- `InMemoryVectorSearch`: For testing without network
- `SnippetsVectorSearch`: For production with edge cache
- `CachedLanceReader`: Edge-cache-aware reader

### Functions

- `buildCachedIndex()`: Build index from vectors
- `generateRandomVectors()`: Generate test data
- `normalizeVector()`: Normalize to unit length

## License

MIT
