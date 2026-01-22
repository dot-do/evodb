[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / TimeBasedCompaction

# Class: TimeBasedCompaction

Defined in: [writer/src/strategies/compaction-strategy.ts:128](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L128)

Compaction strategy that merges blocks based on creation time
Older blocks get priority for compaction (FIFO)

## Implements

- [`ICompactionStrategy`](../interfaces/ICompactionStrategy.md)

## Constructors

### Constructor

> **new TimeBasedCompaction**(`r2Bucket`, `tableLocation`, `options`): `TimeBasedCompaction`

Defined in: [writer/src/strategies/compaction-strategy.ts:132](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L132)

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### tableLocation

`string`

##### options

`Partial`\<[`CompactionStrategyOptions`](../interfaces/CompactionStrategyOptions.md)\> = `{}`

#### Returns

`TimeBasedCompaction`

## Methods

### fromWriterOptions()

> `static` **fromWriterOptions**(`r2Bucket`, `options`): `TimeBasedCompaction`

Defined in: [writer/src/strategies/compaction-strategy.ts:161](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L161)

Create from resolved writer options

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

#### Returns

`TimeBasedCompaction`

***

### shouldCompact()

> **shouldCompact**(`blocks`): `boolean`

Defined in: [writer/src/strategies/compaction-strategy.ts:172](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L172)

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

Defined in: [writer/src/strategies/compaction-strategy.ts:176](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L176)

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

Defined in: [writer/src/strategies/compaction-strategy.ts:180](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L180)

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

Defined in: [writer/src/strategies/compaction-strategy.ts:184](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L184)

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

Defined in: [writer/src/strategies/compaction-strategy.ts:199](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L199)

Get the underlying BlockCompactor for advanced operations

#### Returns

[`BlockCompactor`](BlockCompactor.md)

***

### getPartitionMode()

> **getPartitionMode**(): [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/strategies/compaction-strategy.ts:206](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/compaction-strategy.ts#L206)

Get the partition mode

#### Returns

[`PartitionMode`](../type-aliases/PartitionMode.md)
