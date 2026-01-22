[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ICompactionStrategy

# Interface: ICompactionStrategy

Defined in: [writer/src/strategies/interfaces.ts:145](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L145)

Strategy for determining when and how to compact blocks

## Methods

### shouldCompact()

> **shouldCompact**(`blocks`): `boolean`

Defined in: [writer/src/strategies/interfaces.ts:150](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L150)

Check if compaction should be performed

#### Parameters

##### blocks

[`BlockMetadata`](BlockMetadata.md)[]

Current block index

#### Returns

`boolean`

***

### selectBlocks()

> **selectBlocks**(`blocks`): [`BlockMetadata`](BlockMetadata.md)[]

Defined in: [writer/src/strategies/interfaces.ts:157](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L157)

Select blocks for compaction

#### Parameters

##### blocks

[`BlockMetadata`](BlockMetadata.md)[]

Current block index

#### Returns

[`BlockMetadata`](BlockMetadata.md)[]

Blocks selected for compaction (empty if none)

***

### compact()

> **compact**(`blocks`, `newSeq`): `Promise`\<[`CompactResult`](CompactResult.md)\>

Defined in: [writer/src/strategies/interfaces.ts:164](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L164)

Perform compaction on selected blocks

#### Parameters

##### blocks

[`BlockMetadata`](BlockMetadata.md)[]

Blocks to compact

##### newSeq

`number`

Sequence number for the new block

#### Returns

`Promise`\<[`CompactResult`](CompactResult.md)\>

***

### getMetrics()

> **getMetrics**(`blocks`): [`CompactionMetrics`](CompactionMetrics.md)

Defined in: [writer/src/strategies/interfaces.ts:170](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L170)

Get compaction metrics

#### Parameters

##### blocks

[`BlockMetadata`](BlockMetadata.md)[]

Current block index

#### Returns

[`CompactionMetrics`](CompactionMetrics.md)
