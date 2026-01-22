[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / NoOpCompaction

# Class: NoOpCompaction

Defined in: [writer/src/strategies/compaction-strategy.ts:308](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L308)

Compaction strategy that never compacts (for testing or disabled compaction)

## Implements

- [`ICompactionStrategy`](../interfaces/ICompactionStrategy.md)

## Constructors

### Constructor

> **new NoOpCompaction**(`options?`): `NoOpCompaction`

Defined in: [writer/src/strategies/compaction-strategy.ts:312](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L312)

#### Parameters

##### options?

###### targetSize?

`number`

###### maxSize?

`number`

#### Returns

`NoOpCompaction`

## Methods

### shouldCompact()

> **shouldCompact**(`_blocks`): `boolean`

Defined in: [writer/src/strategies/compaction-strategy.ts:317](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L317)

Check if compaction should be performed

#### Parameters

##### \_blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

#### Returns

`boolean`

#### Implementation of

[`ICompactionStrategy`](../interfaces/ICompactionStrategy.md).[`shouldCompact`](../interfaces/ICompactionStrategy.md#shouldcompact)

***

### selectBlocks()

> **selectBlocks**(`_blocks`): [`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Defined in: [writer/src/strategies/compaction-strategy.ts:321](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L321)

Select blocks for compaction

#### Parameters

##### \_blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

#### Returns

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Blocks selected for compaction (empty if none)

#### Implementation of

[`ICompactionStrategy`](../interfaces/ICompactionStrategy.md).[`selectBlocks`](../interfaces/ICompactionStrategy.md#selectblocks)

***

### compact()

> **compact**(`_blocks`, `_newSeq`): `Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

Defined in: [writer/src/strategies/compaction-strategy.ts:325](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L325)

Perform compaction on selected blocks

#### Parameters

##### \_blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

##### \_newSeq

`number`

#### Returns

`Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

#### Implementation of

[`ICompactionStrategy`](../interfaces/ICompactionStrategy.md).[`compact`](../interfaces/ICompactionStrategy.md#compact)

***

### getMetrics()

> **getMetrics**(`blocks`): [`CompactionMetrics`](../interfaces/CompactionMetrics.md)

Defined in: [writer/src/strategies/compaction-strategy.ts:335](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L335)

Get compaction metrics

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Current block index

#### Returns

[`CompactionMetrics`](../interfaces/CompactionMetrics.md)

#### Implementation of

[`ICompactionStrategy`](../interfaces/ICompactionStrategy.md).[`getMetrics`](../interfaces/ICompactionStrategy.md#getmetrics)
