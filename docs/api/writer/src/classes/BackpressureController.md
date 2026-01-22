[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BackpressureController

# Class: BackpressureController

Defined in: [writer/src/buffer.ts:619](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L619)

Backpressure controller
Signals when to slow down CDC ingestion

## Constructors

### Constructor

> **new BackpressureController**(`options?`): `BackpressureController`

Defined in: [writer/src/buffer.ts:625](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L625)

#### Parameters

##### options?

###### maxPressure?

`number`

###### highWaterMark?

`number`

###### lowWaterMark?

`number`

#### Returns

`BackpressureController`

## Methods

### update()

> **update**(`stats`, `pendingBlockCount`): `void`

Defined in: [writer/src/buffer.ts:634](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L634)

Update pressure based on buffer state

#### Parameters

##### stats

[`BufferStats`](../interfaces/BufferStats.md)

##### pendingBlockCount

`number`

#### Returns

`void`

***

### shouldApplyBackpressure()

> **shouldApplyBackpressure**(): `boolean`

Defined in: [writer/src/buffer.ts:646](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L646)

Check if backpressure should be applied

#### Returns

`boolean`

***

### canReleaseBackpressure()

> **canReleaseBackpressure**(): `boolean`

Defined in: [writer/src/buffer.ts:653](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L653)

Check if backpressure can be released

#### Returns

`boolean`

***

### getPressure()

> **getPressure**(): `number`

Defined in: [writer/src/buffer.ts:660](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L660)

Get current pressure level (0-100)

#### Returns

`number`

***

### getSuggestedDelay()

> **getSuggestedDelay**(): `number`

Defined in: [writer/src/buffer.ts:667](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L667)

Get suggested delay for backpressure (ms)

#### Returns

`number`

***

### reset()

> **reset**(): `void`

Defined in: [writer/src/buffer.ts:682](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L682)

Reset pressure to zero

#### Returns

`void`
