[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / R2ObjectStorageAdapter

# Class: R2ObjectStorageAdapter

Defined in: [core/src/storage.ts:197](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L197)

R2 storage adapter implementation
Wraps an R2Bucket binding to implement ObjectStorageAdapter

## Implements

- [`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)

## Constructors

### Constructor

> **new R2ObjectStorageAdapter**(`bucket`, `keyPrefix`): `R2ObjectStorageAdapter`

Defined in: [core/src/storage.ts:198](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L198)

#### Parameters

##### bucket

`R2BucketLike`

##### keyPrefix

`string` = `''`

#### Returns

`R2ObjectStorageAdapter`

## Methods

### put()

> **put**(`path`, `data`): `Promise`\<`void`\>

Defined in: [core/src/storage.ts:210](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L210)

Write data to a path

#### Parameters

##### path

`string`

##### data

`ArrayBuffer` | `Uint8Array`\<`ArrayBufferLike`\>

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md).[`put`](../interfaces/ObjectStorageAdapter.md#put)

***

### get()

> **get**(`path`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage.ts:218](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L218)

Read data from a path, returns null if not found

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

#### Implementation of

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md).[`get`](../interfaces/ObjectStorageAdapter.md#get)

***

### delete()

> **delete**(`path`): `Promise`\<`void`\>

Defined in: [core/src/storage.ts:227](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L227)

Delete an object at path

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md).[`delete`](../interfaces/ObjectStorageAdapter.md#delete)

***

### list()

> **list**(`prefix`): `Promise`\<`string`[]\>

Defined in: [core/src/storage.ts:233](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L233)

List objects with a prefix

#### Parameters

##### prefix

`string`

#### Returns

`Promise`\<`string`[]\>

#### Implementation of

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md).[`list`](../interfaces/ObjectStorageAdapter.md#list)

***

### head()

> **head**(`path`): `Promise`\<[`ObjectMetadata`](../interfaces/ObjectMetadata.md)\>

Defined in: [core/src/storage.ts:254](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L254)

Get object metadata without reading body

#### Parameters

##### path

`string`

#### Returns

`Promise`\<[`ObjectMetadata`](../interfaces/ObjectMetadata.md)\>

#### Implementation of

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md).[`head`](../interfaces/ObjectStorageAdapter.md#head)

***

### exists()

> **exists**(`path`): `Promise`\<`boolean`\>

Defined in: [core/src/storage.ts:266](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L266)

Check if an object exists

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md).[`exists`](../interfaces/ObjectStorageAdapter.md#exists)
