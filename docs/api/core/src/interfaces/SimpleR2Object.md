[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SimpleR2Object

# Interface: SimpleR2Object

Defined in: core/src/types/r2.ts:313

Simple R2 object interface for read operations.

## Properties

### key

> `readonly` **key**: `string`

Defined in: core/src/types/r2.ts:314

***

### size

> `readonly` **size**: `number`

Defined in: core/src/types/r2.ts:315

***

### etag

> `readonly` **etag**: `string`

Defined in: core/src/types/r2.ts:316

***

### httpEtag

> `readonly` **httpEtag**: `string`

Defined in: core/src/types/r2.ts:317

***

### uploaded

> `readonly` **uploaded**: `Date`

Defined in: core/src/types/r2.ts:318

***

### customMetadata?

> `readonly` `optional` **customMetadata**: `Record`\<`string`, `string`\>

Defined in: core/src/types/r2.ts:319

## Methods

### arrayBuffer()

> **arrayBuffer**(): `Promise`\<`ArrayBuffer`\>

Defined in: core/src/types/r2.ts:320

#### Returns

`Promise`\<`ArrayBuffer`\>

***

### text()

> **text**(): `Promise`\<`string`\>

Defined in: core/src/types/r2.ts:321

#### Returns

`Promise`\<`string`\>

***

### json()

> **json**\<`T`\>(): `Promise`\<`T`\>

Defined in: core/src/types/r2.ts:322

#### Type Parameters

##### T

`T` = `unknown`

#### Returns

`Promise`\<`T`\>
