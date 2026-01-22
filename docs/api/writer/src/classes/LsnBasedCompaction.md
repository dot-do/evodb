[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / LsnBasedCompaction

# Class: LsnBasedCompaction

Defined in: [writer/src/strategies/compaction-strategy.ts:218](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L218)

Compaction strategy that maintains LSN order during merges

## Implements

- [`ICompactionStrategy`](../interfaces/ICompactionStrategy.md)

## Constructors

### Constructor

> **new LsnBasedCompaction**(`r2Bucket`, `tableLocation`, `options`): `LsnBasedCompaction`

Defined in: [writer/src/strategies/compaction-strategy.ts:222](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L222)

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### tableLocation

`string`

##### options

`Partial`\<[`CompactionStrategyOptions`](../interfaces/CompactionStrategyOptions.md)\> = `{}`

#### Returns

`LsnBasedCompaction`

## Methods

### fromWriterOptions()

> `static` **fromWriterOptions**(`r2Bucket`, `options`): `LsnBasedCompaction`

Defined in: [writer/src/strategies/compaction-strategy.ts:251](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L251)

Create from resolved writer options

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

#### Returns

`LsnBasedCompaction`

***

### shouldCompact()

> **shouldCompact**(`blocks`): `boolean`

Defined in: [writer/src/strategies/compaction-strategy.ts:262](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L262)

Check if compaction should be performed

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Current block index

#### Returns

`boolean`

#### Implementation of

[`ICompactionStrategy`](../interfaces/ICompactionStrategy.md).[`shouldCompact`](../interfaces/ICompactionStrategy.md#shouldcompact)

***

### selectBlocks()

> **selectBlocks**(`blocks`): [`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Defined in: [writer/src/strategies/compaction-strategy.ts:266](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L266)

Select blocks for compaction

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Current block index

#### Returns

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Blocks selected for compaction (empty if none)

#### Implementation of

[`ICompactionStrategy`](../interfaces/ICompactionStrategy.md).[`selectBlocks`](../interfaces/ICompactionStrategy.md#selectblocks)

***

### compact()

> **compact**(`blocks`, `newSeq`): `Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

Defined in: [writer/src/strategies/compaction-strategy.ts:270](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L270)

Perform compaction on selected blocks

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Blocks to compact

##### newSeq

`number`

Sequence number for the new block

#### Returns

`Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

#### Implementation of

[`ICompactionStrategy`](../interfaces/ICompactionStrategy.md).[`compact`](../interfaces/ICompactionStrategy.md#compact)

***

### getMetrics()

> **getMetrics**(`blocks`): [`CompactionMetrics`](../interfaces/CompactionMetrics.md)

Defined in: [writer/src/strategies/compaction-strategy.ts:274](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L274)

Get compaction metrics

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Current block index

#### Returns

[`CompactionMetrics`](../interfaces/CompactionMetrics.md)

#### Implementation of

[`ICompactionStrategy`](../interfaces/ICompactionStrategy.md).[`getMetrics`](../interfaces/ICompactionStrategy.md#getmetrics)

***

### getCompactor()

> **getCompactor**(): [`BlockCompactor`](BlockCompactor.md)

Defined in: [writer/src/strategies/compaction-strategy.ts:289](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L289)

Get the underlying BlockCompactor for advanced operations

#### Returns

[`BlockCompactor`](BlockCompactor.md)

***

### getPartitionMode()

> **getPartitionMode**(): [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/strategies/compaction-strategy.ts:296](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L296)

Get the partition mode

#### Returns

[`PartitionMode`](../type-aliases/PartitionMode.md)
