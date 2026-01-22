[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / CacheEntry

# Interface: CacheEntry

Defined in: [query/src/types.ts:1215](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1215)

Cache entry metadata.

Represents a single cached partition with access tracking
for LRU eviction decisions.

## Properties

### key

> **key**: `string`

Defined in: [query/src/types.ts:1217](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1217)

Cache key

***

### path

> **path**: `string`

Defined in: [query/src/types.ts:1220](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1220)

Partition path

***

### sizeBytes

> **sizeBytes**: `number`

Defined in: [query/src/types.ts:1223](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1223)

Entry size in bytes

***

### cachedAt

> **cachedAt**: `number`

Defined in: [query/src/types.ts:1226](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1226)

When cached

***

### lastAccessedAt

> **lastAccessedAt**: `number`

Defined in: [query/src/types.ts:1229](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1229)

Last accessed

***

### accessCount

> **accessCount**: `number`

Defined in: [query/src/types.ts:1232](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1232)

Access count

***

### ttlSeconds

> **ttlSeconds**: `number`

Defined in: [query/src/types.ts:1235](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1235)

TTL in seconds
