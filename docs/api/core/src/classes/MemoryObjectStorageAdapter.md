[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / MemoryObjectStorageAdapter

# Class: MemoryObjectStorageAdapter

Defined in: [core/src/storage.ts:280](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L280)

In-memory storage adapter for testing
Implements the same interface as R2ObjectStorageAdapter but stores data in memory

## Implements

- [`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)

## Constructors

### Constructor

> **new MemoryObjectStorageAdapter**(): `MemoryObjectStorageAdapter`

#### Returns

`MemoryObjectStorageAdapter`

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [core/src/storage.ts:334](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L334)

Get number of stored objects

##### Returns

`number`

## Methods

### put()

> **put**(`path`, `data`): `Promise`\<`void`\>

Defined in: [core/src/storage.ts:283](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L283)

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

Defined in: [core/src/storage.ts:295](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L295)

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

Defined in: [core/src/storage.ts:300](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L300)

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

Defined in: [core/src/storage.ts:304](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L304)

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

Defined in: [core/src/storage.ts:310](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L310)

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

Defined in: [core/src/storage.ts:315](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L315)

Check if an object exists

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md).[`exists`](../interfaces/ObjectStorageAdapter.md#exists)

***

### getRange()

> **getRange**(`path`, `offset`, `length`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage.ts:319](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L319)

Read a byte range from an object (for efficient partial reads)

#### Parameters

##### path

`string`

##### offset

`number`

##### length

`number`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

#### Implementation of

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md).[`getRange`](../interfaces/ObjectStorageAdapter.md#getrange)

***

### clear()

> **clear**(): `void`

Defined in: [core/src/storage.ts:329](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L329)

Clear all stored data (useful for test cleanup)

#### Returns

`void`

***

### keys()

> **keys**(): `string`[]

Defined in: [core/src/storage.ts:339](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L339)

Get all keys (for debugging)

#### Returns

`string`[]
