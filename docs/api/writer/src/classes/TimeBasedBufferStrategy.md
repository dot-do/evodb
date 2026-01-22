[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / TimeBasedBufferStrategy

# Class: TimeBasedBufferStrategy

Defined in: [writer/src/strategies/buffer-strategy.ts:158](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L158)

Buffer strategy that flushes based on time thresholds

## Implements

- [`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md)

## Constructors

### Constructor

> **new TimeBasedBufferStrategy**(`maxAgeMs`): `TimeBasedBufferStrategy`

Defined in: [writer/src/strategies/buffer-strategy.ts:166](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L166)

#### Parameters

##### maxAgeMs

`number`

#### Returns

`TimeBasedBufferStrategy`

## Methods

### fromWriterOptions()

> `static` **fromWriterOptions**(`options`): `TimeBasedBufferStrategy`

Defined in: [writer/src/strategies/buffer-strategy.ts:171](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L171)

Create from resolved writer options

#### Parameters

##### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

#### Returns

`TimeBasedBufferStrategy`

***

### append()

> **append**(`sourceDoId`, `entries`): `boolean`

Defined in: [writer/src/strategies/buffer-strategy.ts:175](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L175)

Append entries from a source to the buffer

#### Parameters

##### sourceDoId

`string`

Source DO identifier

##### entries

[`WalEntry`](../interfaces/WalEntry.md)[]

WAL entries to append

#### Returns

`boolean`

true if buffer should be flushed

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`append`](../interfaces/CDCBufferStrategy.md#append)

***

### flush()

> **flush**(): `object`

Defined in: [writer/src/strategies/buffer-strategy.ts:200](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L200)

Flush the buffer and return all entries

#### Returns

`object`

Buffered entries and their state

##### entries

> **entries**: [`WalEntry`](../interfaces/WalEntry.md)[]

##### state

> **state**: [`BufferState`](../interfaces/BufferState.md)

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`flush`](../interfaces/CDCBufferStrategy.md#flush)

***

### stats()

> **stats**(): [`BufferStats`](../interfaces/BufferStats.md)

Defined in: [writer/src/strategies/buffer-strategy.ts:216](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L216)

Get current buffer statistics

#### Returns

[`BufferStats`](../interfaces/BufferStats.md)

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`stats`](../interfaces/CDCBufferStrategy.md#stats)

***

### clear()

> **clear**(): `void`

Defined in: [writer/src/strategies/buffer-strategy.ts:228](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L228)

Clear the buffer without returning entries

#### Returns

`void`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`clear`](../interfaces/CDCBufferStrategy.md#clear)

***

### isEmpty()

> **isEmpty**(): `boolean`

Defined in: [writer/src/strategies/buffer-strategy.ts:236](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L236)

Check if buffer is empty

#### Returns

`boolean`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`isEmpty`](../interfaces/CDCBufferStrategy.md#isempty)

***

### shouldFlush()

> **shouldFlush**(): `boolean`

Defined in: [writer/src/strategies/buffer-strategy.ts:240](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L240)

Check if buffer should be flushed based on thresholds

#### Returns

`boolean`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`shouldFlush`](../interfaces/CDCBufferStrategy.md#shouldflush)

***

### getTimeToFlush()

> **getTimeToFlush**(): `number`

Defined in: [writer/src/strategies/buffer-strategy.ts:245](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L245)

Get time until next scheduled flush (ms), or null if empty

#### Returns

`number`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`getTimeToFlush`](../interfaces/CDCBufferStrategy.md#gettimetoflush)

***

### getSourceCursors()

> **getSourceCursors**(): `Map`\<`string`, `bigint`\>

Defined in: [writer/src/strategies/buffer-strategy.ts:251](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L251)

Get source cursors for acknowledgment tracking

#### Returns

`Map`\<`string`, `bigint`\>

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`getSourceCursors`](../interfaces/CDCBufferStrategy.md#getsourcecursors)
