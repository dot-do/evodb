[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ExecutorStats

# Interface: ExecutorStats

Defined in: [core/src/query-executor.ts:155](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L155)

Query execution statistics

## Indexable

\[`key`: `string`\]: `unknown`

Additional implementation-specific stats

## Properties

### executionTimeMs

> **executionTimeMs**: `number`

Defined in: [core/src/query-executor.ts:157](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L157)

Total execution time in milliseconds

***

### rowsScanned?

> `optional` **rowsScanned**: `number`

Defined in: [core/src/query-executor.ts:160](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L160)

Rows scanned

***

### rowsReturned?

> `optional` **rowsReturned**: `number`

Defined in: [core/src/query-executor.ts:163](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L163)

Rows returned

***

### bytesRead?

> `optional` **bytesRead**: `number`

Defined in: [core/src/query-executor.ts:166](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L166)

Bytes read

***

### cacheHitRatio?

> `optional` **cacheHitRatio**: `number`

Defined in: [core/src/query-executor.ts:169](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L169)

Cache hit ratio (0-1)
