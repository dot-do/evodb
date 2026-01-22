[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / HistogramConfig

# Interface: HistogramConfig

Defined in: [core/src/metrics-types.ts:179](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L179)

Configuration for creating a histogram

## Properties

### name

> **name**: `string`

Defined in: [core/src/metrics-types.ts:181](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L181)

Metric name

***

### help

> **help**: `string`

Defined in: [core/src/metrics-types.ts:183](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L183)

Human-readable description

***

### labelNames?

> `optional` **labelNames**: `string`[]

Defined in: [core/src/metrics-types.ts:185](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L185)

Label names for this metric

***

### buckets?

> `optional` **buckets**: `number`[]

Defined in: [core/src/metrics-types.ts:187](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L187)

Bucket boundaries (default: [.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10])
