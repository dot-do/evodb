[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / computeAggregate

# Function: computeAggregate()

> **computeAggregate**(`rows`, `spec`): `unknown`

Defined in: [core/src/query-ops.ts:963](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L963)

Compute a single aggregate value over rows.
This function is kept for backward compatibility but now uses the aggregator pattern internally.

## Parameters

### rows

`Record`\<`string`, `unknown`\>[]

### spec

[`AggregateSpec`](../interfaces/AggregateSpec.md)

## Returns

`unknown`
