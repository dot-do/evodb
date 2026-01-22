[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / CompactionStrategyOptions

# Interface: CompactionStrategyOptions

Defined in: [writer/src/strategies/compaction-strategy.ts:17](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L17)

Compaction strategy options

## Properties

### minBlocks

> **minBlocks**: `number`

Defined in: [writer/src/strategies/compaction-strategy.ts:19](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L19)

Minimum blocks to trigger compaction

***

### targetSize

> **targetSize**: `number`

Defined in: [writer/src/strategies/compaction-strategy.ts:21](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L21)

Target size for compacted blocks

***

### maxSize

> **maxSize**: `number`

Defined in: [writer/src/strategies/compaction-strategy.ts:23](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L23)

Maximum size for compacted blocks

***

### maxMergeBlocks

> **maxMergeBlocks**: `number`

Defined in: [writer/src/strategies/compaction-strategy.ts:25](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L25)

Maximum blocks to merge at once

***

### partitionMode

> **partitionMode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/strategies/compaction-strategy.ts:27](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L27)

Partition mode
