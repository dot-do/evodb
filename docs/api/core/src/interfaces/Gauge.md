[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / Gauge

# Interface: Gauge

Defined in: [core/src/metrics-types.ts:74](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L74)

Gauge metric - a value that can go up or down

## Extends

- [`Metric`](Metric.md)

## Properties

### name

> `readonly` **name**: `string`

Defined in: [core/src/metrics-types.ts:39](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L39)

Metric name (must match [a-zA-Z_:][a-zA-Z0-9_:]*)

#### Inherited from

[`Metric`](Metric.md).[`name`](Metric.md#name)

***

### help

> `readonly` **help**: `string`

Defined in: [core/src/metrics-types.ts:41](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L41)

Human-readable description

#### Inherited from

[`Metric`](Metric.md).[`help`](Metric.md#help)

***

### type

> `readonly` **type**: `"gauge"`

Defined in: [core/src/metrics-types.ts:75](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L75)

Metric type

#### Overrides

[`Metric`](Metric.md).[`type`](Metric.md#type)

## Methods

### reset()

> **reset**(): `void`

Defined in: [core/src/metrics-types.ts:45](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L45)

Reset metric to initial state

#### Returns

`void`

#### Inherited from

[`Metric`](Metric.md).[`reset`](Metric.md#reset)

***

### set()

> **set**(`value`): `void`

Defined in: [core/src/metrics-types.ts:77](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L77)

Set gauge to specified value

#### Parameters

##### value

`number`

#### Returns

`void`

***

### inc()

> **inc**(`value?`): `void`

Defined in: [core/src/metrics-types.ts:79](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L79)

Increment gauge by 1 or specified value

#### Parameters

##### value?

`number`

#### Returns

`void`

***

### dec()

> **dec**(`value?`): `void`

Defined in: [core/src/metrics-types.ts:81](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L81)

Decrement gauge by 1 or specified value

#### Parameters

##### value?

`number`

#### Returns

`void`

***

### setToCurrentTime()

> **setToCurrentTime**(): `void`

Defined in: [core/src/metrics-types.ts:83](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L83)

Set gauge to current Unix timestamp in seconds

#### Returns

`void`

***

### get()

> **get**(): `number`

Defined in: [core/src/metrics-types.ts:85](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L85)

Get current value

#### Returns

`number`

***

### labels()

> **labels**(`labels`): [`LabeledGauge`](LabeledGauge.md)

Defined in: [core/src/metrics-types.ts:87](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L87)

Get labeled gauge instance

#### Parameters

##### labels

[`MetricLabels`](../type-aliases/MetricLabels.md)

#### Returns

[`LabeledGauge`](LabeledGauge.md)
