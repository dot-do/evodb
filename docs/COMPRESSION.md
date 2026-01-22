# Compression Strategies

This document describes the compression strategies available in EvoDB, when to use each strategy, and how to configure compression for optimal performance.

## Overview

EvoDB uses a columnar storage format that enables efficient compression by grouping values of the same type together. The encoder automatically selects the optimal compression strategy based on column statistics, but understanding these strategies helps you design schemas that compress well.

## Available Compression Strategies

EvoDB supports four primary encoding strategies, defined in `core/src/types.ts`:

```typescript
export const enum Encoding {
  Plain = 0,  // No compression
  RLE = 1,    // Run-Length Encoding
  Dict = 2,   // Dictionary encoding
  Delta = 3,  // Delta encoding
}
```

For the snippet-optimized format (used in Cloudflare Workers/Snippets), additional encodings are available:

```typescript
export const enum SnippetEncoding {
  Raw = 0,         // Zero-copy read
  Delta = 1,       // Delta encoding for sorted integers
  DeltaBitPack = 2, // Delta + BitPacking (no decompression needed)
  Dict = 3,        // Dictionary encoding with binary search
  RLE = 4,         // Run-length encoding
  Bitmap = 5,      // Boolean bitmap
}
```

---

### 1. Plain / Raw Encoding

**Description:** Values are stored as-is without compression. For numeric types, this enables zero-copy decoding where the data can be read directly as a typed array view.

**How it works:**
- Int32 values stored as 4 bytes each (little-endian)
- Float64 values stored as 8 bytes each (little-endian)
- Strings stored with 2-byte length prefix followed by UTF-8 bytes
- Binary data stored with 4-byte length prefix followed by raw bytes

**Best for:**
- Random numeric data (floats, random integers)
- High-cardinality strings with no patterns
- Data that needs ultra-fast read access

**Compression ratio:** 1x (no compression)

**Decode speed:** Fastest (zero-copy for aligned numeric data)

**Example data:**
```typescript
// Random floats - no compression pattern
[0.234, 0.891, 0.456, 0.123, 0.789]

// High-cardinality IDs
["uuid-a1b2c3", "uuid-d4e5f6", "uuid-g7h8i9"]
```

---

### 2. Run-Length Encoding (RLE)

**Description:** Consecutive runs of identical values are stored as (count, value) pairs. Extremely effective when data has many repeated consecutive values.

**How it works:**
```
Input:  [A, A, A, B, B, C, C, C, C, C]
Stored: [(3, A), (2, B), (5, C)]
```

Each run is stored as:
- 4 bytes: run count
- 1 byte: null flag
- N bytes: encoded value

**Best for:**
- Status columns (e.g., "active", "active", "active", "pending")
- Category columns with sorted data
- Time-series data where values remain constant for periods
- Any column where values tend to repeat consecutively

**Compression ratio:** 10-1000x for highly repetitive data, 1x or worse for random data

**Decode speed:** Fast (linear scan through runs)

**Selection criteria:** Used when `runs < values.length / 3`

**Example data:**
```typescript
// Status field - excellent for RLE
["active", "active", "active", "active", "pending", "pending"]

// Boolean flags with runs
[true, true, true, true, false, false, true, true]
```

---

### 3. Dictionary Encoding

**Description:** Unique values are stored in a dictionary, and each row stores an index into the dictionary instead of the full value. Effective for low-cardinality string columns.

**How it works:**
```
Input:  ["US", "UK", "US", "CA", "US", "UK"]
Dict:   {0: "US", 1: "UK", 2: "CA"}
Stored: [0, 1, 0, 2, 0, 1]
```

Storage format:
- 4 bytes: dictionary size
- For each entry: 2-byte length + UTF-8 bytes
- 2-byte index per row (0xFFFF = null)

**Best for:**
- Country codes, status values, category names
- Any string column with < 50% unique values
- Columns with maximum 65,535 unique values

**Compression ratio:** 5-20x for low-cardinality strings

**Decode speed:** Fast (dictionary lookup, optionally with binary search)

**Selection criteria:** Used when `distinctCount < values.length / 2` for string columns

**Example data:**
```typescript
// Country codes - 200 unique values, millions of rows
["US", "UK", "CA", "US", "DE", "FR", "US", "UK"]

// Status values
["pending", "approved", "rejected", "pending", "approved"]
```

---

### 4. Delta Encoding

**Description:** Instead of storing absolute values, stores the difference between consecutive values. Extremely effective for sorted or sequential data like timestamps and auto-increment IDs.

**How it works:**
```
Input:  [1000, 1001, 1003, 1006, 1010]
Deltas: [1000, 1, 2, 3, 4]
```

The first value is stored as-is, subsequent values as differences.

**Best for:**
- Timestamps (sorted by time)
- Auto-increment IDs
- Sequential version numbers
- Any monotonically increasing data

**Compression ratio:** 8-100x for sequential data

**Decode speed:** Fast (cumulative sum)

**Selection criteria:** Used when values are detected as sorted

**Example data:**
```typescript
// Timestamps (ms since epoch) - deltas are small
[1705776000000, 1705776001000, 1705776002000, 1705776003000]
// Deltas: [1705776000000, 1000, 1000, 1000]

// Auto-increment IDs
[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
// Deltas: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
```

---

### 5. Delta + BitPacking (Snippet Format)

**Description:** Combines delta encoding with bit-packing for maximum compression. The deltas are packed using the minimum number of bits needed to represent the maximum delta value.

**How it works:**
```
Input:   [100, 101, 103, 104, 108]
Deltas:  [100, 1, 2, 1, 4]
         Max delta = 4, needs 3 bits
BitPack: First value as int32, then deltas packed at 3 bits each
```

**Best for:**
- Sorted integer columns in snippet/worker environments
- Time-series data requiring maximum compression
- Sequential IDs with small gaps

**Compression ratio:** 10-100x for sorted integers

**Decode speed:** Fast (bit unpacking + cumulative sum)

---

### 6. Bitmap Encoding (Snippet Format)

**Description:** Boolean values are packed into bits, storing 8 values per byte.

**How it works:**
```
Input:  [true, false, true, true, false, false, true, false]
Stored: 0b01001101 (1 byte instead of 8)
```

**Best for:**
- Boolean columns
- Null bitmaps (used internally)

**Compression ratio:** 8x

**Decode speed:** Very fast (bit operations)

---

## When to Use Each Strategy

### Decision Matrix

| Data Pattern | Best Encoding | Compression | Speed |
|--------------|---------------|-------------|-------|
| Random integers | Plain | 1x | Fastest |
| Random floats | Plain | 1x | Fastest |
| Sorted integers | Delta | 8-100x | Fast |
| Sorted timestamps | Delta | 8-16x | Fast |
| Low-cardinality strings | Dictionary | 5-20x | Fast |
| High-cardinality strings | Plain | 1x | Fast |
| Repeated consecutive values | RLE | 10-1000x | Fast |
| Boolean values | Bitmap | 8x | Very Fast |

### By Column Type

| Column Type | Recommended | Notes |
|-------------|-------------|-------|
| `Int32` (sorted) | Delta | Automatically selected when sorted |
| `Int32` (random) | Plain | Zero-copy decode |
| `Int64` (timestamps) | Delta | Excellent for time-series |
| `Float64` | Plain | Floats rarely compress well |
| `String` (< 50% unique) | Dictionary | Automatic selection |
| `String` (> 50% unique) | Plain | Falls back automatically |
| `Bool` | Bitmap | 8x compression |
| `Binary` | Plain | Raw bytes |

---

## Trade-offs

### Compression Ratio vs Decode Speed

| Encoding | Compression | Decode Speed | Memory During Decode |
|----------|-------------|--------------|---------------------|
| Plain | 1x | Very Fast | Low (zero-copy possible) |
| RLE | Variable | Fast | Low |
| Dictionary | 5-20x | Fast | Medium (dictionary in memory) |
| Delta | 8-100x | Fast | Low |
| DeltaBitPack | 10-100x | Fast | Low |
| Bitmap | 8x | Very Fast | Very Low |

### Memory Considerations

**During Encoding:**
- Dictionary encoding requires keeping unique values in memory
- Maximum dictionary size: 65,535 entries
- RLE has minimal memory overhead

**During Decoding:**
- Plain/Raw: Zero-copy when data is aligned
- Dictionary: Requires loading dictionary into memory
- Delta: Streams through data with minimal memory
- All encodings: Result array requires `rowCount * valueSize` bytes

**Cloudflare Snippets (32MB limit):**
```typescript
// Use zero-copy decode for numeric columns
const values = zeroCopyDecodeInt32(data, count); // No allocation

// Use lazy bitmap unpacking for sparse access
const bitmap = unpackBitsLazy(bytes, count);
if (bitmap.get(42)) { /* ... */ } // O(1) access, no full array

// Use column projection to minimize memory
const { columns } = readSnippetChunk(chunk, {
  columns: ['id', 'timestamp'] // Only decode needed columns
});
```

---

## Configuration Examples

### Schema Design for Compression

Design your schema to take advantage of automatic encoding selection:

```typescript
// Good: Low-cardinality status column (will use Dictionary)
const statusColumn = {
  path: 'order.status',
  type: Type.String,
  // Values: 'pending', 'processing', 'shipped', 'delivered'
  // ~4 unique values = dictionary encoding (5-20x compression)
};

// Good: Sorted timestamp column (will use Delta)
const timestampColumn = {
  path: 'event.timestamp',
  type: Type.Int64,
  // Values are naturally sorted by time
  // Delta encoding: 8-16x compression
};

// Good: Auto-increment ID (will use Delta)
const idColumn = {
  path: 'record.id',
  type: Type.Int32,
  // Sequential IDs: 1, 2, 3, 4, ...
  // Delta encoding: up to 100x compression
};
```

### Manual Encoding (Advanced)

While EvoDB automatically selects encodings, you can use the encoding functions directly:

```typescript
import { encodeDict, encodeDelta } from '@evodb/core/encoding';

// Force dictionary encoding
const dictData = encodeDict(stringValues, nullBitmap);

// Force delta encoding (for pre-sorted data)
const deltaData = encodeDelta(sortedIntegers, Type.Int32);
```

### Snippet-Optimized Encoding

For Cloudflare Workers/Snippets with strict constraints:

```typescript
import {
  encodeSnippetColumn,
  writeSnippetChunk,
  readSnippetChunk
} from '@evodb/core/snippet';

// Encode with automatic selection + bloom filter
const column = encodeSnippetColumn(
  'user.name',
  Type.String,
  values,
  nulls,
  { buildBloom: true } // Optional bloom filter for fast lookups
);

// Write chunk
const chunk = writeSnippetChunk([column], rowCount, {
  schemaId: 1,
  minTimestamp: BigInt(Date.now()),
  maxTimestamp: BigInt(Date.now()),
});

// Read with projection and zone map filtering
const { header, columns } = readSnippetChunk(chunk, {
  columns: ['user.name', 'user.id'], // Only decode these columns
  skipByZoneMap: { min: 100, max: 200 }, // Skip chunks outside range
});
```

---

## Compression Benchmarks

### Expected Compression Ratios

Based on real-world testing with representative datasets:

| Data Type | Encoding | Input Size | Compressed | Ratio |
|-----------|----------|------------|------------|-------|
| Sequential integers (10K) | Delta | 40KB | 400B-4KB | 10-100x |
| Timestamps (10K) | Delta | 80KB | 5-10KB | 8-16x |
| Low-cardinality strings (10K, 100 unique) | Dictionary | 200KB | 10-40KB | 5-20x |
| Random floats (10K) | Plain | 80KB | 80KB | 1x |
| Booleans (10K) | Bitmap | 10KB | 1.25KB | 8x |
| Status codes (10K, 5 unique) | Dictionary | 80KB | 5KB | 16x |

### Throughput Benchmarks

| Operation | Data Size | Time | Throughput |
|-----------|-----------|------|------------|
| Encode (Dictionary) | 100K strings | <100ms | 1M+ values/s |
| Encode (Delta) | 100K integers | <50ms | 2M+ values/s |
| Decode (Zero-copy Int32) | 1M values | <0.01ms | 400+ GB/s |
| Decode (Zero-copy Float64) | 1M values | <0.01ms | 400+ GB/s |
| Decode (Delta+BitPack) | 1M integers | <50ms | 80+ MB/s |
| Decode (Dictionary) | 100K values | <30ms | 30+ MB/s |

### Memory Usage by Encoding

| Encoding | Encode Memory | Decode Memory | Notes |
|----------|---------------|---------------|-------|
| Plain | O(n) | O(1) | Zero-copy possible |
| RLE | O(runs) | O(n) | Minimal during encode |
| Dictionary | O(unique) | O(unique + n) | Dictionary held in memory |
| Delta | O(n) | O(n) | In-place possible |
| Bitmap | O(n/8) | O(n/8) | 8x smaller than boolean[] |

---

## Best Practices

### 1. Let the Encoder Choose

The automatic encoding selection is well-tuned. Trust it:

```typescript
// Good: Let encoder analyze and select
const encoded = encode(columns);

// Encoding selection happens automatically based on:
// - Column type
// - Cardinality (distinctCount / totalCount)
// - Data ordering (sorted vs random)
// - Run patterns (consecutive repeated values)
```

### 2. Design Schemas for Compression

Structure your data to enable compression:

```typescript
// Good: Use enums/codes instead of long strings
{ status: 'active' }     // Will use dictionary encoding

// Good: Store timestamps as integers
{ createdAt: 1705776000000 }  // Will use delta if sorted

// Good: Keep related data sorted when possible
// Sorting by timestamp enables delta encoding on timestamp column
```

### 3. Monitor Compression Ratios

Track compression effectiveness:

```typescript
const encoded = encode(columns);
const totalCompressed = encoded.reduce(
  (sum, col) => sum + col.data.length + col.nullBitmap.length,
  0
);
const totalRaw = /* original size calculation */;
const ratio = totalRaw / totalCompressed;

console.log(`Compression ratio: ${ratio.toFixed(1)}x`);
```

### 4. Use Zone Maps for Query Optimization

Zone maps track min/max per column, enabling chunk skipping:

```typescript
import { canSkipByZoneMap } from '@evodb/core/snippet';

// Skip chunks where data can't match filter
if (canSkipByZoneMap(chunkZoneMap, { min: 100, max: 200 })) {
  // No values in range [100, 200] - skip this chunk
  continue;
}
```

### 5. Use Bloom Filters for Point Lookups

For exact-match queries, bloom filters provide fast negative answers:

```typescript
import { BloomFilter } from '@evodb/core/snippet';

const bloom = new BloomFilter(10000, 0.01); // 1% false positive rate
values.forEach(v => bloom.add(v));

// Fast check - if false, definitely not in data
if (!bloom.mightContain(searchValue)) {
  // Skip this chunk entirely
  continue;
}
```

---

## Related Documentation

- [Performance Guide](./PERFORMANCE.md) - Query optimization and benchmarks
- [Architecture](../ARCHITECTURE.md) - System design overview
- [Snippet Format](./SNIPPETS.md) - Cloudflare Snippets integration
- [Core API](./api/core/src/README.md) - API reference
