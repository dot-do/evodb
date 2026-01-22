[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / HybridBufferStrategy

# Class: HybridBufferStrategy

Defined in: [writer/src/strategies/buffer-strategy.ts:264](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L264)

Buffer strategy that combines size, count, and time thresholds
This is the default strategy used by LakehouseWriter

## Implements

- [`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md)

## Constructors

### Constructor

> **new HybridBufferStrategy**(`options`): `HybridBufferStrategy`

Defined in: [writer/src/strategies/buffer-strategy.ts:272](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L272)

#### Parameters

##### options

[`BufferStrategyOptions`](../interfaces/BufferStrategyOptions.md)

#### Returns

`HybridBufferStrategy`

## Methods

### fromWriterOptions()

> `static` **fromWriterOptions**(`options`): `HybridBufferStrategy`

Defined in: [writer/src/strategies/buffer-strategy.ts:277](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L277)

Create from resolved writer options

#### Parameters

##### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

#### Returns

`HybridBufferStrategy`

***

### append()

> **append**(`sourceDoId`, `entries`): `boolean`

Defined in: [writer/src/strategies/buffer-strategy.ts:285](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L285)

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

Defined in: [writer/src/strategies/buffer-strategy.ts:310](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L310)

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

Defined in: [writer/src/strategies/buffer-strategy.ts:326](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L326)

Get current buffer statistics

#### Returns

[`BufferStats`](../interfaces/BufferStats.md)

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`stats`](../interfaces/CDCBufferStrategy.md#stats)

***

### clear()

> **clear**(): `void`

Defined in: [writer/src/strategies/buffer-strategy.ts:338](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L338)

Clear the buffer without returning entries

#### Returns

`void`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`clear`](../interfaces/CDCBufferStrategy.md#clear)

***

### isEmpty()

> **isEmpty**(): `boolean`

Defined in: [writer/src/strategies/buffer-strategy.ts:346](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L346)

Check if buffer is empty

#### Returns

`boolean`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`isEmpty`](../interfaces/CDCBufferStrategy.md#isempty)

***

### shouldFlush()

> **shouldFlush**(): `boolean`

Defined in: [writer/src/strategies/buffer-strategy.ts:350](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L350)

Check if buffer should be flushed based on thresholds

#### Returns

`boolean`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`shouldFlush`](../interfaces/CDCBufferStrategy.md#shouldflush)

***

### getTimeToFlush()

> **getTimeToFlush**(): `number`

Defined in: [writer/src/strategies/buffer-strategy.ts:374](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L374)

Get time until next scheduled flush (ms), or null if empty

#### Returns

`number`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`getTimeToFlush`](../interfaces/CDCBufferStrategy.md#gettimetoflush)

***

### getSourceCursors()

> **getSourceCursors**(): `Map`\<`string`, `bigint`\>

Defined in: [writer/src/strategies/buffer-strategy.ts:380](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L380)

Get source cursors for acknowledgment tracking

#### Returns

`Map`\<`string`, `bigint`\>

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`getSourceCursors`](../interfaces/CDCBufferStrategy.md#getsourcecursors)

***

### getLsnRange()

> **getLsnRange**(): `object`

Defined in: [writer/src/strategies/buffer-strategy.ts:387](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L387)

Get the LSN range of buffered entries

#### Returns

`object`

##### min

> **min**: `bigint`

##### max

> **max**: `bigint`
