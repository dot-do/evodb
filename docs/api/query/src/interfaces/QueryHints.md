[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / QueryHints

# Interface: QueryHints

Defined in: [query/src/types.ts:482](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L482)

Query execution hints.

Optional directives that influence query execution behavior without
changing query semantics. Use hints to tune performance, enforce
resource limits, or disable optimizations for debugging/benchmarking.

## Example

```typescript
// Performance-tuned hints
const performanceHints: QueryHints = {
  preferCache: true,
  maxParallelism: 8,
  timeoutMs: 30000
};

// Benchmarking hints (disable all optimizations)
const benchmarkHints: QueryHints = {
  forceScan: true,
  skipZoneMapPruning: true,
  skipBloomFilters: true,
  preferCache: false
};

// Resource-constrained hints
const constrainedHints: QueryHints = {
  maxParallelism: 2,
  memoryLimitBytes: 64 * 1024 * 1024, // 64MB
  timeoutMs: 5000
};
```

## Properties

### preferCache?

> `optional` **preferCache**: `boolean`

Defined in: [query/src/types.ts:484](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L484)

Prefer cached partitions

***

### maxParallelism?

> `optional` **maxParallelism**: `number`

Defined in: [query/src/types.ts:487](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L487)

Maximum partitions to read in parallel

***

### skipZoneMapPruning?

> `optional` **skipZoneMapPruning**: `boolean`

Defined in: [query/src/types.ts:490](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L490)

Skip zone map optimization

***

### skipBloomFilters?

> `optional` **skipBloomFilters**: `boolean`

Defined in: [query/src/types.ts:493](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L493)

Skip bloom filter checks

***

### forceScan?

> `optional` **forceScan**: `boolean`

Defined in: [query/src/types.ts:496](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L496)

Force full scan (for benchmarking)

***

### timeoutMs?

> `optional` **timeoutMs**: `number`

Defined in: [query/src/types.ts:499](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L499)

Timeout in milliseconds

***

### memoryLimitBytes?

> `optional` **memoryLimitBytes**: `number`

Defined in: [query/src/types.ts:502](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L502)

Memory limit in bytes
