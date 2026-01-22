[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / EngineQueryStats

# Interface: EngineQueryStats

Defined in: [query/src/types.ts:1070](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1070)

Query execution statistics (engine-specific format).

Detailed metrics about query execution for monitoring,
debugging, and performance optimization.

Note: For cross-package compatibility, use `ExecutorStats` from `@evodb/core`
which provides a unified interface. This type is internal to `@evodb/query`.

## Example

```typescript
const stats: EngineQueryStats = result.stats;

// Execution timing
console.log(`Total: ${stats.executionTimeMs}ms`);
console.log(`Planning: ${stats.planningTimeMs}ms`);
console.log(`I/O: ${stats.ioTimeMs}ms`);

// Data processed
console.log(`Scanned: ${stats.rowsScanned} rows, ${stats.bytesRead} bytes`);
console.log(`Matched: ${stats.rowsMatched} rows`);

// Optimization effectiveness
console.log(`Partitions: ${stats.partitionsScanned} scanned, ${stats.partitionsPruned} pruned`);
console.log(`Zone map effectiveness: ${(stats.zoneMapEffectiveness * 100).toFixed(1)}%`);
console.log(`Cache hit ratio: ${(stats.cacheHitRatio * 100).toFixed(1)}%`);

// Block-level pruning metrics
console.log(`Blocks: ${stats.blocksScanned} scanned, ${stats.blocksPruned} pruned`);
console.log(`Block prune ratio: ${(stats.blockPruneRatio * 100).toFixed(1)}%`);
```

## Properties

### executionTimeMs

> **executionTimeMs**: `number`

Defined in: [query/src/types.ts:1072](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1072)

Total execution time in milliseconds

***

### planningTimeMs

> **planningTimeMs**: `number`

Defined in: [query/src/types.ts:1075](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1075)

Planning time in milliseconds

***

### ioTimeMs

> **ioTimeMs**: `number`

Defined in: [query/src/types.ts:1078](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1078)

I/O time in milliseconds

***

### partitionsScanned

> **partitionsScanned**: `number`

Defined in: [query/src/types.ts:1081](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1081)

Partitions scanned

***

### partitionsPruned

> **partitionsPruned**: `number`

Defined in: [query/src/types.ts:1084](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1084)

Partitions pruned

***

### rowsScanned

> **rowsScanned**: `number`

Defined in: [query/src/types.ts:1087](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1087)

Rows scanned

***

### rowsMatched

> **rowsMatched**: `number`

Defined in: [query/src/types.ts:1090](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1090)

Rows matched (after predicates)

***

### bytesRead

> **bytesRead**: `number`

Defined in: [query/src/types.ts:1093](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1093)

Bytes read from R2

***

### bytesFromCache

> **bytesFromCache**: `number`

Defined in: [query/src/types.ts:1096](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1096)

Bytes served from cache

***

### cacheHitRatio

> **cacheHitRatio**: `number`

Defined in: [query/src/types.ts:1099](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1099)

Cache hit ratio

***

### zoneMapEffectiveness

> **zoneMapEffectiveness**: `number`

Defined in: [query/src/types.ts:1102](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1102)

Zone map pruning effectiveness

***

### bloomFilterChecks

> **bloomFilterChecks**: `number`

Defined in: [query/src/types.ts:1105](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1105)

Bloom filter checks

***

### bloomFilterHits

> **bloomFilterHits**: `number`

Defined in: [query/src/types.ts:1108](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1108)

Bloom filter true positives

***

### peakMemoryBytes

> **peakMemoryBytes**: `number`

Defined in: [query/src/types.ts:1111](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1111)

Peak memory usage in bytes

***

### totalBlocks

> **totalBlocks**: `number`

Defined in: [query/src/types.ts:1114](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1114)

Total number of blocks (partitions) in the table

***

### blocksScanned

> **blocksScanned**: `number`

Defined in: [query/src/types.ts:1117](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1117)

Number of blocks scanned after zone map pruning

***

### blocksPruned

> **blocksPruned**: `number`

Defined in: [query/src/types.ts:1120](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1120)

Number of blocks pruned due to zone map filtering

***

### blockPruneRatio

> **blockPruneRatio**: `number`

Defined in: [query/src/types.ts:1123](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1123)

Ratio of blocks pruned to total blocks (0.0 to 1.0)

***

### subrequestCount?

> `optional` **subrequestCount**: `number`

Defined in: [query/src/types.ts:1126](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1126)

Number of subrequests used during query execution
