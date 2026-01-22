[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / CDCBufferStrategy

# Interface: CDCBufferStrategy

Defined in: [writer/src/strategies/interfaces.ts:28](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L28)

Strategy for buffering CDC entries before flush

## Methods

### append()

> **append**(`sourceDoId`, `entries`): `boolean`

Defined in: [writer/src/strategies/interfaces.ts:35](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L35)

Append entries from a source to the buffer

#### Parameters

##### sourceDoId

`string`

Source DO identifier

##### entries

[`WalEntry`](WalEntry.md)[]

WAL entries to append

#### Returns

`boolean`

true if buffer should be flushed

***

### flush()

> **flush**(): `object`

Defined in: [writer/src/strategies/interfaces.ts:41](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L41)

Flush the buffer and return all entries

#### Returns

`object`

Buffered entries and their state

##### entries

> **entries**: [`WalEntry`](WalEntry.md)[]

##### state

> **state**: [`BufferState`](BufferState.md)

***

### stats()

> **stats**(): [`BufferStats`](BufferStats.md)

Defined in: [writer/src/strategies/interfaces.ts:46](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L46)

Get current buffer statistics

#### Returns

[`BufferStats`](BufferStats.md)

***

### clear()

> **clear**(): `void`

Defined in: [writer/src/strategies/interfaces.ts:51](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L51)

Clear the buffer without returning entries

#### Returns

`void`

***

### isEmpty()

> **isEmpty**(): `boolean`

Defined in: [writer/src/strategies/interfaces.ts:56](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L56)

Check if buffer is empty

#### Returns

`boolean`

***

### shouldFlush()

> **shouldFlush**(): `boolean`

Defined in: [writer/src/strategies/interfaces.ts:61](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L61)

Check if buffer should be flushed based on thresholds

#### Returns

`boolean`

***

### getTimeToFlush()

> **getTimeToFlush**(): `number`

Defined in: [writer/src/strategies/interfaces.ts:66](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L66)

Get time until next scheduled flush (ms), or null if empty

#### Returns

`number`

***

### getSourceCursors()

> **getSourceCursors**(): `Map`\<`string`, `bigint`\>

Defined in: [writer/src/strategies/interfaces.ts:71](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/interfaces.ts#L71)

Get source cursors for acknowledgment tracking

#### Returns

`Map`\<`string`, `bigint`\>
