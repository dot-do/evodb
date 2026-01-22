[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SimpleCacheTier

# Class: SimpleCacheTier

Defined in: [query/src/simple-engine.ts:830](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L830)

Simple Cache tier manager for R2 data.
Uses Cloudflare Cache API (FREE) for hot data.

## Constructors

### Constructor

> **new SimpleCacheTier**(`config?`): `SimpleCacheTier`

Defined in: [query/src/simple-engine.ts:840](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L840)

#### Parameters

##### config?

`Partial`\<[`SimpleCacheTierConfig`](../interfaces/SimpleCacheTierConfig.md)\>

#### Returns

`SimpleCacheTier`

## Methods

### get()

> **get**(`bucket`, `key`, `options?`): `Promise`\<\{ `data`: `ArrayBuffer`; `fromCache`: `boolean`; \}\>

Defined in: [query/src/simple-engine.ts:847](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L847)

Get data from cache or R2

#### Parameters

##### bucket

[`SimpleR2Bucket`](../interfaces/SimpleR2Bucket.md)

##### key

`string`

##### options?

###### skipCache?

`boolean`

#### Returns

`Promise`\<\{ `data`: `ArrayBuffer`; `fromCache`: `boolean`; \}\>

***

### getStats()

> **getStats**(): [`SimpleCacheStats`](../interfaces/SimpleCacheStats.md) & `object`

Defined in: [query/src/simple-engine.ts:915](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L915)

Get cache statistics

#### Returns

[`SimpleCacheStats`](../interfaces/SimpleCacheStats.md) & `object`

***

### resetStats()

> **resetStats**(): `void`

Defined in: [query/src/simple-engine.ts:922](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L922)

Reset cache statistics

#### Returns

`void`
