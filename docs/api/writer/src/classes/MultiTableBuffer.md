[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / MultiTableBuffer

# Class: MultiTableBuffer

Defined in: [writer/src/buffer.ts:509](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L509)

Multi-table buffer manager
Routes entries to per-table buffers

## Constructors

### Constructor

> **new MultiTableBuffer**(`options`): `MultiTableBuffer`

Defined in: [writer/src/buffer.ts:512](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L512)

#### Parameters

##### options

[`BufferOptions`](../interfaces/BufferOptions.md)

#### Returns

`MultiTableBuffer`

## Methods

### getBuffer()

> **getBuffer**(`tableLocation`): [`CDCBuffer`](CDCBuffer.md)

Defined in: [writer/src/buffer.ts:519](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L519)

Get or create buffer for a table

#### Parameters

##### tableLocation

`string`

#### Returns

[`CDCBuffer`](CDCBuffer.md)

***

### add()

> **add**(`tableLocation`, `sourceDoId`, `entries`): `void`

Defined in: [writer/src/buffer.ts:531](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L531)

Add entries to a specific table's buffer

#### Parameters

##### tableLocation

`string`

##### sourceDoId

`string`

##### entries

[`WalEntry`](../interfaces/WalEntry.md)[]

#### Returns

`void`

***

### getReadyToFlush()

> **getReadyToFlush**(): `string`[]

Defined in: [writer/src/buffer.ts:538](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L538)

Get all tables with buffers ready to flush

#### Returns

`string`[]

***

### getMinTimeToFlush()

> **getMinTimeToFlush**(): `number`

Defined in: [writer/src/buffer.ts:551](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L551)

Get minimum time until any buffer needs flushing

#### Returns

`number`

***

### getAllStats()

> **getAllStats**(): `Map`\<`string`, [`BufferStats`](../interfaces/BufferStats.md)\>

Defined in: [writer/src/buffer.ts:567](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L567)

Get stats for all tables

#### Returns

`Map`\<`string`, [`BufferStats`](../interfaces/BufferStats.md)\>

***

### removeBuffer()

> **removeBuffer**(`tableLocation`): `void`

Defined in: [writer/src/buffer.ts:578](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L578)

Remove buffer for a table (after flush/cleanup)

#### Parameters

##### tableLocation

`string`

#### Returns

`void`

***

### hasData()

> **hasData**(): `boolean`

Defined in: [writer/src/buffer.ts:585](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L585)

Check if any buffer has data

#### Returns

`boolean`

***

### getTotalEntryCount()

> **getTotalEntryCount**(): `number`

Defined in: [writer/src/buffer.ts:595](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L595)

Get total entry count across all buffers

#### Returns

`number`

***

### getTotalEstimatedSize()

> **getTotalEstimatedSize**(): `number`

Defined in: [writer/src/buffer.ts:606](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L606)

Get total estimated size across all buffers

#### Returns

`number`
