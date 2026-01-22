[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / SizeBasedBufferStrategy

# Class: SizeBasedBufferStrategy

Defined in: [writer/src/strategies/buffer-strategy.ts:41](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L41)

Buffer strategy that flushes based on size thresholds

## Implements

- [`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md)

## Constructors

### Constructor

> **new SizeBasedBufferStrategy**(`targetSize`, `maxSize`): `SizeBasedBufferStrategy`

Defined in: [writer/src/strategies/buffer-strategy.ts:49](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L49)

#### Parameters

##### targetSize

`number`

##### maxSize

`number`

#### Returns

`SizeBasedBufferStrategy`

## Methods

### fromWriterOptions()

> `static` **fromWriterOptions**(`options`): `SizeBasedBufferStrategy`

Defined in: [writer/src/strategies/buffer-strategy.ts:57](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L57)

Create from resolved writer options

#### Parameters

##### options

[`ResolvedWriterOptions`](../interfaces/ResolvedWriterOptions.md)

#### Returns

`SizeBasedBufferStrategy`

***

### append()

> **append**(`sourceDoId`, `entries`): `boolean`

Defined in: [writer/src/strategies/buffer-strategy.ts:64](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L64)

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

Defined in: [writer/src/strategies/buffer-strategy.ts:89](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L89)

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

Defined in: [writer/src/strategies/buffer-strategy.ts:105](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L105)

Get current buffer statistics

#### Returns

[`BufferStats`](../interfaces/BufferStats.md)

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`stats`](../interfaces/CDCBufferStrategy.md#stats)

***

### clear()

> **clear**(): `void`

Defined in: [writer/src/strategies/buffer-strategy.ts:117](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L117)

Clear the buffer without returning entries

#### Returns

`void`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`clear`](../interfaces/CDCBufferStrategy.md#clear)

***

### isEmpty()

> **isEmpty**(): `boolean`

Defined in: [writer/src/strategies/buffer-strategy.ts:126](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L126)

Check if buffer is empty

#### Returns

`boolean`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`isEmpty`](../interfaces/CDCBufferStrategy.md#isempty)

***

### shouldFlush()

> **shouldFlush**(): `boolean`

Defined in: [writer/src/strategies/buffer-strategy.ts:130](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L130)

Check if buffer should be flushed based on thresholds

#### Returns

`boolean`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`shouldFlush`](../interfaces/CDCBufferStrategy.md#shouldflush)

***

### getTimeToFlush()

> **getTimeToFlush**(): `number`

Defined in: [writer/src/strategies/buffer-strategy.ts:134](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L134)

Get time until next scheduled flush (ms), or null if empty

#### Returns

`number`

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`getTimeToFlush`](../interfaces/CDCBufferStrategy.md#gettimetoflush)

***

### getSourceCursors()

> **getSourceCursors**(): `Map`\<`string`, `bigint`\>

Defined in: [writer/src/strategies/buffer-strategy.ts:139](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L139)

Get source cursors for acknowledgment tracking

#### Returns

`Map`\<`string`, `bigint`\>

#### Implementation of

[`CDCBufferStrategy`](../interfaces/CDCBufferStrategy.md).[`getSourceCursors`](../interfaces/CDCBufferStrategy.md#getsourcecursors)

***

### isAtMaxCapacity()

> **isAtMaxCapacity**(): `boolean`

Defined in: [writer/src/strategies/buffer-strategy.ts:146](https://github.com/dot-do/evodb/blob/main/writer/src/strategies/buffer-strategy.ts#L146)

Check if buffer is at max capacity

#### Returns

`boolean`
