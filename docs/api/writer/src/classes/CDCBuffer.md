[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / CDCBuffer

# Class: CDCBuffer

Defined in: [writer/src/buffer.ts:120](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L120)

CDC Buffer for accumulating WAL entries before block write.

Thread Safety: This class is designed to be used in a single-threaded
environment (like Cloudflare Workers Durable Objects). The add() method
is synchronous and maintains cursor consistency through atomic operations.

IMPORTANT: Do not introduce await points between reading and updating
sourceCursors. If async operations are needed, use the updateSourceCursor()
method which provides an atomic compare-and-set operation.

## Constructors

### Constructor

> **new CDCBuffer**(`options`): `CDCBuffer`

Defined in: [writer/src/buffer.ts:141](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L141)

#### Parameters

##### options

[`BufferOptions`](../interfaces/BufferOptions.md)

#### Returns

`CDCBuffer`

## Methods

### setLsnUpdateLogger()

> **setLsnUpdateLogger**(`logger`): `void`

Defined in: [writer/src/buffer.ts:152](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L152)

Set a callback function to be notified of all LSN cursor update attempts.
This is useful for debugging and monitoring cursor updates.

#### Parameters

##### logger

`LsnUpdateLogger`

Callback function called on each cursor update attempt

#### Returns

`void`

***

### getLastCursorUpdate()

> **getLastCursorUpdate**(`sourceDoId`): `CursorUpdateRecord`

Defined in: [writer/src/buffer.ts:163](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L163)

Get the last cursor update record for a source.
Returns undefined if no updates have been made for this source.

#### Parameters

##### sourceDoId

`string`

The source DO identifier

#### Returns

`CursorUpdateRecord`

The last cursor update record or undefined

***

### compareAndSetCursor()

> **compareAndSetCursor**(`sourceDoId`, `expectedLsn`, `newLsn`): `boolean`

Defined in: [writer/src/buffer.ts:230](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L230)

Atomic compare-and-set operation for source cursor.
Only updates the cursor if the current value matches the expected value
AND the new value is greater than the current value.

This is useful for external coordination where the caller needs to
ensure they are updating from a known state.

#### Parameters

##### sourceDoId

`string`

The source DO identifier

##### expectedLsn

`bigint`

The expected current cursor value (undefined for new sources)

##### newLsn

`bigint`

The new LSN to set if conditions are met

#### Returns

`boolean`

true if cursor was updated, false otherwise

#### Throws

Error if newLsn is negative (invalid LSN)

***

### fromWriterOptions()

> `static` **fromWriterOptions**(`options`): `CDCBuffer`

Defined in: [writer/src/buffer.ts:299](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L299)

Create a buffer from resolved writer options

#### Parameters

##### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

#### Returns

`CDCBuffer`

***

### add()

> **add**(`sourceDoId`, `entries`): `void`

Defined in: [writer/src/buffer.ts:319](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L319)

Add WAL entries from a source.

This method is synchronous and safe for concurrent calls in a single-threaded
environment. The cursor update uses an atomic compare-and-set pattern to ensure
monotonicity even if entries arrive out of order.

#### Parameters

##### sourceDoId

`string`

The source DO identifier

##### entries

[`WalEntry`](../interfaces/WalEntry.md)[]

WAL entries to add (must be non-empty for any effect)

#### Returns

`void`

#### Throws

if adding entries would exceed maxBufferSize

***

### shouldFlush()

> **shouldFlush**(): `boolean`

Defined in: [writer/src/buffer.ts:377](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L377)

Check if buffer should be flushed

#### Returns

`boolean`

***

### getStats()

> **getStats**(): [`BufferStats`](../interfaces/BufferStats.md)

Defined in: [writer/src/buffer.ts:404](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L404)

Get buffer statistics

#### Returns

[`BufferStats`](../interfaces/BufferStats.md)

***

### getState()

> **getState**(): [`BufferState`](../interfaces/BufferState.md)

Defined in: [writer/src/buffer.ts:419](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L419)

Get current buffer state

#### Returns

[`BufferState`](../interfaces/BufferState.md)

***

### drain()

> **drain**(): `object`

Defined in: [writer/src/buffer.ts:433](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L433)

Drain the buffer (returns entries and clears buffer)

#### Returns

`object`

##### entries

> **entries**: [`WalEntry`](../interfaces/WalEntry.md)[]

##### state

> **state**: [`BufferState`](../interfaces/BufferState.md)

***

### isEmpty()

> **isEmpty**(): `boolean`

Defined in: [writer/src/buffer.ts:451](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L451)

Check if buffer is empty

#### Returns

`boolean`

***

### size()

> **size**(): `number`

Defined in: [writer/src/buffer.ts:458](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L458)

Get the number of entries

#### Returns

`number`

***

### getEstimatedSize()

> **getEstimatedSize**(): `number`

Defined in: [writer/src/buffer.ts:465](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L465)

Get estimated size in bytes

#### Returns

`number`

***

### getSourceCursors()

> **getSourceCursors**(): `Map`\<`string`, `bigint`\>

Defined in: [writer/src/buffer.ts:472](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L472)

Get source cursors for acknowledgment

#### Returns

`Map`\<`string`, `bigint`\>

***

### acknowledgeSource()

> **acknowledgeSource**(`_sourceDoId`): `void`

Defined in: [writer/src/buffer.ts:479](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L479)

Clear source cursor after acknowledgment

#### Parameters

##### \_sourceDoId

`string`

#### Returns

`void`

***

### getTimeToFlush()

> **getTimeToFlush**(): `number`

Defined in: [writer/src/buffer.ts:487](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L487)

Get time until next timeout flush (ms)
Returns null if buffer is empty

#### Returns

`number`

***

### getLsnRange()

> **getLsnRange**(): `object`

Defined in: [writer/src/buffer.ts:499](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L499)

Get the LSN range of buffered entries

#### Returns

`object`

##### min

> **min**: `bigint`

##### max

> **max**: `bigint`
