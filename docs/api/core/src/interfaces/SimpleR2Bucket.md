[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SimpleR2Bucket

# Interface: SimpleR2Bucket

Defined in: core/src/types/r2.ts:304

Simple R2 bucket interface for read-only operations.
Used by query engines that only need to read data.

## Methods

### get()

> **get**(`key`): `Promise`\<[`SimpleR2Object`](SimpleR2Object.md)\>

Defined in: core/src/types/r2.ts:305

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`SimpleR2Object`](SimpleR2Object.md)\>

***

### head()

> **head**(`key`): `Promise`\<[`SimpleR2Object`](SimpleR2Object.md)\>

Defined in: core/src/types/r2.ts:306

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`SimpleR2Object`](SimpleR2Object.md)\>

***

### list()

> **list**(`options?`): `Promise`\<[`SimpleR2Objects`](SimpleR2Objects.md)\>

Defined in: core/src/types/r2.ts:307

#### Parameters

##### options?

[`SimpleR2ListOptions`](SimpleR2ListOptions.md)

#### Returns

`Promise`\<[`SimpleR2Objects`](SimpleR2Objects.md)\>
