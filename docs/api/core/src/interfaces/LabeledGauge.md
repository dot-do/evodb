[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / LabeledGauge

# Interface: LabeledGauge

Defined in: [core/src/metrics-types.ts:93](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L93)

Labeled gauge instance

## Methods

### set()

> **set**(`value`): `void`

Defined in: [core/src/metrics-types.ts:95](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L95)

Set gauge to specified value

#### Parameters

##### value

`number`

#### Returns

`void`

***

### inc()

> **inc**(`value?`): `void`

Defined in: [core/src/metrics-types.ts:97](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L97)

Increment gauge by 1 or specified value

#### Parameters

##### value?

`number`

#### Returns

`void`

***

### dec()

> **dec**(`value?`): `void`

Defined in: [core/src/metrics-types.ts:99](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L99)

Decrement gauge by 1 or specified value

#### Parameters

##### value?

`number`

#### Returns

`void`

***

### setToCurrentTime()

> **setToCurrentTime**(): `void`

Defined in: [core/src/metrics-types.ts:101](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L101)

Set gauge to current Unix timestamp in seconds

#### Returns

`void`

***

### get()

> **get**(): `number`

Defined in: [core/src/metrics-types.ts:103](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L103)

Get current value

#### Returns

`number`
