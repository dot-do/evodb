[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / Counter

# Interface: Counter

Defined in: [core/src/metrics-types.ts:51](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L51)

Counter metric - a monotonically increasing value

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

> `readonly` **type**: `"counter"`

Defined in: [core/src/metrics-types.ts:52](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L52)

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

### inc()

> **inc**(`value?`): `void`

Defined in: [core/src/metrics-types.ts:54](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L54)

Increment counter by 1 or specified value

#### Parameters

##### value?

`number`

#### Returns

`void`

***

### get()

> **get**(): `number`

Defined in: [core/src/metrics-types.ts:56](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L56)

Get current value

#### Returns

`number`

***

### labels()

> **labels**(`labels`): [`LabeledCounter`](LabeledCounter.md)

Defined in: [core/src/metrics-types.ts:58](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L58)

Get labeled counter instance

#### Parameters

##### labels

[`MetricLabels`](../type-aliases/MetricLabels.md)

#### Returns

[`LabeledCounter`](LabeledCounter.md)
