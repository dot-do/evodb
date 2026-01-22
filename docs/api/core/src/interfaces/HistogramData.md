[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / HistogramData

# Interface: HistogramData

Defined in: [core/src/metrics-types.ts:109](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L109)

Histogram data for a single label set

## Properties

### count

> **count**: `number`

Defined in: [core/src/metrics-types.ts:111](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L111)

Total number of observations

***

### sum

> **sum**: `number`

Defined in: [core/src/metrics-types.ts:113](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L113)

Sum of all observed values

***

### buckets

> **buckets**: `Record`\<`number`, `number`\>

Defined in: [core/src/metrics-types.ts:115](https://github.com/dot-do/evodb/blob/main/core/src/metrics-types.ts#L115)

Cumulative bucket counts (bucket upper bound -> count)
