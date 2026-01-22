[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / QueryCacheOptions

# Interface: QueryCacheOptions

Defined in: core/src/query-cache.ts:33

Configuration options for the query cache

## Properties

### ttl?

> `optional` **ttl**: `number`

Defined in: core/src/query-cache.ts:39

Default time-to-live in milliseconds for cached entries.
Set to 0 for no expiration.

#### Default

```ts
0 (no expiration)
```

***

### maxSize?

> `optional` **maxSize**: `number`

Defined in: core/src/query-cache.ts:47

Maximum number of entries to keep in cache.
When exceeded, least recently used entries are evicted.
Set to 0 for unlimited entries.

#### Default

```ts
0 (unlimited)
```

***

### invalidateOn?

> `optional` **invalidateOn**: `string`[]

Defined in: core/src/query-cache.ts:54

Patterns that should trigger invalidation of this entry.
Supports glob-style patterns with * wildcard.

#### Example

```ts
['users:*', 'auth:*']
```
