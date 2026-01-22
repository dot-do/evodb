[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / R2Storage

# Class: R2Storage

Defined in: [core/src/storage.ts:451](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L451)

R2 implementation of the unified Storage interface.
Wraps an R2Bucket binding to provide the Storage interface.

## Example

```typescript
// In a Cloudflare Worker
const storage = new R2Storage(env.MY_BUCKET);
await storage.write('data/file.bin', new Uint8Array([1, 2, 3]));
```

## Implements

- [`Storage`](../interfaces/Storage.md)

## Constructors

### Constructor

> **new R2Storage**(`bucket`, `keyPrefix`): `R2Storage`

Defined in: [core/src/storage.ts:452](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L452)

#### Parameters

##### bucket

`R2BucketLike`

##### keyPrefix

`string` = `''`

#### Returns

`R2Storage`

## Methods

### read()

> **read**(`path`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage.ts:464](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L464)

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

Defined in: [core/src/storage.ts:473](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L473)

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

Defined in: [core/src/storage.ts:480](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L480)

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

Defined in: [core/src/storage.ts:501](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L501)

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

Defined in: [core/src/storage.ts:507](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L507)

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

Defined in: [core/src/storage.ts:512](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L512)

Get object metadata without reading body (optional)

#### Parameters

##### path

`string`

#### Returns

`Promise`\<[`StorageMetadata`](../interfaces/StorageMetadata.md)\>

#### Implementation of

[`Storage`](../interfaces/Storage.md).[`head`](../interfaces/Storage.md#head)
