[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ExecutorStats

# Interface: ExecutorStats

Defined in: core/dist/query-executor.d.ts:94

Query execution statistics

## Indexable

\[`key`: `string`\]: `unknown`

Additional implementation-specific stats

## Properties

### executionTimeMs

> **executionTimeMs**: `number`

Defined in: core/dist/query-executor.d.ts:96

Total execution time in milliseconds

***

### rowsScanned?

> `optional` **rowsScanned**: `number`

Defined in: core/dist/query-executor.d.ts:98

Rows scanned

***

### rowsReturned?

> `optional` **rowsReturned**: `number`

Defined in: core/dist/query-executor.d.ts:100

Rows returned

***

### bytesRead?

> `optional` **bytesRead**: `number`

Defined in: core/dist/query-executor.d.ts:102

Bytes read

***

### cacheHitRatio?

> `optional` **cacheHitRatio**: `number`

Defined in: core/dist/query-executor.d.ts:104

Cache hit ratio (0-1)
