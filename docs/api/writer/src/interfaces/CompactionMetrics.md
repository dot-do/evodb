[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / CompactionMetrics

# Interface: CompactionMetrics

Defined in: [writer/src/strategies/interfaces.ts:176](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L176)

Compaction metrics for monitoring

## Properties

### totalBlocks

> **totalBlocks**: `number`

Defined in: [writer/src/strategies/interfaces.ts:178](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L178)

Total blocks in index

***

### smallBlocks

> **smallBlocks**: `number`

Defined in: [writer/src/strategies/interfaces.ts:180](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L180)

Blocks eligible for compaction

***

### compactedBlocks

> **compactedBlocks**: `number`

Defined in: [writer/src/strategies/interfaces.ts:182](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L182)

Already compacted blocks

***

### eligibleForCompaction

> **eligibleForCompaction**: `boolean`

Defined in: [writer/src/strategies/interfaces.ts:184](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L184)

Whether compaction threshold is met

***

### targetSize

> **targetSize**: `number`

Defined in: [writer/src/strategies/interfaces.ts:186](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L186)

Target size for compacted blocks

***

### maxSize

> **maxSize**: `number`

Defined in: [writer/src/strategies/interfaces.ts:188](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L188)

Maximum size for compacted blocks
