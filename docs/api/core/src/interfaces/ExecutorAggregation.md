[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ExecutorAggregation

# Interface: ExecutorAggregation

Defined in: [core/src/query-executor.ts:93](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L93)

Aggregation specification

## Properties

### function

> **function**: `"count"` \| `"sum"` \| `"avg"` \| `"min"` \| `"max"` \| `"first"` \| `"last"` \| `"countDistinct"` \| `"stddev"` \| `"variance"`

Defined in: [core/src/query-executor.ts:95](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L95)

Aggregation function

***

### column?

> `optional` **column**: `string`

Defined in: [core/src/query-executor.ts:108](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L108)

Column to aggregate (null for COUNT(*))

***

### alias

> **alias**: `string`

Defined in: [core/src/query-executor.ts:111](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L111)

Output alias
