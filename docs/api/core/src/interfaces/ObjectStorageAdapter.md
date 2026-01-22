[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ObjectStorageAdapter

# ~~Interface: ObjectStorageAdapter~~

Defined in: [core/src/storage.ts:123](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L123)

Object storage adapter interface for R2, S3, filesystem, etc.
Designed for testability - use MemoryObjectStorageAdapter for unit tests.

## Deprecated

Use the unified Storage interface instead. This interface is
maintained for backward compatibility with existing code.

Migration guide:
- put() -> write()
- get() -> read()
- list() -> list() (returns { paths: string[] } now)
- delete() -> delete()
- head() -> head() (returns StorageMetadata now)
- exists() -> exists()
- getRange() -> readRange()

## Methods

### ~~put()~~

> **put**(`path`, `data`): `Promise`\<`void`\>

Defined in: [core/src/storage.ts:125](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L125)

Write data to a path

#### Parameters

##### path

`string`

##### data

`ArrayBuffer` | `Uint8Array`\<`ArrayBufferLike`\>

#### Returns

`Promise`\<`void`\>

***

### ~~get()~~

> **get**(`path`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage.ts:128](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L128)

Read data from a path, returns null if not found

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

***

### ~~delete()~~

> **delete**(`path`): `Promise`\<`void`\>

Defined in: [core/src/storage.ts:131](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L131)

Delete an object at path

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`void`\>

***

### ~~list()~~

> **list**(`prefix`): `Promise`\<`string`[]\>

Defined in: [core/src/storage.ts:134](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L134)

List objects with a prefix

#### Parameters

##### prefix

`string`

#### Returns

`Promise`\<`string`[]\>

***

### ~~head()~~

> **head**(`path`): `Promise`\<[`ObjectMetadata`](ObjectMetadata.md)\>

Defined in: [core/src/storage.ts:137](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L137)

Get object metadata without reading body

#### Parameters

##### path

`string`

#### Returns

`Promise`\<[`ObjectMetadata`](ObjectMetadata.md)\>

***

### ~~exists()?~~

> `optional` **exists**(`path`): `Promise`\<`boolean`\>

Defined in: [core/src/storage.ts:140](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L140)

Check if an object exists

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`boolean`\>

***

### ~~getRange()?~~

> `optional` **getRange**(`path`, `offset`, `length`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage.ts:143](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L143)

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
