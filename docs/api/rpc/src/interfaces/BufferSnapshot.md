[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / BufferSnapshot

# Interface: BufferSnapshot

Defined in: [rpc/src/buffer.ts:1182](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L1182)

Snapshot of buffer state for serialization

## Properties

### batches

> **batches**: `object`[]

Defined in: [rpc/src/buffer.ts:1183](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L1183)

#### batchId

> **batchId**: `string`

#### sourceDoId

> **sourceDoId**: `string`

#### sourceShardName?

> `optional` **sourceShardName**: `string`

#### entries

> **entries**: [`WalEntry`](../type-aliases/WalEntry.md)[]

#### receivedAt

> **receivedAt**: `number`

#### sequenceNumber

> **sequenceNumber**: `number`

#### persisted

> **persisted**: `boolean`

#### inFallback

> **inFallback**: `boolean`

#### sizeBytes

> **sizeBytes**: `number`

***

### childStates

> **childStates**: `object`[]

Defined in: [rpc/src/buffer.ts:1194](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L1194)

#### childDoId

> **childDoId**: `string`

#### childShardName?

> `optional` **childShardName**: `string`

#### lastReceivedSequence

> **lastReceivedSequence**: `number`

#### lastAckedSequence

> **lastAckedSequence**: `number`

#### connectedAt

> **connectedAt**: `number`

#### lastActivityAt

> **lastActivityAt**: `number`

#### batchesReceived

> **batchesReceived**: `number`

#### entriesReceived

> **entriesReceived**: `number`

***

### totalSizeBytes

> **totalSizeBytes**: `number`

Defined in: [rpc/src/buffer.ts:1204](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L1204)

***

### totalEntryCount

> **totalEntryCount**: `number`

Defined in: [rpc/src/buffer.ts:1205](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L1205)

***

### lastFlushTime

> **lastFlushTime**: `number`

Defined in: [rpc/src/buffer.ts:1206](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L1206)

***

### dedupState?

> `optional` **dedupState**: `object`

Defined in: [rpc/src/buffer.ts:1208](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L1208)

Deduplication state for persistence across hibernation

#### batchSeen

> **batchSeen**: \[`string`, \[`number`, `number`\][]\][]

#### entrySeen

> **entrySeen**: \[`string`, \[`number`, `number`\][]\][]
