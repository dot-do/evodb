[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / parseAndValidateBlockData

# Function: parseAndValidateBlockData()

> **parseAndValidateBlockData**(`buffer`, `blockPath`, `options?`): [`BlockDataValidationResult`](../interfaces/BlockDataValidationResult.md)

Defined in: [query/src/simple-engine.ts:552](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L552)

Parses JSON from a buffer and validates as BlockData in a single operation.

## Parameters

### buffer

`ArrayBuffer`

### blockPath

`string`

### options?

#### maxBlockSize?

`number`

## Returns

[`BlockDataValidationResult`](../interfaces/BlockDataValidationResult.md)
