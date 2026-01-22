[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / LakehouseWriter

# Class: LakehouseWriter

Defined in: [writer/src/writer.ts:80](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L80)

LakehouseWriter - Coordinates CDC buffering and block writing

Supports two modes:
1. Simple mode: Pass options and let the writer create default strategies
2. DI mode: Pass custom strategies for testing or advanced configurations

## Constructors

### Constructor

> **new LakehouseWriter**(`options`, `deps?`): `LakehouseWriter`

Defined in: [writer/src/writer.ts:125](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L125)

Create a LakehouseWriter

#### Parameters

##### options

`Partial`\<[`WriterOptions`](../interfaces/WriterOptions.md)\> & `Pick`\<[`WriterOptions`](../interfaces/WriterOptions.md), `"r2Bucket"` \| `"tableLocation"`\>

Writer configuration (r2Bucket and tableLocation required)

##### deps?

[`LakehouseWriterDeps`](../interfaces/LakehouseWriterDeps.md)

Optional dependency injection for strategies

#### Returns

`LakehouseWriter`

## Methods

### withStrategies()

> `static` **withStrategies**(`options`, `deps`): `LakehouseWriter`

Defined in: [writer/src/writer.ts:153](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L153)

Factory method for creating a writer with custom strategies

#### Parameters

##### options

`Partial`\<[`WriterOptions`](../interfaces/WriterOptions.md)\> & `Pick`\<[`WriterOptions`](../interfaces/WriterOptions.md), `"r2Bucket"` \| `"tableLocation"`\>

##### deps

[`LakehouseWriterDeps`](../interfaces/LakehouseWriterDeps.md)

#### Returns

`LakehouseWriter`

***

### getPartitionMode()

> **getPartitionMode**(): [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/writer.ts:163](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L163)

Get the partition mode

#### Returns

[`PartitionMode`](../type-aliases/PartitionMode.md)

***

### setDOStorage()

> **setDOStorage**(`storage`): `void`

Defined in: [writer/src/writer.ts:170](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L170)

Set DO storage for fallback writes

#### Parameters

##### storage

[`DOStorage`](../interfaces/DOStorage.md)

#### Returns

`void`

***

### loadState()

> **loadState**(): `Promise`\<`void`\>

Defined in: [writer/src/writer.ts:177](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L177)

Load persistent state from DO storage

#### Returns

`Promise`\<`void`\>

***

### saveState()

> **saveState**(): `Promise`\<`void`\>

Defined in: [writer/src/writer.ts:212](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L212)

Save persistent state to DO storage
Wraps serialization in try/catch to prevent state loss on serialization failures.

#### Returns

`Promise`\<`void`\>

***

### receiveCDC()

> **receiveCDC**(`sourceDoId`, `entries`): `Promise`\<`void`\>

Defined in: [writer/src/writer.ts:254](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L254)

Receive CDC entries from a child DO

#### Parameters

##### sourceDoId

`string`

##### entries

[`WalEntry`](../interfaces/WalEntry.md)[]

#### Returns

`Promise`\<`void`\>

#### Throws

Error if sourceDoId is null/undefined or empty

***

### shouldApplyBackpressure()

> **shouldApplyBackpressure**(): `boolean`

Defined in: [writer/src/writer.ts:300](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L300)

Check if backpressure should be applied

#### Returns

`boolean`

***

### getBackpressureDelay()

> **getBackpressureDelay**(): `number`

Defined in: [writer/src/writer.ts:307](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L307)

Get suggested backpressure delay

#### Returns

`number`

***

### flush()

> **flush**(): `Promise`\<[`FlushResult`](../interfaces/FlushResult.md)\>

Defined in: [writer/src/writer.ts:314](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L314)

Flush buffer to R2

#### Returns

`Promise`\<[`FlushResult`](../interfaces/FlushResult.md)\>

***

### retryPendingBlocks()

> **retryPendingBlocks**(): `Promise`\<\{ `succeeded`: `number`; `failed`: `number`; \}\>

Defined in: [writer/src/writer.ts:445](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L445)

Retry pending blocks (from DO storage to R2)

#### Returns

`Promise`\<\{ `succeeded`: `number`; `failed`: `number`; \}\>

***

### compact()

> **compact**(): `Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

Defined in: [writer/src/writer.ts:512](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L512)

Run compaction if needed

#### Returns

`Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

***

### forceCompact()

> **forceCompact**(): `Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

Defined in: [writer/src/writer.ts:553](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L553)

Force compaction regardless of thresholds

#### Returns

`Promise`\<[`CompactResult`](../interfaces/CompactResult.md)\>

***

### getStats()

> **getStats**(): [`WriterStats`](../interfaces/WriterStats.md)

Defined in: [writer/src/writer.ts:578](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L578)

Get writer statistics

#### Returns

[`WriterStats`](../interfaces/WriterStats.md)

***

### getTimeToFlush()

> **getTimeToFlush**(): `number`

Defined in: [writer/src/writer.ts:625](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L625)

Get time until buffer should be flushed

#### Returns

`number`

***

### shouldFlush()

> **shouldFlush**(): `boolean`

Defined in: [writer/src/writer.ts:632](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L632)

Check if buffer should be flushed

#### Returns

`boolean`

***

### getBlockIndex()

> **getBlockIndex**(): [`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Defined in: [writer/src/writer.ts:639](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L639)

Get block index for queries

#### Returns

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

***

### getPendingBlockCount()

> **getPendingBlockCount**(): `number`

Defined in: [writer/src/writer.ts:646](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L646)

Get pending block count

#### Returns

`number`

***

### markSourceDisconnected()

> **markSourceDisconnected**(`sourceDoId`): `void`

Defined in: [writer/src/writer.ts:653](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L653)

Mark a source as disconnected

#### Parameters

##### sourceDoId

`string`

#### Returns

`void`

***

### getSourceStats()

> **getSourceStats**(`sourceDoId`): [`SourceStats`](../interfaces/SourceStats.md)

Defined in: [writer/src/writer.ts:663](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L663)

Get source statistics

#### Parameters

##### sourceDoId

`string`

#### Returns

[`SourceStats`](../interfaces/SourceStats.md)

***

### getConnectedSources()

> **getConnectedSources**(): `string`[]

Defined in: [writer/src/writer.ts:670](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L670)

Get all connected sources

#### Returns

`string`[]

***

### getNextAlarmTime()

> **getNextAlarmTime**(): `number`

Defined in: [writer/src/writer.ts:683](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L683)

Get next alarm time (for DO alarm)

#### Returns

`number`

***

### getR2Writer()

> **getR2Writer**(): [`R2BlockWriter`](R2BlockWriter.md)

Defined in: [writer/src/writer.ts:708](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L708)

Get the R2 writer instance (for advanced use)

#### Returns

[`R2BlockWriter`](R2BlockWriter.md)

***

### getCompactor()

> **getCompactor**(): [`BlockCompactor`](BlockCompactor.md)

Defined in: [writer/src/writer.ts:715](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L715)

Get the compactor instance (for advanced use)

#### Returns

[`BlockCompactor`](BlockCompactor.md)

***

### getCompactionMetrics()

> **getCompactionMetrics**(): `object`

Defined in: [writer/src/writer.ts:722](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L722)

Get compaction metrics

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

***

### getCompactionSchedulerStatus()

> **getCompactionSchedulerStatus**(): `object`

Defined in: [writer/src/writer.ts:729](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L729)

Get compaction scheduler status

#### Returns

`object`

##### running

> **running**: `boolean`

##### lastCompactionTime

> **lastCompactionTime**: `number`

##### consecutiveFailures

> **consecutiveFailures**: `number`

##### partitionMode

> **partitionMode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

***

### getBufferStrategy()

> **getBufferStrategy**(): [`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md)

Defined in: [writer/src/writer.ts:740](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L740)

Get the buffer strategy (new pattern)

#### Returns

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md)

***

### getBlockWriter()

> **getBlockWriter**(): [`BlockWriter`](../interfaces/BlockWriter.md)

Defined in: [writer/src/writer.ts:747](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L747)

Get the block writer strategy (new pattern)

#### Returns

[`BlockWriter`](../interfaces/BlockWriter.md)

***

### getCompactionStrategy()

> **getCompactionStrategy**(): [`ICompactionStrategy`](../interfaces/ICompactionStrategy.md)

Defined in: [writer/src/writer.ts:754](https://github.com/dot-do/evodb/blob/main/writer/src/writer.ts#L754)

Get the compaction strategy (new pattern)

#### Returns

[`ICompactionStrategy`](../interfaces/ICompactionStrategy.md)
