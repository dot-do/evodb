[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / Histogram

# Interface: Histogram

Defined in: [core/src/metrics-types.ts:126](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L126)

Histogram metric - distribution of values

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

> `readonly` **type**: `"histogram"`

Defined in: [core/src/metrics-types.ts:127](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L127)

Metric type

#### Overrides

[`Metric`](Metric.md).[`type`](Metric.md#type)

***

### buckets

> `readonly` **buckets**: readonly `number`[]

Defined in: [core/src/metrics-types.ts:129](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L129)

Bucket boundaries

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

### observe()

> **observe**(`value`): `void`

Defined in: [core/src/metrics-types.ts:131](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L131)

Observe a value

#### Parameters

##### value

`number`

#### Returns

`void`

***

### startTimer()

> **startTimer**(): [`TimerEnd`](../type-aliases/TimerEnd.md)

Defined in: [core/src/metrics-types.ts:133](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L133)

Start a timer and return a function to stop it

#### Returns

[`TimerEnd`](../type-aliases/TimerEnd.md)

***

### get()

> **get**(): [`HistogramData`](HistogramData.md)

Defined in: [core/src/metrics-types.ts:135](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L135)

Get histogram data

#### Returns

[`HistogramData`](HistogramData.md)

***

### labels()

> **labels**(`labels`): [`LabeledHistogram`](LabeledHistogram.md)

Defined in: [core/src/metrics-types.ts:137](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L137)

Get labeled histogram instance

#### Parameters

##### labels

[`MetricLabels`](../type-aliases/MetricLabels.md)

#### Returns

[`LabeledHistogram`](LabeledHistogram.md)
