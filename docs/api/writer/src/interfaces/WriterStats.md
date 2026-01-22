[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / WriterStats

# Interface: WriterStats

Defined in: [writer/src/types.ts:394](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L394)

Comprehensive writer statistics

## Properties

### buffer

> **buffer**: [`BufferStats`](BufferStats.md)

Defined in: [writer/src/types.ts:396](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L396)

Buffer statistics

***

### partitionMode

> **partitionMode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/types.ts:399](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L399)

Partition mode in use

***

### blocks

> **blocks**: `object`

Defined in: [writer/src/types.ts:402](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L402)

Block statistics

#### r2BlockCount

> **r2BlockCount**: `number`

Total blocks written to R2

#### pendingBlockCount

> **pendingBlockCount**: `number`

Total blocks in DO storage (pending)

#### smallBlockCount

> **smallBlockCount**: `number`

Small blocks eligible for compaction

#### totalRows

> **totalRows**: `number`

Total rows written

#### totalBytesR2

> **totalBytesR2**: `number`

Total bytes written to R2

#### maxBlockIndexSize

> **maxBlockIndexSize**: `number`

Maximum block index size limit

#### evictionPolicy

> **evictionPolicy**: [`BlockIndexEvictionPolicy`](../type-aliases/BlockIndexEvictionPolicy.md)

Current eviction policy

#### evictedCount

> **evictedCount**: `number`

Number of blocks evicted from index

***

### operations

> **operations**: `object`

Defined in: [writer/src/types.ts:422](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L422)

Operation statistics

#### cdcEntriesReceived

> **cdcEntriesReceived**: `number`

Total CDC entries received

#### flushCount

> **flushCount**: `number`

Total flushes performed

#### compactCount

> **compactCount**: `number`

Total compactions performed

#### r2WriteFailures

> **r2WriteFailures**: `number`

Total R2 write failures

#### retryCount

> **retryCount**: `number`

Total retries performed

***

### timing

> **timing**: `object`

Defined in: [writer/src/types.ts:436](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L436)

Timing statistics

#### lastFlushTime

> **lastFlushTime**: `number`

Last flush time

#### lastCompactTime

> **lastCompactTime**: `number`

Last compaction time

#### avgFlushDurationMs

> **avgFlushDurationMs**: `number`

Average flush duration (ms)

#### avgCompactDurationMs

> **avgCompactDurationMs**: `number`

Average compaction duration (ms)

***

### sources

> **sources**: `Map`\<`string`, [`SourceStats`](SourceStats.md)\>

Defined in: [writer/src/types.ts:448](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L448)

Per-source statistics
