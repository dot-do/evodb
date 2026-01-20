# @evodb/lance-reader

Pure TypeScript Lance format reader for vector search in Cloudflare Workers.

## Installation

```bash
npm install @evodb/lance-reader
```

## Overview

This package provides a zero-dependency Lance format reader:

- **Pure TypeScript**: No native dependencies, ~50KB bundle
- **Vector Indices**: IVF-PQ and HNSW support
- **Storage Adapters**: R2, Fetch, Memory, and Caching
- **Protobuf Parsing**: Read Lance manifests and metadata
- **Arrow IPC**: Parse Arrow record batches

## Quick Start

```typescript
import { LanceReader, R2StorageAdapter } from '@evodb/lance-reader';

// Create reader with R2 storage
const reader = new LanceReader({
  storage: new R2StorageAdapter(env.MY_BUCKET),
  basePath: 'datasets/embeddings',
});

await reader.open();

// Vector search
const results = await reader.search('embedding', queryVector, {
  k: 10,
  nprobes: 20,
});

for (const result of results) {
  console.log(`Row ${result.rowId}: distance=${result.distance}`);
}
```

## API Reference

### LanceReader

```typescript
const reader = new LanceReader(config);

await reader.open()                    // Load manifest
await reader.search(column, vector, opts) // Vector search
await reader.getSchema()               // Get schema
await reader.getRowCount()             // Get total rows
await reader.close()                   // Clean up
```

### Vector Search Options

```typescript
interface VectorSearchOptions {
  k?: number;           // Number of results (default: 10)
  nprobes?: number;     // Partitions to search (default: 20)
  refineK?: number;     // Candidates for re-ranking
  filter?: RowFilter;   // Pre-filter rows
  distanceType?: DistanceType; // 'l2' | 'cosine' | 'dot'
}

interface SearchResult {
  rowId: bigint;
  distance: number;
  score: number;
}
```

### Storage Adapters

```typescript
// R2 Storage
const r2 = new R2StorageAdapter(bucket);

// HTTP Fetch
const fetch = new FetchStorageAdapter('https://cdn.example.com/data');

// In-Memory (for testing)
const memory = new MemoryStorageAdapter();
memory.set('file.lance', buffer);

// Caching wrapper
const cached = new CachingStorageAdapter(r2, {
  maxSize: 100_000_000, // 100MB cache
});
```

### Vector Indices

```typescript
// IVF-PQ Index
const ivfpq = new IvfPqIndex(config);
await ivfpq.load(storage, path);
const results = await ivfpq.search(queryVector, { k: 10 });

// Build index from vectors
const index = await buildIvfPqIndex(vectors, {
  numPartitions: 256,
  numSubVectors: 48,
  distanceType: 'l2',
});

// HNSW Index
const hnsw = new HnswIndex(config);
await hnsw.load(storage, path);
const results = await hnsw.search(queryVector, { k: 10 });
```

### Distance Functions

```typescript
import {
  computeL2Distance,
  computeCosineSimilarity,
  computeDotProduct,
  normalizeVector,
} from '@evodb/lance-reader';

// L2 (Euclidean) distance
const l2 = computeL2Distance(vec1, vec2);

// Cosine similarity
const cosine = computeCosineSimilarity(vec1, vec2);

// Dot product
const dot = computeDotProduct(vec1, vec2);

// Normalize to unit length
const normalized = normalizeVector(vec);
```

### Protobuf Parser

```typescript
import {
  parseManifest,
  parseIvf,
  parsePqCodebook,
} from '@evodb/lance-reader';

// Parse Lance manifest
const manifest = parseManifest(buffer);

// Parse IVF structure
const ivf = parseIvf(buffer);

// Parse PQ codebook
const codebook = parsePqCodebook(buffer);
```

### Arrow IPC Reader

```typescript
import { ArrowIpcReader, readPartitionData } from '@evodb/lance-reader';

// Read Arrow IPC file
const reader = new ArrowIpcReader(buffer);
const schema = reader.getSchema();
const batches = reader.getRecordBatches();

// Read partition data for vector index
const data = await readPartitionData(storage, path, partitionId);
```

### Types

```typescript
// Lance Format
type LanceManifest     // Dataset manifest
type LanceFragment     // Data fragment
type LanceDataFile     // Data file reference
type LanceField        // Schema field
type LanceIndexMetadata // Index metadata

// Vector Index
type IvfStructure      // IVF centroids
type PqCodebook        // Product quantization codebook
type HnswParams        // HNSW parameters
type DistanceType      // 'l2' | 'cosine' | 'dot'
```

## Performance

Optimized for Cloudflare Workers:

| Dataset | Search Time | Memory |
|---------|-------------|--------|
| 10K vectors | <1ms | ~1MB |
| 100K vectors | ~2ms | ~2MB |
| 1M vectors | ~10ms | ~10MB |

## Related Packages

- `@evodb/snippets-lance` - Snippets-optimized vector search
- `@evodb/core` - Columnar encoding primitives
- `@evodb/edge-cache` - Edge caching integration

## License

MIT
