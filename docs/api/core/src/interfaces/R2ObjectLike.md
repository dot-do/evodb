[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / R2ObjectLike

# Interface: R2ObjectLike

Defined in: core/src/types/r2.ts:256

Minimal R2Object interface.
Subset of R2Object for simpler implementations.

## Properties

### key

> **key**: `string`

Defined in: core/src/types/r2.ts:257

***

### size

> **size**: `number`

Defined in: core/src/types/r2.ts:258

***

### etag

> **etag**: `string`

Defined in: core/src/types/r2.ts:259

***

### uploaded

> **uploaded**: `Date`

Defined in: core/src/types/r2.ts:260

## Methods

### arrayBuffer()

> **arrayBuffer**(): `Promise`\<`ArrayBuffer`\>

Defined in: core/src/types/r2.ts:261

#### Returns

`Promise`\<`ArrayBuffer`\>

***

### text()

> **text**(): `Promise`\<`string`\>

Defined in: core/src/types/r2.ts:262

#### Returns

`Promise`\<`string`\>
