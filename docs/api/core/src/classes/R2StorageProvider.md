[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / R2StorageProvider

# Class: R2StorageProvider

Defined in: [core/src/storage-provider.ts:340](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L340)

R2 implementation of StorageProvider.
Wraps an R2Bucket binding to provide the StorageProvider interface.

Features:
- Supports optional key prefix for namespacing
- Validates paths to prevent path traversal attacks
- Handles R2 pagination for large lists

## Example

```typescript
// In a Cloudflare Worker
const provider = new R2StorageProvider(env.MY_BUCKET);
await provider.put('data/file.bin', new Uint8Array([1, 2, 3]));

// With key prefix for namespacing
const tenantProvider = new R2StorageProvider(env.MY_BUCKET, 'tenant-123');
// Operations are scoped to tenant-123/ prefix
```

## Implements

- [`StorageProvider`](../interfaces/StorageProvider.md)

## Constructors

### Constructor

> **new R2StorageProvider**(`bucket`, `keyPrefix`): `R2StorageProvider`

Defined in: [core/src/storage-provider.ts:341](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L341)

#### Parameters

##### bucket

[`StorageProviderR2BucketLike`](../interfaces/StorageProviderR2BucketLike.md)

##### keyPrefix

`string` = `''`

#### Returns

`R2StorageProvider`

## Methods

### get()

> **get**(`key`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage-provider.ts:356](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L356)

Retrieve data from storage.

#### Parameters

##### key

`string`

The storage key/path

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

The data as Uint8Array, or null if key doesn't exist

#### Implementation of

[`StorageProvider`](../interfaces/StorageProvider.md).[`get`](../interfaces/StorageProvider.md#get)

***

### put()

> **put**(`key`, `data`): `Promise`\<`void`\>

Defined in: [core/src/storage-provider.ts:365](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L365)

Store data in storage.

#### Parameters

##### key

`string`

The storage key/path

##### data

`Uint8Array`

The data to store

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`StorageProvider`](../interfaces/StorageProvider.md).[`put`](../interfaces/StorageProvider.md#put)

***

### delete()

> **delete**(`key`): `Promise`\<`void`\>

Defined in: [core/src/storage-provider.ts:375](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L375)

Delete data from storage.
Does not throw if key doesn't exist.

#### Parameters

##### key

`string`

The storage key/path

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`StorageProvider`](../interfaces/StorageProvider.md).[`delete`](../interfaces/StorageProvider.md#delete)

***

### list()

> **list**(`prefix`): `Promise`\<`string`[]\>

Defined in: [core/src/storage-provider.ts:381](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L381)

List keys with a given prefix.

#### Parameters

##### prefix

`string`

The prefix to filter keys

#### Returns

`Promise`\<`string`[]\>

Array of matching keys, sorted alphabetically

#### Implementation of

[`StorageProvider`](../interfaces/StorageProvider.md).[`list`](../interfaces/StorageProvider.md#list)

***

### exists()

> **exists**(`key`): `Promise`\<`boolean`\>

Defined in: [core/src/storage-provider.ts:409](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L409)

Check if a key exists in storage.

#### Parameters

##### key

`string`

The storage key/path

#### Returns

`Promise`\<`boolean`\>

true if key exists, false otherwise

#### Implementation of

[`StorageProvider`](../interfaces/StorageProvider.md).[`exists`](../interfaces/StorageProvider.md#exists)
