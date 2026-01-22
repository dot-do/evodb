[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / R2BucketLike

# Interface: R2BucketLike

Defined in: core/src/types/r2.ts:240

Minimal R2Bucket interface for read/write operations.
Use when you don't need range reads or full R2 features.

This is a subset of R2Bucket that's sufficient for most use cases
and allows lighter mock implementations.

## Methods

### get()

> **get**(`key`): `Promise`\<[`R2ObjectLike`](R2ObjectLike.md)\>

Defined in: core/src/types/r2.ts:241

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`R2ObjectLike`](R2ObjectLike.md)\>

***

### put()

> **put**(`key`, `value`, `options?`): `Promise`\<[`R2ObjectLike`](R2ObjectLike.md)\>

Defined in: core/src/types/r2.ts:242

#### Parameters

##### key

`string`

##### value

`string` | `ArrayBuffer` | `Uint8Array`\<`ArrayBufferLike`\>

##### options?

[`R2PutOptionsLike`](R2PutOptionsLike.md)

#### Returns

`Promise`\<[`R2ObjectLike`](R2ObjectLike.md)\>

***

### delete()

> **delete**(`key`): `Promise`\<`void`\>

Defined in: core/src/types/r2.ts:247

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`void`\>

***

### list()

> **list**(`options?`): `Promise`\<[`R2ObjectsLike`](R2ObjectsLike.md)\>

Defined in: core/src/types/r2.ts:248

#### Parameters

##### options?

[`R2ListOptionsLike`](R2ListOptionsLike.md)

#### Returns

`Promise`\<[`R2ObjectsLike`](R2ObjectsLike.md)\>

***

### head()

> **head**(`key`): `Promise`\<[`R2ObjectLike`](R2ObjectLike.md)\>

Defined in: core/src/types/r2.ts:249

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`R2ObjectLike`](R2ObjectLike.md)\>
