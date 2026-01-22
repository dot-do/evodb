[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / DecodedColumn

# Interface: DecodedColumn

Defined in: [core/src/snippet-format.ts:132](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L132)

Decoded column with zero-copy support

## Properties

### path

> **path**: `string`

Defined in: [core/src/snippet-format.ts:133](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L133)

***

### type

> **type**: [`Type`](../enumerations/Type.md)

Defined in: [core/src/snippet-format.ts:134](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L134)

***

### values

> **values**: `ArrayLike`\<`unknown`\>

Defined in: [core/src/snippet-format.ts:136](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L136)

Raw typed array view (zero-copy) or decoded values

***

### nullBitmap

> **nullBitmap**: `Uint8Array`

Defined in: [core/src/snippet-format.ts:138](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L138)

Null bitmap as typed array

***

### isZeroCopy

> **isZeroCopy**: `boolean`

Defined in: [core/src/snippet-format.ts:140](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L140)

Whether values is a zero-copy view
