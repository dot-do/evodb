[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SnippetHeader

# Interface: SnippetHeader

Defined in: [core/src/snippet-format.ts:58](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L58)

Snippet chunk header (64 bytes)

## Properties

### magic

> **magic**: `number`

Defined in: [core/src/snippet-format.ts:59](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L59)

***

### version

> **version**: `number`

Defined in: [core/src/snippet-format.ts:60](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L60)

***

### flags

> **flags**: `number`

Defined in: [core/src/snippet-format.ts:61](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L61)

***

### rowCount

> **rowCount**: `number`

Defined in: [core/src/snippet-format.ts:62](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L62)

***

### columnCount

> **columnCount**: `number`

Defined in: [core/src/snippet-format.ts:63](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L63)

***

### schemaId

> **schemaId**: `number`

Defined in: [core/src/snippet-format.ts:64](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L64)

***

### minTimestamp

> **minTimestamp**: `bigint`

Defined in: [core/src/snippet-format.ts:65](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L65)

***

### maxTimestamp

> **maxTimestamp**: `bigint`

Defined in: [core/src/snippet-format.ts:66](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L66)

***

### dataOffset

> **dataOffset**: `number`

Defined in: [core/src/snippet-format.ts:67](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L67)

***

### bloomOffset

> **bloomOffset**: `number`

Defined in: [core/src/snippet-format.ts:68](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L68)

***

### checksum

> **checksum**: `number`

Defined in: [core/src/snippet-format.ts:69](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L69)
