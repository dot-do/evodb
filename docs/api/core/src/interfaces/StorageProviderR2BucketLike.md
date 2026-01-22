[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / StorageProviderR2BucketLike

# Interface: StorageProviderR2BucketLike

Defined in: [core/src/storage-provider.ts:207](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L207)

Minimal R2Bucket interface for storage operations.
Compatible with Cloudflare Workers R2Bucket binding.

## Methods

### get()

> **get**(`key`): `Promise`\<[`StorageProviderR2ObjectLike`](StorageProviderR2ObjectLike.md)\>

Defined in: [core/src/storage-provider.ts:208](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L208)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`StorageProviderR2ObjectLike`](StorageProviderR2ObjectLike.md)\>

***

### put()

> **put**(`key`, `value`, `options?`): `Promise`\<[`StorageProviderR2ObjectLike`](StorageProviderR2ObjectLike.md)\>

Defined in: [core/src/storage-provider.ts:209](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L209)

#### Parameters

##### key

`string`

##### value

`string` | `ArrayBuffer` | `Uint8Array`\<`ArrayBufferLike`\>

##### options?

[`StorageProviderR2PutOptionsLike`](StorageProviderR2PutOptionsLike.md)

#### Returns

`Promise`\<[`StorageProviderR2ObjectLike`](StorageProviderR2ObjectLike.md)\>

***

### delete()

> **delete**(`key`): `Promise`\<`void`\>

Defined in: [core/src/storage-provider.ts:210](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L210)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`void`\>

***

### list()

> **list**(`options?`): `Promise`\<[`StorageProviderR2ObjectsLike`](StorageProviderR2ObjectsLike.md)\>

Defined in: [core/src/storage-provider.ts:211](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L211)

#### Parameters

##### options?

[`StorageProviderR2ListOptionsLike`](StorageProviderR2ListOptionsLike.md)

#### Returns

`Promise`\<[`StorageProviderR2ObjectsLike`](StorageProviderR2ObjectsLike.md)\>

***

### head()

> **head**(`key`): `Promise`\<[`StorageProviderR2ObjectLike`](StorageProviderR2ObjectLike.md)\>

Defined in: [core/src/storage-provider.ts:212](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L212)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`StorageProviderR2ObjectLike`](StorageProviderR2ObjectLike.md)\>
