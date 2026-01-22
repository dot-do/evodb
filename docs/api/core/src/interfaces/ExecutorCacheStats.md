[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ExecutorCacheStats

# Interface: ExecutorCacheStats

Defined in: [core/src/query-executor.ts:350](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L350)

Cache statistics

## Properties

### hits

> **hits**: `number`

Defined in: [core/src/query-executor.ts:352](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L352)

Cache hits

***

### misses

> **misses**: `number`

Defined in: [core/src/query-executor.ts:355](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L355)

Cache misses

***

### bytesFromCache

> **bytesFromCache**: `number`

Defined in: [core/src/query-executor.ts:358](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L358)

Bytes served from cache

***

### bytesFromStorage

> **bytesFromStorage**: `number`

Defined in: [core/src/query-executor.ts:361](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L361)

Bytes read from storage

***

### hitRatio

> **hitRatio**: `number`

Defined in: [core/src/query-executor.ts:364](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L364)

Cache hit ratio (0-1)
