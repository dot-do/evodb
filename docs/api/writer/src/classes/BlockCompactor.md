[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BlockCompactor

# Class: BlockCompactor

Defined in: [writer/src/compactor.ts:87](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L87)

Block Compactor for merging small blocks

## Constructors

### Constructor

> **new BlockCompactor**(`r2Bucket`, `tableLocation`, `config?`, `writerOptions?`): `BlockCompactor`

Defined in: [writer/src/compactor.ts:92](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L92)

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### tableLocation

`string`

##### config?

`Partial`\<[`CompactionConfig`](../interfaces/CompactionConfig.md)\>

##### writerOptions?

`Pick`\<[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md), `"schemaId"` \| `"maxRetries"` \| `"retryBackoffMs"` \| `"partitionMode"`\>

#### Returns

`BlockCompactor`

## Methods

### fromWriterOptions()

> `static` **fromWriterOptions**(`r2Bucket`, `options`): `BlockCompactor`

Defined in: [writer/src/compactor.ts:117](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L117)

Create compactor from resolved writer options

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

#### Returns

`BlockCompactor`

***

### getPartitionMode()

> **getPartitionMode**(): [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/compactor.ts:141](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L141)

Get the partition mode

#### Returns

[`PartitionMode`](../type-aliases/PartitionMode.md)

***

### shouldCompact()

> **shouldCompact**(`blocks`): `boolean`

Defined in: [writer/src/compactor.ts:148](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L148)

Check if compaction is needed

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

#### Returns

`boolean`

***

### selectSmallBlocks()

> **selectSmallBlocks**(`blocks`): [`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Defined in: [writer/src/compactor.ts:156](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L156)

Select small blocks eligible for compaction

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

#### Returns

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

***

### selectBlocksForCompaction()

> **selectBlocksForCompaction**(`blocks`): [`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Defined in: [writer/src/compactor.ts:163](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L163)

Select blocks for a compaction run

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

#### Returns

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

***

### compact()

> **compact**(`blocks`, `newSeq`): `Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

Defined in: [writer/src/compactor.ts:222](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L222)

Perform compaction on selected blocks

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

##### newSeq

`number`

#### Returns

`Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

***

### estimateSavings()

> **estimateSavings**(`blocks`): `object`

Defined in: [writer/src/compactor.ts:420](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L420)

Estimate size savings from compaction

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

#### Returns

`object`

##### currentSize

> **currentSize**: `number`

##### estimatedNewSize

> **estimatedNewSize**: `number`

##### estimatedSavings

> **estimatedSavings**: `number`

##### savingsPercent

> **savingsPercent**: `number`

***

### getMetrics()

> **getMetrics**(`blocks`): `object`

Defined in: [writer/src/compactor.ts:444](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L444)

Get compaction metrics for monitoring

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

#### Returns

`object`

##### totalBlocks

> **totalBlocks**: `number`

##### smallBlocks

> **smallBlocks**: `number`

##### compactedBlocks

> **compactedBlocks**: `number`

##### eligibleForCompaction

> **eligibleForCompaction**: `boolean`

##### partitionMode

> **partitionMode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

##### targetSize

> **targetSize**: `number`

##### maxSize

> **maxSize**: `number`
