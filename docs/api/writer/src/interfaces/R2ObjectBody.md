[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / R2ObjectBody

# Interface: R2ObjectBody

Defined in: [writer/src/types.ts:659](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L659)

## Extends

- [`R2Object`](R2Object.md)

## Properties

### key

> **key**: `string`

Defined in: [writer/src/types.ts:648](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L648)

#### Inherited from

[`R2Object`](R2Object.md).[`key`](R2Object.md#key)

***

### version

> **version**: `string`

Defined in: [writer/src/types.ts:649](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L649)

#### Inherited from

[`R2Object`](R2Object.md).[`version`](R2Object.md#version)

***

### size

> **size**: `number`

Defined in: [writer/src/types.ts:650](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L650)

#### Inherited from

[`R2Object`](R2Object.md).[`size`](R2Object.md#size)

***

### etag

> **etag**: `string`

Defined in: [writer/src/types.ts:651](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L651)

#### Inherited from

[`R2Object`](R2Object.md).[`etag`](R2Object.md#etag)

***

### httpEtag

> **httpEtag**: `string`

Defined in: [writer/src/types.ts:652](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L652)

#### Inherited from

[`R2Object`](R2Object.md).[`httpEtag`](R2Object.md#httpetag)

***

### checksums

> **checksums**: [`R2Checksums`](R2Checksums.md)

Defined in: [writer/src/types.ts:653](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L653)

#### Inherited from

[`R2Object`](R2Object.md).[`checksums`](R2Object.md#checksums)

***

### uploaded

> **uploaded**: `Date`

Defined in: [writer/src/types.ts:654](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L654)

#### Inherited from

[`R2Object`](R2Object.md).[`uploaded`](R2Object.md#uploaded)

***

### httpMetadata?

> `optional` **httpMetadata**: [`R2HTTPMetadata`](R2HTTPMetadata.md)

Defined in: [writer/src/types.ts:655](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L655)

#### Inherited from

[`R2Object`](R2Object.md).[`httpMetadata`](R2Object.md#httpmetadata)

***

### customMetadata?

> `optional` **customMetadata**: `Record`\<`string`, `string`\>

Defined in: [writer/src/types.ts:656](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L656)

#### Inherited from

[`R2Object`](R2Object.md).[`customMetadata`](R2Object.md#custommetadata)

***

### body

> **body**: `ReadableStream`

Defined in: [writer/src/types.ts:660](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L660)

***

### bodyUsed

> **bodyUsed**: `boolean`

Defined in: [writer/src/types.ts:661](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L661)

## Methods

### arrayBuffer()

> **arrayBuffer**(): `Promise`\<`ArrayBuffer`\>

Defined in: [writer/src/types.ts:662](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L662)

#### Returns

`Promise`\<`ArrayBuffer`\>

***

### text()

> **text**(): `Promise`\<`string`\>

Defined in: [writer/src/types.ts:663](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L663)

#### Returns

`Promise`\<`string`\>

***

### json()

> **json**\<`T`\>(): `Promise`\<`T`\>

Defined in: [writer/src/types.ts:664](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L664)

#### Type Parameters

##### T

`T`

#### Returns

`Promise`\<`T`\>

***

### blob()

> **blob**(): `Promise`\<`Blob`\>

Defined in: [writer/src/types.ts:665](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L665)

#### Returns

`Promise`\<`Blob`\>
