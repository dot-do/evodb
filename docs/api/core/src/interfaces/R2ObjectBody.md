[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / R2ObjectBody

# Interface: R2ObjectBody

Defined in: core/src/types/r2.ts:146

R2 object with body.
Returned by get() when object exists.

## Extends

- [`R2Object`](R2Object.md)

## Properties

### key

> **key**: `string`

Defined in: core/src/types/r2.ts:121

Object key/path

#### Inherited from

[`R2Object`](R2Object.md).[`key`](R2Object.md#key)

***

### version

> **version**: `string`

Defined in: core/src/types/r2.ts:123

Version identifier

#### Inherited from

[`R2Object`](R2Object.md).[`version`](R2Object.md#version)

***

### size

> **size**: `number`

Defined in: core/src/types/r2.ts:125

Object size in bytes

#### Inherited from

[`R2Object`](R2Object.md).[`size`](R2Object.md#size)

***

### etag

> **etag**: `string`

Defined in: core/src/types/r2.ts:127

ETag for cache validation

#### Inherited from

[`R2Object`](R2Object.md).[`etag`](R2Object.md#etag)

***

### httpEtag

> **httpEtag**: `string`

Defined in: core/src/types/r2.ts:129

HTTP-formatted ETag (with quotes)

#### Inherited from

[`R2Object`](R2Object.md).[`httpEtag`](R2Object.md#httpetag)

***

### checksums

> **checksums**: [`R2Checksums`](R2Checksums.md)

Defined in: core/src/types/r2.ts:131

Object checksums

#### Inherited from

[`R2Object`](R2Object.md).[`checksums`](R2Object.md#checksums)

***

### uploaded

> **uploaded**: `Date`

Defined in: core/src/types/r2.ts:133

Upload timestamp

#### Inherited from

[`R2Object`](R2Object.md).[`uploaded`](R2Object.md#uploaded)

***

### httpMetadata?

> `optional` **httpMetadata**: [`R2HTTPMetadata`](R2HTTPMetadata.md)

Defined in: core/src/types/r2.ts:135

HTTP metadata

#### Inherited from

[`R2Object`](R2Object.md).[`httpMetadata`](R2Object.md#httpmetadata)

***

### customMetadata?

> `optional` **customMetadata**: `Record`\<`string`, `string`\>

Defined in: core/src/types/r2.ts:137

Custom metadata key-value pairs

#### Inherited from

[`R2Object`](R2Object.md).[`customMetadata`](R2Object.md#custommetadata)

***

### range?

> `optional` **range**: [`R2Range`](R2Range.md)

Defined in: core/src/types/r2.ts:139

Range information (present when partial read requested)

#### Inherited from

[`R2Object`](R2Object.md).[`range`](R2Object.md#range)

***

### body

> **body**: `ReadableStream`

Defined in: core/src/types/r2.ts:148

ReadableStream of the body content

***

### bodyUsed

> **bodyUsed**: `boolean`

Defined in: core/src/types/r2.ts:150

Whether the body has been consumed

## Methods

### arrayBuffer()

> **arrayBuffer**(): `Promise`\<`ArrayBuffer`\>

Defined in: core/src/types/r2.ts:152

Read body as ArrayBuffer

#### Returns

`Promise`\<`ArrayBuffer`\>

***

### text()

> **text**(): `Promise`\<`string`\>

Defined in: core/src/types/r2.ts:154

Read body as text

#### Returns

`Promise`\<`string`\>

***

### json()

> **json**\<`T`\>(): `Promise`\<`T`\>

Defined in: core/src/types/r2.ts:156

Read body as JSON

#### Type Parameters

##### T

`T` = `unknown`

#### Returns

`Promise`\<`T`\>

***

### blob()

> **blob**(): `Promise`\<`Blob`\>

Defined in: core/src/types/r2.ts:158

Read body as Blob

#### Returns

`Promise`\<`Blob`\>
