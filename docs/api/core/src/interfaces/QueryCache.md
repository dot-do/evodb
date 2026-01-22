[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / QueryCache

# Interface: QueryCache

Defined in: core/src/query-cache.ts:72

Query cache interface for caching query results

## Methods

### get()

> **get**\<`T`\>(`key`): `T`

Defined in: core/src/query-cache.ts:81

Get a cached value by key.
Returns undefined if key doesn't exist or has expired.

#### Type Parameters

##### T

`T`

Expected type of the cached value

#### Parameters

##### key

`string`

Cache key to lookup

#### Returns

`T`

Cached value or undefined if not found/expired

***

### set()

> **set**\<`T`\>(`key`, `value`, `options?`): `void`

Defined in: core/src/query-cache.ts:92

Set a value in the cache.
If the key already exists, it will be updated.

#### Type Parameters

##### T

`T`

Type of the value to cache

#### Parameters

##### key

`string`

Cache key

##### value

`T`

Value to cache

##### options?

[`QueryCacheOptions`](QueryCacheOptions.md)

Per-entry options (TTL, invalidation patterns)

#### Returns

`void`

***

### invalidate()

> **invalidate**(`pattern`): `void`

Defined in: core/src/query-cache.ts:107

Invalidate cache entries matching a pattern.
Supports glob-style patterns with * as wildcard.

#### Parameters

##### pattern

`string`

Pattern to match keys against (e.g., 'users:*')

#### Returns

`void`

#### Example

```typescript
cache.invalidate('users:1');     // Exact match
cache.invalidate('users:*');     // All user entries
cache.invalidate('*');           // All entries
```

***

### clear()

> **clear**(): `void`

Defined in: core/src/query-cache.ts:112

Clear all entries from the cache.

#### Returns

`void`
