[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / unsafeBlockId

# Function: unsafeBlockId()

> **unsafeBlockId**(`id`): [`BlockId`](../type-aliases/BlockId.md)

Defined in: [core/src/types.ts:64](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L64)

Create a BlockId without validation (for internal use where format is known).
Use with caution - prefer blockId() for user input.

## Parameters

### id

`string`

## Returns

[`BlockId`](../type-aliases/BlockId.md)
