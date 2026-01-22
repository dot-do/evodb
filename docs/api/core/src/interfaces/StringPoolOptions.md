[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / StringPoolOptions

# Interface: StringPoolOptions

Defined in: [core/src/string-intern-pool.ts:30](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L30)

Configuration options for memory leak prevention

## Properties

### maxStringLength?

> `optional` **maxStringLength**: `number`

Defined in: [core/src/string-intern-pool.ts:32](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L32)

Maximum string length to intern. Longer strings are returned but not cached.

***

### maxMemoryBytes?

> `optional` **maxMemoryBytes**: `number`

Defined in: [core/src/string-intern-pool.ts:34](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L34)

Maximum memory usage in bytes. Entries are evicted when exceeded.

***

### ttlMs?

> `optional` **ttlMs**: `number`

Defined in: [core/src/string-intern-pool.ts:36](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L36)

Time-to-live in milliseconds. Entries older than this are eligible for pruning.
