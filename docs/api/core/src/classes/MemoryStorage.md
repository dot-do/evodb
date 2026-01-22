[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / MemoryStorage

# Class: MemoryStorage

Defined in: [core/src/storage.ts:368](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L368)

In-memory implementation of the unified Storage interface.
Use for unit testing storage-dependent code.

## Example

```typescript
const storage = new MemoryStorage();
await storage.write('test.bin', new Uint8Array([1, 2, 3]));
const data = await storage.read('test.bin');
```

## Implements

- [`Storage`](../interfaces/Storage.md)

## Constructors

### Constructor

> **new MemoryStorage**(): `MemoryStorage`

#### Returns

`MemoryStorage`

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [core/src/storage.ts:422](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L422)

Get number of stored objects

##### Returns

`number`

## Methods

### read()

> **read**(`path`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage.ts:371](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L371)

Read data from a path, returns null if not found

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`read`](../interfaces/Storage.md#read)

***

### write()

> **write**(`path`, `data`): `Promise`\<`void`\>

Defined in: [core/src/storage.ts:376](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L376)

Write data to a path

#### Parameters

##### path

`string`

##### data

`Uint8Array`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`write`](../interfaces/Storage.md#write)

***

### list()

> **list**(`prefix`): `Promise`\<\{ `paths`: `string`[]; \}\>

Defined in: [core/src/storage.ts:387](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L387)

List objects with a prefix, returns array of paths

#### Parameters

##### prefix

`string`

#### Returns

`Promise`\<\{ `paths`: `string`[]; \}\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`list`](../interfaces/Storage.md#list)

***

### delete()

> **delete**(`path`): `Promise`\<`void`\>

Defined in: [core/src/storage.ts:394](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L394)

Delete an object at path

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`delete`](../interfaces/Storage.md#delete)

***

### exists()

> **exists**(`path`): `Promise`\<`boolean`\>

Defined in: [core/src/storage.ts:398](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L398)

Check if an object exists (optional - can be derived from read)

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`exists`](../interfaces/Storage.md#exists)

***

### head()

> **head**(`path`): `Promise`\<[`StorageMetadata`](../interfaces/StorageMetadata.md)\>

Defined in: [core/src/storage.ts:402](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L402)

Get object metadata without reading body (optional)

#### Parameters

##### path

`string`

#### Returns

`Promise`\<[`StorageMetadata`](../interfaces/StorageMetadata.md)\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`head`](../interfaces/Storage.md#head)

***

### readRange()

> **readRange**(`path`, `offset`, `length`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage.ts:407](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L407)

Read a byte range from an object (optional - for efficient partial reads)

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

[`Storage`](../interfaces/Storage.md).[`readRange`](../interfaces/Storage.md#readrange)

***

### clear()

> **clear**(): `void`

Defined in: [core/src/storage.ts:417](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L417)

Clear all stored data (useful for test cleanup)

#### Returns

`void`

***

### keys()

> **keys**(): `string`[]

Defined in: [core/src/storage.ts:427](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L427)

Get all keys (for debugging)

#### Returns

`string`[]
