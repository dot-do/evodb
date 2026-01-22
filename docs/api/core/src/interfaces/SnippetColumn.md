[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SnippetColumn

# Interface: SnippetColumn

Defined in: [core/src/snippet-format.ts:108](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L108)

Encoded snippet column

## Properties

### path

> **path**: `string`

Defined in: [core/src/snippet-format.ts:109](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L109)

***

### type

> **type**: [`Type`](../enumerations/Type.md)

Defined in: [core/src/snippet-format.ts:110](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L110)

***

### encoding

> **encoding**: [`SnippetEncoding`](../enumerations/SnippetEncoding.md)

Defined in: [core/src/snippet-format.ts:111](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L111)

***

### data

> **data**: `Uint8Array`

Defined in: [core/src/snippet-format.ts:112](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L112)

***

### nullBitmap

> **nullBitmap**: `Uint8Array`

Defined in: [core/src/snippet-format.ts:113](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L113)

***

### zoneMap

> **zoneMap**: [`ZoneMap`](ZoneMap.md)

Defined in: [core/src/snippet-format.ts:114](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L114)

***

### bloomFilter?

> `optional` **bloomFilter**: `Uint8Array`

Defined in: [core/src/snippet-format.ts:115](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L115)

***

### sorted

> **sorted**: `boolean`

Defined in: [core/src/snippet-format.ts:116](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L116)
