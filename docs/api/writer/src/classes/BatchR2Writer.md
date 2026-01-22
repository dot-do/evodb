[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BatchR2Writer

# Class: BatchR2Writer

Defined in: [writer/src/r2-writer.ts:463](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L463)

Batch writer for efficient multi-block writes

## Constructors

### Constructor

> **new BatchR2Writer**(`writer`): `BatchR2Writer`

Defined in: [writer/src/r2-writer.ts:473](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L473)

#### Parameters

##### writer

[`R2BlockWriter`](R2BlockWriter.md)

#### Returns

`BatchR2Writer`

## Accessors

### pendingCount

#### Get Signature

> **get** **pendingCount**(): `number`

Defined in: [writer/src/r2-writer.ts:510](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L510)

Get number of pending writes

##### Returns

`number`

## Methods

### queueWrite()

> **queueWrite**(`entries`, `minLsn`, `maxLsn`, `seq`): `Promise`\<\{ `success`: `true`; `metadata`: [`BlockMetadata`](../interfaces/BlockMetadata.md); \} \| \{ `success`: `false`; `error`: `string`; \}\>

Defined in: [writer/src/r2-writer.ts:480](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L480)

Queue a write (returns promise)

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

`Promise`\<\{ `success`: `true`; `metadata`: [`BlockMetadata`](../interfaces/BlockMetadata.md); \} \| \{ `success`: `false`; `error`: `string`; \}\>

***

### flush()

> **flush**(): `Promise`\<`void`\>

Defined in: [writer/src/r2-writer.ts:494](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L494)

Flush all pending writes (parallel execution)

#### Returns

`Promise`\<`void`\>
