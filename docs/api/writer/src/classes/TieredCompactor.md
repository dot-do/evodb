[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / TieredCompactor

# Class: TieredCompactor

Defined in: [writer/src/compactor.ts:612](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L612)

Tiered compaction strategy for partition modes
Automatically promotes blocks through size tiers

## Constructors

### Constructor

> **new TieredCompactor**(`r2Bucket`, `tableLocation`, `writerOptions?`): `TieredCompactor`

Defined in: [writer/src/compactor.ts:615](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L615)

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### tableLocation

`string`

##### writerOptions?

`Pick`\<[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md), `"schemaId"` \| `"maxRetries"` \| `"retryBackoffMs"`\>

#### Returns

`TieredCompactor`

## Methods

### getCompactorForBlocks()

> **getCompactorForBlocks**(`blocks`): [`BlockCompactor`](BlockCompactor.md)

Defined in: [writer/src/compactor.ts:638](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L638)

Get the appropriate compactor for a set of blocks

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

#### Returns

[`BlockCompactor`](BlockCompactor.md)

***

### compact()

> **compact**(`blocks`, `getNextSeq`): `Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

Defined in: [writer/src/compactor.ts:654](https://github.com/dot-do/evodb/blob/main/writer/src/compactor.ts#L654)

Run tiered compaction

#### Parameters

##### blocks

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

##### getNextSeq

() => `number`

#### Returns

`Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>
