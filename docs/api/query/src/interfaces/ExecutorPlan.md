[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ExecutorPlan

# Interface: ExecutorPlan

Defined in: core/dist/query-executor.d.ts:111

Query execution plan returned by explain()

## Properties

### planId

> **planId**: `string`

Defined in: core/dist/query-executor.d.ts:113

Unique plan identifier

***

### query

> **query**: [`ExecutorQuery`](ExecutorQuery.md)

Defined in: core/dist/query-executor.d.ts:115

Original query

***

### estimatedCost

> **estimatedCost**: [`ExecutorCost`](ExecutorCost.md)

Defined in: core/dist/query-executor.d.ts:117

Estimated cost metrics

***

### createdAt

> **createdAt**: `number`

Defined in: core/dist/query-executor.d.ts:119

Plan creation timestamp

***

### description?

> `optional` **description**: `string`

Defined in: core/dist/query-executor.d.ts:121

Human-readable plan description

***

### planTree?

> `optional` **planTree**: `unknown`

Defined in: core/dist/query-executor.d.ts:123

Detailed plan tree (implementation-specific)

***

### partitionsSelected?

> `optional` **partitionsSelected**: `number`

Defined in: core/dist/query-executor.d.ts:125

Partitions/blocks selected for scanning

***

### partitionsPruned?

> `optional` **partitionsPruned**: `number`

Defined in: core/dist/query-executor.d.ts:127

Partitions/blocks pruned

***

### usesZoneMaps?

> `optional` **usesZoneMaps**: `boolean`

Defined in: core/dist/query-executor.d.ts:129

Whether plan uses zone map optimization

***

### usesBloomFilters?

> `optional` **usesBloomFilters**: `boolean`

Defined in: core/dist/query-executor.d.ts:131

Whether plan uses bloom filters
