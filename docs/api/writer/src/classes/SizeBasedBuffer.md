[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / SizeBasedBuffer

# Class: SizeBasedBuffer

Defined in: [writer/src/buffer.ts:691](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L691)

Size-based buffer that flushes at specific size thresholds
Useful for partition mode configurations

## Constructors

### Constructor

> **new SizeBasedBuffer**(`targetSize`, `maxSize`): `SizeBasedBuffer`

Defined in: [writer/src/buffer.ts:695](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L695)

#### Parameters

##### targetSize

`number`

##### maxSize

`number`

#### Returns

`SizeBasedBuffer`

## Methods

### add()

> **add**(`entries`): `boolean`

Defined in: [writer/src/buffer.ts:705](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L705)

Add entries and check if buffer should flush
Returns true if buffer is at or over target size

#### Parameters

##### entries

[`WalEntry`](../interfaces/WalEntry.md)[]

#### Returns

`boolean`

#### Throws

Error if any entry or entry.data is null/undefined

***

### isAtMaxCapacity()

> **isAtMaxCapacity**(): `boolean`

Defined in: [writer/src/buffer.ts:723](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L723)

Check if buffer is at max capacity

#### Returns

`boolean`

***

### drain()

> **drain**(): [`WalEntry`](../interfaces/WalEntry.md)[]

Defined in: [writer/src/buffer.ts:730](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L730)

Drain buffer

#### Returns

[`WalEntry`](../interfaces/WalEntry.md)[]

***

### getSize()

> **getSize**(): `number`

Defined in: [writer/src/buffer.ts:740](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L740)

Get current size

#### Returns

`number`

***

### getEntryCount()

> **getEntryCount**(): `number`

Defined in: [writer/src/buffer.ts:747](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L747)

Get entry count

#### Returns

`number`

***

### isEmpty()

> **isEmpty**(): `boolean`

Defined in: [writer/src/buffer.ts:754](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L754)

Check if empty

#### Returns

`boolean`
