[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / CDCBufferManager

# Class: CDCBufferManager

Defined in: [rpc/src/buffer.ts:495](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L495)

Manages CDC batch buffering for the Parent DO

## Constructors

### Constructor

> **new CDCBufferManager**(`config`): `CDCBufferManager`

Defined in: [rpc/src/buffer.ts:507](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L507)

#### Parameters

##### config

`Partial`\<[`ParentConfig`](../interfaces/ParentConfig.md) & `object`\> = `{}`

#### Returns

`CDCBufferManager`

## Methods

### addBatch()

> **addBatch**(`sourceDoId`, `entries`, `sequenceNumber`, `sourceShardName?`): `object`

Defined in: [rpc/src/buffer.ts:532](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L532)

Add a batch to the buffer

#### Parameters

##### sourceDoId

`string`

##### entries

[`WalEntry`](../type-aliases/WalEntry.md)[]

##### sequenceNumber

`number`

##### sourceShardName?

`string`

#### Returns

`object`

true if added, false if duplicate

##### added

> **added**: `boolean`

##### batchId

> **batchId**: `string`

##### isDuplicate

> **isDuplicate**: `boolean`

#### Throws

BufferOverflowError if buffer is full

***

### addBatchWithEntryDedup()

> **addBatchWithEntryDedup**(`sourceDoId`, `entries`, `sequenceNumber`, `sourceShardName?`): `object`

Defined in: [rpc/src/buffer.ts:608](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L608)

Add a batch with entry-level deduplication

Filters out individual entries that have already been seen,
only adding new entries to the buffer.

#### Parameters

##### sourceDoId

`string`

##### entries

[`WalEntry`](../type-aliases/WalEntry.md)[]

##### sequenceNumber

`number`

##### sourceShardName?

`string`

#### Returns

`object`

Result including how many entries were added vs filtered

##### added

> **added**: `boolean`

##### batchId

> **batchId**: `string`

##### isDuplicate

> **isDuplicate**: `boolean`

##### entriesAdded

> **entriesAdded**: `number`

##### entriesFiltered

> **entriesFiltered**: `number`

***

### getBatchesForFlush()

> **getBatchesForFlush**(): [`BufferedBatch`](../interfaces/BufferedBatch.md)[]

Defined in: [rpc/src/buffer.ts:706](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L706)

Get all batches ready for flush

#### Returns

[`BufferedBatch`](../interfaces/BufferedBatch.md)[]

***

### markPersisted()

> **markPersisted**(`batchIds`): `void`

Defined in: [rpc/src/buffer.ts:713](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L713)

Mark batches as persisted

#### Parameters

##### batchIds

`string`[]

#### Returns

`void`

***

### markInFallback()

> **markInFallback**(`batchIds`): `void`

Defined in: [rpc/src/buffer.ts:725](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L725)

Mark batches as in fallback storage

#### Parameters

##### batchIds

`string`[]

#### Returns

`void`

***

### clearPersisted()

> **clearPersisted**(): `void`

Defined in: [rpc/src/buffer.ts:737](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L737)

Remove persisted and fallback batches from buffer

#### Returns

`void`

***

### getAllEntriesSorted()

> **getAllEntriesSorted**(): [`WalEntry`](../type-aliases/WalEntry.md)[]

Defined in: [rpc/src/buffer.ts:760](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L760)

Get all entries merged and sorted by timestamp

#### Returns

[`WalEntry`](../type-aliases/WalEntry.md)[]

***

### getEntriesBySource()

> **getEntriesBySource**(): `Map`\<`string`, [`WalEntry`](../type-aliases/WalEntry.md)[]\>

Defined in: [rpc/src/buffer.ts:781](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L781)

Get entries grouped by source DO

#### Returns

`Map`\<`string`, [`WalEntry`](../type-aliases/WalEntry.md)[]\>

***

### getEntriesByTable()

> **getEntriesByTable**(): `Map`\<`string`, [`WalEntry`](../type-aliases/WalEntry.md)[]\>

Defined in: [rpc/src/buffer.ts:806](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L806)

Get entries grouped by table

#### Returns

`Map`\<`string`, [`WalEntry`](../type-aliases/WalEntry.md)[]\>

***

### shouldFlush()

> **shouldFlush**(): [`FlushTrigger`](../type-aliases/FlushTrigger.md)

Defined in: [rpc/src/buffer.ts:837](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L837)

Check if a flush should be triggered

#### Returns

[`FlushTrigger`](../type-aliases/FlushTrigger.md)

***

### getTimeUntilFlush()

> **getTimeUntilFlush**(): `number`

Defined in: [rpc/src/buffer.ts:863](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L863)

Get time until next scheduled flush

#### Returns

`number`

***

### getStats()

> **getStats**(): [`BufferStats`](../interfaces/BufferStats.md)

Defined in: [rpc/src/buffer.ts:877](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L877)

Get buffer statistics

#### Returns

[`BufferStats`](../interfaces/BufferStats.md)

***

### getDedupStats()

> **getDedupStats**(): [`DedupStats`](../interfaces/DedupStats.md)

Defined in: [rpc/src/buffer.ts:891](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L891)

Get deduplication statistics

#### Returns

[`DedupStats`](../interfaces/DedupStats.md)

***

### cleanupExpiredDedup()

> **cleanupExpiredDedup**(): `void`

Defined in: [rpc/src/buffer.ts:902](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L902)

Explicitly cleanup expired deduplication entries

This removes entries that are older than the deduplication window (5 minutes).
Entries are automatically cleaned up during addBatch calls, but this method
allows explicit cleanup when needed.

#### Returns

`void`

***

### getChildStates()

> **getChildStates**(): `Map`\<`string`, [`ChildConnectionState`](../interfaces/ChildConnectionState.md)\>

Defined in: [rpc/src/buffer.ts:909](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L909)

Get child connection states

#### Returns

`Map`\<`string`, [`ChildConnectionState`](../interfaces/ChildConnectionState.md)\>

***

### getChildState()

> **getChildState**(`childDoId`): [`ChildConnectionState`](../interfaces/ChildConnectionState.md)

Defined in: [rpc/src/buffer.ts:916](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L916)

Get a specific child's state

#### Parameters

##### childDoId

`string`

#### Returns

[`ChildConnectionState`](../interfaces/ChildConnectionState.md)

***

### updateChildState()

> **updateChildState**(`childDoId`, `entriesReceived`, `lastSequence`, `shardName?`): `void`

Defined in: [rpc/src/buffer.ts:923](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L923)

Update or create child connection state

#### Parameters

##### childDoId

`string`

##### entriesReceived

`number`

##### lastSequence

`number`

##### shardName?

`string`

#### Returns

`void`

***

### registerChildWebSocket()

> **registerChildWebSocket**(`childDoId`, `ws`): `void`

Defined in: [rpc/src/buffer.ts:958](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L958)

Register a WebSocket for a child

#### Parameters

##### childDoId

`string`

##### ws

`WebSocket`

#### Returns

`void`

***

### unregisterChildWebSocket()

> **unregisterChildWebSocket**(`childDoId`): `void`

Defined in: [rpc/src/buffer.ts:968](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L968)

Unregister a child's WebSocket

#### Parameters

##### childDoId

`string`

#### Returns

`void`

***

### removeChild()

> **removeChild**(`childDoId`): `void`

Defined in: [rpc/src/buffer.ts:978](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L978)

Remove child state

#### Parameters

##### childDoId

`string`

#### Returns

`void`

***

### dropOldestOnCritical()

> **dropOldestOnCritical**(): `number`

Defined in: [rpc/src/buffer.ts:992](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L992)

Drop oldest batches when memory utilization is critical

#### Returns

`number`

Number of entries dropped

***

### serialize()

> **serialize**(): [`BufferSnapshot`](../interfaces/BufferSnapshot.md)

Defined in: [rpc/src/buffer.ts:1034](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L1034)

Serialize buffer state for storage during hibernation

Note: This creates a compact representation that can be stored in DO storage

#### Returns

[`BufferSnapshot`](../interfaces/BufferSnapshot.md)

***

### restore()

> `static` **restore**(`snapshot`, `config?`): `CDCBufferManager`

Defined in: [rpc/src/buffer.ts:1067](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L1067)

Restore buffer state from serialized snapshot

#### Parameters

##### snapshot

[`BufferSnapshot`](../interfaces/BufferSnapshot.md)

##### config?

`Partial`\<[`ParentConfig`](../interfaces/ParentConfig.md)\>

#### Returns

`CDCBufferManager`

***

### clear()

> **clear**(): `void`

Defined in: [rpc/src/buffer.ts:1163](https://github.com/dot-do/evodb/blob/main/rpc/src/buffer.ts#L1163)

Clear all batches and state

#### Returns

`void`
