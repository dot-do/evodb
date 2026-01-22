[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / mergeBlocks

# Function: mergeBlocks()

> **mergeBlocks**(`adapter`, `blockIds`, `config`): `Promise`\<\{ `newBlockId`: `string`; `deletedIds`: `string`[]; \}\>

Defined in: [core/src/merge.ts:64](https://github.com/dot-do/evodb/blob/main/core/src/merge.ts#L64)

Merge multiple blocks into one

## Parameters

### adapter

[`StorageAdapter`](../interfaces/StorageAdapter.md)

### blockIds

`string`[]

### config

`Partial`\<[`MergeConfig`](../interfaces/MergeConfig.md)\> = `{}`

## Returns

`Promise`\<\{ `newBlockId`: `string`; `deletedIds`: `string`[]; \}\>
