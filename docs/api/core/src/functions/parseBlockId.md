[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / parseBlockId

# Function: parseBlockId()

> **parseBlockId**(`id`): `object`

Defined in: [core/src/storage.ts:939](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L939)

Parse a BlockId into its components.

## Parameters

### id

BlockId or plain string to parse

`string` | [`BlockId`](../type-aliases/BlockId.md)

## Returns

`object`

Parsed components or null if invalid format

### prefix

> **prefix**: `string`

### timestamp

> **timestamp**: `number`

### seq

> **seq**: `number`
