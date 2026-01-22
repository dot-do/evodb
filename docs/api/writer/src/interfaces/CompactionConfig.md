[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / CompactionConfig

# Interface: CompactionConfig

Defined in: [writer/src/compactor.ts:41](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L41)

Compaction configuration

## Properties

### minBlocks

> **minBlocks**: `number`

Defined in: [writer/src/compactor.ts:43](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L43)

Minimum blocks to trigger compaction

***

### targetSize

> **targetSize**: `number`

Defined in: [writer/src/compactor.ts:45](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L45)

Target block size after compaction

***

### maxSize

> **maxSize**: `number`

Defined in: [writer/src/compactor.ts:47](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L47)

Maximum block size (don't exceed)

***

### strategy

> **strategy**: [`CompactionStrategy`](../type-aliases/CompactionStrategy.md)

Defined in: [writer/src/compactor.ts:49](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L49)

Strategy for selecting blocks

***

### maxMergeBlocks

> **maxMergeBlocks**: `number`

Defined in: [writer/src/compactor.ts:51](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L51)

Maximum blocks to merge at once

***

### partitionMode

> **partitionMode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/compactor.ts:53](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L53)

Partition mode for size thresholds
