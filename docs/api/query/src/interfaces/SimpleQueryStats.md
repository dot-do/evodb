[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SimpleQueryStats

# Interface: SimpleQueryStats

Defined in: [query/src/simple-engine.ts:160](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L160)

Simple query execution statistics

## Properties

### executionTimeMs

> **executionTimeMs**: `number`

Defined in: [query/src/simple-engine.ts:162](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L162)

Total execution time in milliseconds

***

### blocksScanned

> **blocksScanned**: `number`

Defined in: [query/src/simple-engine.ts:164](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L164)

Blocks scanned

***

### blocksSkipped

> **blocksSkipped**: `number`

Defined in: [query/src/simple-engine.ts:166](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L166)

Blocks skipped via pruning

***

### rowsScanned

> **rowsScanned**: `number`

Defined in: [query/src/simple-engine.ts:168](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L168)

Rows scanned

***

### rowsReturned

> **rowsReturned**: `number`

Defined in: [query/src/simple-engine.ts:170](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L170)

Rows returned

***

### bytesFromR2

> **bytesFromR2**: `number`

Defined in: [query/src/simple-engine.ts:172](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L172)

Bytes read from R2

***

### bytesFromCache

> **bytesFromCache**: `number`

Defined in: [query/src/simple-engine.ts:174](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L174)

Bytes served from cache

***

### cacheHitRatio

> **cacheHitRatio**: `number`

Defined in: [query/src/simple-engine.ts:176](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L176)

Cache hit ratio
