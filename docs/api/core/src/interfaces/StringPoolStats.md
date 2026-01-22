[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / StringPoolStats

# Interface: StringPoolStats

Defined in: [core/src/string-intern-pool.ts:42](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L42)

Statistics for string interning performance monitoring

## Properties

### hits

> **hits**: `number`

Defined in: [core/src/string-intern-pool.ts:44](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L44)

Number of cache hits

***

### misses

> **misses**: `number`

Defined in: [core/src/string-intern-pool.ts:46](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L46)

Number of cache misses

***

### evictions

> **evictions**: `number`

Defined in: [core/src/string-intern-pool.ts:48](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L48)

Number of entries evicted

***

### size

> **size**: `number`

Defined in: [core/src/string-intern-pool.ts:50](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L50)

Current pool size

***

### maxSize

> **maxSize**: `number`

Defined in: [core/src/string-intern-pool.ts:52](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L52)

Maximum pool size

***

### hitRate

> **hitRate**: `number`

Defined in: [core/src/string-intern-pool.ts:54](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L54)

Hit rate (0-1)

***

### memoryBytes

> **memoryBytes**: `number`

Defined in: [core/src/string-intern-pool.ts:56](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L56)

Estimated memory usage in bytes

***

### maxStringLength?

> `optional` **maxStringLength**: `number`

Defined in: [core/src/string-intern-pool.ts:58](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L58)

Maximum string length allowed (undefined if not set)
