[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / LRUStringPool

# Class: LRUStringPool

Defined in: [core/src/string-intern-pool.ts:113](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L113)

LRU (Least Recently Used) String Intern Pool

Intern strings to reduce memory by returning the same reference
for identical strings. Uses LRU eviction when the pool reaches
maximum capacity.

Implementation uses a doubly-linked list for O(1) LRU operations:
- New entries are added at the tail (most recent)
- Accessed entries are moved to tail via pointer updates (no Map operations)
- Eviction removes from head (least recent) in O(1)

Memory Leak Prevention Features:
- maxStringLength: Skip interning strings that are too long
- maxMemoryBytes: Evict entries when memory limit exceeded
- ttlMs: Expire entries after a time period

## Example

```typescript
const pool = new LRUStringPool(1000);
const s1 = pool.intern('hello');
const s2 = pool.intern('hello');
console.log(s1 === s2); // true - same reference

// With memory leak prevention
const safePool = new LRUStringPool(1000, {
  maxStringLength: 10000,
  maxMemoryBytes: 1_000_000,
  ttlMs: 60_000
});
```

## Constructors

### Constructor

> **new LRUStringPool**(`maxSize`, `options`): `LRUStringPool`

Defined in: [core/src/string-intern-pool.ts:142](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L142)

Create a new LRU string pool

#### Parameters

##### maxSize

`number` = `DEFAULT_STRING_POOL_SIZE`

Maximum number of strings to cache (default: DEFAULT_STRING_POOL_SIZE)

##### options

[`StringPoolOptions`](../interfaces/StringPoolOptions.md) = `{}`

Memory leak prevention options

#### Returns

`LRUStringPool`

#### Throws

Error if maxSize is less than 1

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [core/src/string-intern-pool.ts:383](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L383)

Get the current number of cached strings

##### Returns

`number`

***

### maxSize

#### Get Signature

> **get** **maxSize**(): `number`

Defined in: [core/src/string-intern-pool.ts:390](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L390)

Get the maximum pool size

##### Returns

`number`

## Methods

### intern()

> **intern**(`s`): `string`

Defined in: [core/src/string-intern-pool.ts:255](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L255)

Intern a string, returning a cached reference if available.

If the string is already in the cache, its entry is moved to
the most-recently-used position. If the cache is full and the
string is new, the least-recently-used entry is evicted.

Memory Leak Prevention:
- Strings exceeding maxStringLength are returned but not cached
- Memory limit triggers eviction before count limit
- TTL is refreshed on access

Performance (Issue: evodb-wvz):
- Cache hit: O(1) move-to-tail via pointer updates (no Map rehashing)
- In-place lastAccess update (no object allocation on hit)

#### Parameters

##### s

`string`

The string to intern

#### Returns

`string`

The interned string (may be same reference or cached reference)

***

### pruneExpired()

> **pruneExpired**(): `void`

Defined in: [core/src/string-intern-pool.ts:334](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L334)

Prune entries that have exceeded their TTL
Call this periodically or before operations to clean up stale entries

#### Returns

`void`

***

### has()

> **has**(`s`): `boolean`

Defined in: [core/src/string-intern-pool.ts:366](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L366)

Check if a string is currently in the pool
Note: This does NOT refresh the TTL (use intern() for that)

#### Parameters

##### s

`string`

The string to check

#### Returns

`boolean`

true if the string is cached

***

### clear()

> **clear**(): `void`

Defined in: [core/src/string-intern-pool.ts:397](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L397)

Clear all cached strings and reset memory tracking

#### Returns

`void`

***

### getStats()

> **getStats**(): [`StringPoolStats`](../interfaces/StringPoolStats.md)

Defined in: [core/src/string-intern-pool.ts:408](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L408)

Get performance statistics

#### Returns

[`StringPoolStats`](../interfaces/StringPoolStats.md)

Current stats including hits, misses, evictions, hit rate, and memory usage

***

### resetStats()

> **resetStats**(): `void`

Defined in: [core/src/string-intern-pool.ts:425](https://github.com/dot-do/evodb/blob/main/core/src/string-intern-pool.ts#L425)

Reset statistics counters (does not clear the cache)

#### Returns

`void`
