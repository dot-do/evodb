[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / Metric

# Interface: Metric

Defined in: [core/src/metrics-types.ts:37](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L37)

Base metric interface

## Extended by

- [`Counter`](Counter.md)
- [`Gauge`](Gauge.md)
- [`Histogram`](Histogram.md)

## Properties

### name

> `readonly` **name**: `string`

Defined in: [core/src/metrics-types.ts:39](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L39)

Metric name (must match [a-zA-Z_:][a-zA-Z0-9_:]*)

***

### help

> `readonly` **help**: `string`

Defined in: [core/src/metrics-types.ts:41](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L41)

Human-readable description

***

### type

> `readonly` **type**: [`MetricType`](../type-aliases/MetricType.md)

Defined in: [core/src/metrics-types.ts:43](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L43)

Metric type

## Methods

### reset()

> **reset**(): `void`

Defined in: [core/src/metrics-types.ts:45](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L45)

Reset metric to initial state

#### Returns

`void`
