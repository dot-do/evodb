[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / encodeSnippetColumn

# Function: encodeSnippetColumn()

> **encodeSnippetColumn**(`path`, `type`, `values`, `nulls`, `options?`): [`SnippetColumn`](../interfaces/SnippetColumn.md)

Defined in: [core/src/snippet-format.ts:715](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L715)

Encode a column using snippet-optimized format

## Parameters

### path

`string`

### type

[`Type`](../enumerations/Type.md)

### values

`unknown`[]

### nulls

`boolean`[]

### options?

#### buildBloom?

`boolean`

## Returns

[`SnippetColumn`](../interfaces/SnippetColumn.md)
