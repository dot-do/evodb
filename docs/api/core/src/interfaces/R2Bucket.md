[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / R2Bucket

# Interface: R2Bucket

Defined in: core/src/types/r2.ts:186

Full R2 bucket interface.
Compatible with Cloudflare Workers R2Bucket binding.

Use this interface when you need full R2 functionality including
writes, range reads, and delete operations.

## Methods

### put()

> **put**(`key`, `value`, `options?`): `Promise`\<[`R2Object`](R2Object.md)\>

Defined in: core/src/types/r2.ts:194

Store an object in the bucket.

#### Parameters

##### key

`string`

Object key/path

##### value

Data to store

`string` | `ArrayBuffer` | `Uint8Array`\<`ArrayBufferLike`\> | `ReadableStream`\<`any`\> | `Blob`

##### options?

[`R2PutOptions`](R2PutOptions.md)

Put options (metadata, conditional)

#### Returns

`Promise`\<[`R2Object`](R2Object.md)\>

The stored object metadata

***

### get()

> **get**(`key`, `options?`): `Promise`\<[`R2ObjectBody`](R2ObjectBody.md)\>

Defined in: core/src/types/r2.ts:206

Retrieve an object from the bucket.

#### Parameters

##### key

`string`

Object key/path

##### options?

[`R2GetOptions`](R2GetOptions.md)

Get options (range, conditional)

#### Returns

`Promise`\<[`R2ObjectBody`](R2ObjectBody.md)\>

The object with body, or null if not found

***

### delete()

> **delete**(`keys`): `Promise`\<`void`\>

Defined in: core/src/types/r2.ts:212

Delete one or more objects from the bucket.

#### Parameters

##### keys

Object key(s) to delete

`string` | `string`[]

#### Returns

`Promise`\<`void`\>

***

### list()

> **list**(`options?`): `Promise`\<[`R2Objects`](R2Objects.md)\>

Defined in: core/src/types/r2.ts:219

List objects in the bucket.

#### Parameters

##### options?

[`R2ListOptions`](R2ListOptions.md)

List options (prefix, cursor, limit)

#### Returns

`Promise`\<[`R2Objects`](R2Objects.md)\>

List result with objects and pagination info

***

### head()

> **head**(`key`): `Promise`\<[`R2Object`](R2Object.md)\>

Defined in: core/src/types/r2.ts:226

Get object metadata without reading the body.

#### Parameters

##### key

`string`

Object key/path

#### Returns

`Promise`\<[`R2Object`](R2Object.md)\>

Object metadata, or null if not found
