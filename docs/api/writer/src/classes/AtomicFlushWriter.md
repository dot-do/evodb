[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / AtomicFlushWriter

# Class: AtomicFlushWriter

Defined in: [writer/src/atomic-flush.ts:123](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L123)

AtomicFlushWriter provides crash-safe block writes using a WAL pattern

## Constructors

### Constructor

> **new AtomicFlushWriter**(`r2Bucket`, `options`): `AtomicFlushWriter`

Defined in: [writer/src/atomic-flush.ts:129](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L129)

#### Parameters

##### r2Bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### options

[`AtomicFlushWriterOptions`](../interfaces/AtomicFlushWriterOptions.md)

#### Returns

`AtomicFlushWriter`

## Methods

### setDOStorage()

> **setDOStorage**(`storage`): `void`

Defined in: [writer/src/atomic-flush.ts:140](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L140)

Set DO storage for persistence

#### Parameters

##### storage

`DOStorage`

#### Returns

`void`

***

### prepareFlush()

> **prepareFlush**(`entries`, `minLsn`, `maxLsn`, `seq`): `Promise`\<[`AtomicFlushResult`](../type-aliases/AtomicFlushResult.md)\>

Defined in: [writer/src/atomic-flush.ts:318](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L318)

Phase 1: Prepare a flush (write pending record, then write to R2)

#### Parameters

##### entries

[`WalEntry`](../interfaces/WalEntry.md)[]

##### minLsn

`bigint`

##### maxLsn

`bigint`

##### seq

`number`

#### Returns

`Promise`\<[`AtomicFlushResult`](../type-aliases/AtomicFlushResult.md)\>

***

### commitFlush()

> **commitFlush**(`flushId`): `Promise`\<`boolean`\>

Defined in: [writer/src/atomic-flush.ts:408](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L408)

Phase 2: Commit a flush (mark as committed, remove from pending)

#### Parameters

##### flushId

`string`

#### Returns

`Promise`\<`boolean`\>

***

### rollbackFlush()

> **rollbackFlush**(`flushId`): `Promise`\<`boolean`\>

Defined in: [writer/src/atomic-flush.ts:432](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L432)

Rollback a prepared flush (delete R2 block, remove from pending)

#### Parameters

##### flushId

`string`

#### Returns

`Promise`\<`boolean`\>

***

### atomicFlush()

> **atomicFlush**(`entries`, `minLsn`, `maxLsn`, `seq`): `Promise`\<[`AtomicFlushResult`](../type-aliases/AtomicFlushResult.md)\>

Defined in: [writer/src/atomic-flush.ts:462](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L462)

Atomic flush: prepare and commit in one operation

#### Parameters

##### entries

[`WalEntry`](../interfaces/WalEntry.md)[]

##### minLsn

`bigint`

##### maxLsn

`bigint`

##### seq

`number`

#### Returns

`Promise`\<[`AtomicFlushResult`](../type-aliases/AtomicFlushResult.md)\>

***

### recoverPendingFlushes()

> **recoverPendingFlushes**(): `Promise`\<[`FlushRecoveryResult`](../interfaces/FlushRecoveryResult.md)\>

Defined in: [writer/src/atomic-flush.ts:496](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L496)

Recover pending flushes after a crash

#### Returns

`Promise`\<[`FlushRecoveryResult`](../interfaces/FlushRecoveryResult.md)\>

***

### getCommittedBlocks()

> **getCommittedBlocks**(): [`BlockMetadata`](../interfaces/BlockMetadata.md)[]

Defined in: [writer/src/atomic-flush.ts:593](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L593)

Get committed blocks for manifest integration

#### Returns

[`BlockMetadata`](../interfaces/BlockMetadata.md)[]

***

### clearCommittedBlocks()

> **clearCommittedBlocks**(): `void`

Defined in: [writer/src/atomic-flush.ts:600](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L600)

Clear committed blocks after manifest update

#### Returns

`void`

***

### hasPendingFlushes()

> **hasPendingFlushes**(): `Promise`\<`boolean`\>

Defined in: [writer/src/atomic-flush.ts:607](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L607)

Check if there are pending flushes

#### Returns

`Promise`\<`boolean`\>

***

### getPendingFlushCount()

> **getPendingFlushCount**(): `Promise`\<`number`\>

Defined in: [writer/src/atomic-flush.ts:615](https://github.com/dot-do/evodb/blob/main/writer/src/atomic-flush.ts#L615)

Get count of pending flushes

#### Returns

`Promise`\<`number`\>
