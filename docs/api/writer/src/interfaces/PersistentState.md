[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / PersistentState

# Interface: PersistentState

Defined in: [writer/src/types.ts:522](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L522)

Persistent state stored in DO

## Properties

### lastBlockSeq

> **lastBlockSeq**: `number`

Defined in: [writer/src/types.ts:524](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L524)

Last assigned block sequence number

***

### pendingBlocks

> **pendingBlocks**: `string`[]

Defined in: [writer/src/types.ts:526](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L526)

Pending blocks in DO storage (failed R2 writes)

***

### sourceCursors

> **sourceCursors**: `Record`\<`string`, `string`\>

Defined in: [writer/src/types.ts:528](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L528)

Per-source cursors for acknowledgment

***

### blockIndex

> **blockIndex**: [`BlockMetadata`](BlockMetadata.md)[]

Defined in: [writer/src/types.ts:530](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L530)

Block index for querying

***

### lastSnapshotId

> **lastSnapshotId**: `number`

Defined in: [writer/src/types.ts:532](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L532)

Last snapshot ID

***

### partitionMode

> **partitionMode**: [`PartitionMode`](../type-aliases/PartitionMode.md)

Defined in: [writer/src/types.ts:534](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L534)

Partition mode

***

### stats

> **stats**: `object`

Defined in: [writer/src/types.ts:536](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L536)

Writer stats (persisted for recovery)

#### cdcEntriesReceived

> **cdcEntriesReceived**: `number`

#### flushCount

> **flushCount**: `number`

#### compactCount

> **compactCount**: `number`

#### r2WriteFailures

> **r2WriteFailures**: `number`

#### blockIndexEvictions?

> `optional` **blockIndexEvictions**: `number`

Number of blocks evicted from index due to size limits
