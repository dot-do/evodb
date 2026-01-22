[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / QueryPlan

# Interface: QueryPlan

Defined in: core/src/indexes.ts:93

Query plan information returned by getQueryPlan

## Properties

### usesIndex

> **usesIndex**: `boolean`

Defined in: core/src/indexes.ts:95

Whether an index will be used for this query

***

### indexName?

> `optional` **indexName**: `string`

Defined in: core/src/indexes.ts:97

Name of the index to be used (if any)

***

### scanType

> **scanType**: `"index"` \| `"full"`

Defined in: core/src/indexes.ts:99

Type of scan: 'index' or 'full'

***

### estimatedCost?

> `optional` **estimatedCost**: `number`

Defined in: core/src/indexes.ts:101

Estimated cost (relative metric)
