[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ExecutorPlan

# Interface: ExecutorPlan

Defined in: [core/src/query-executor.ts:182](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L182)

Query execution plan returned by explain()

## Properties

### planId

> **planId**: `string`

Defined in: [core/src/query-executor.ts:184](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L184)

Unique plan identifier

***

### query

> **query**: [`ExecutorQuery`](ExecutorQuery.md)

Defined in: [core/src/query-executor.ts:187](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L187)

Original query

***

### estimatedCost

> **estimatedCost**: [`ExecutorCost`](ExecutorCost.md)

Defined in: [core/src/query-executor.ts:190](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L190)

Estimated cost metrics

***

### createdAt

> **createdAt**: `number`

Defined in: [core/src/query-executor.ts:193](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L193)

Plan creation timestamp

***

### description?

> `optional` **description**: `string`

Defined in: [core/src/query-executor.ts:196](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L196)

Human-readable plan description

***

### planTree?

> `optional` **planTree**: `unknown`

Defined in: [core/src/query-executor.ts:199](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L199)

Detailed plan tree (implementation-specific)

***

### partitionsSelected?

> `optional` **partitionsSelected**: `number`

Defined in: [core/src/query-executor.ts:202](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L202)

Partitions/blocks selected for scanning

***

### partitionsPruned?

> `optional` **partitionsPruned**: `number`

Defined in: [core/src/query-executor.ts:205](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L205)

Partitions/blocks pruned

***

### usesZoneMaps?

> `optional` **usesZoneMaps**: `boolean`

Defined in: [core/src/query-executor.ts:208](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L208)

Whether plan uses zone map optimization

***

### usesBloomFilters?

> `optional` **usesBloomFilters**: `boolean`

Defined in: [core/src/query-executor.ts:211](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L211)

Whether plan uses bloom filters
