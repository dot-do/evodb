[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / MergeConfig

# Interface: MergeConfig

Defined in: [core/src/merge.ts:17](https://github.com/dot-do/evodb/blob/main/core/src/merge.ts#L17)

Merge configuration

## Properties

### targetRows

> **targetRows**: `number`

Defined in: [core/src/merge.ts:19](https://github.com/dot-do/evodb/blob/main/core/src/merge.ts#L19)

Target rows per block (default: 10000)

***

### maxMerge

> **maxMerge**: `number`

Defined in: [core/src/merge.ts:21](https://github.com/dot-do/evodb/blob/main/core/src/merge.ts#L21)

Max blocks to merge at once (default: 4)

***

### minBlocks

> **minBlocks**: `number`

Defined in: [core/src/merge.ts:23](https://github.com/dot-do/evodb/blob/main/core/src/merge.ts#L23)

Min blocks to trigger merge (default: 4)

***

### prefix

> **prefix**: `string`

Defined in: [core/src/merge.ts:25](https://github.com/dot-do/evodb/blob/main/core/src/merge.ts#L25)

Block prefix
