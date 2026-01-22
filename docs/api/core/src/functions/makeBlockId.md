[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / makeBlockId

# Function: makeBlockId()

> **makeBlockId**(`prefix`, `timestamp`, `seq`): [`BlockId`](../type-aliases/BlockId.md)

Defined in: [core/src/storage.ts:928](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L928)

Create a BlockId from components.
Format: prefix:timestamp(base36,10-padded):seq(base36,4-padded)

## Parameters

### prefix

`string`

### timestamp

`number`

### seq

`number` = `0`

## Returns

[`BlockId`](../type-aliases/BlockId.md)

Branded BlockId type for compile-time safety
