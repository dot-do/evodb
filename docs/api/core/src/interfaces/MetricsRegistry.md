[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / MetricsRegistry

# Interface: MetricsRegistry

Defined in: [core/src/metrics-types.ts:193](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L193)

Metrics registry - container for all metrics

## Properties

### contentType

> `readonly` **contentType**: `string`

Defined in: [core/src/metrics-types.ts:203](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L203)

Content-Type header for Prometheus format

## Methods

### getMetrics()

> **getMetrics**(): [`Metric`](Metric.md)[]

Defined in: [core/src/metrics-types.ts:195](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L195)

Get all registered metrics

#### Returns

[`Metric`](Metric.md)[]

***

### getMetric()

> **getMetric**(`name`): [`Metric`](Metric.md)

Defined in: [core/src/metrics-types.ts:197](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L197)

Get a specific metric by name

#### Parameters

##### name

`string`

#### Returns

[`Metric`](Metric.md)

***

### clear()

> **clear**(): `void`

Defined in: [core/src/metrics-types.ts:199](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L199)

Clear all registered metrics

#### Returns

`void`

***

### resetAll()

> **resetAll**(): `void`

Defined in: [core/src/metrics-types.ts:201](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L201)

Reset all metric values

#### Returns

`void`

***

### \_register()

> **\_register**(`metric`): `void`

Defined in: [core/src/metrics-types.ts:205](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L205)

Internal: register a metric

#### Parameters

##### metric

[`Metric`](Metric.md)

#### Returns

`void`
