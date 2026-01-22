[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SimpleBlockScanRequest

# Interface: SimpleBlockScanRequest

Defined in: [query/src/simple-engine.ts:182](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L182)

Block scan request

## Properties

### blockPath

> **blockPath**: `string`

Defined in: [query/src/simple-engine.ts:184](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L184)

Block path in R2

***

### columns

> **columns**: `string`[]

Defined in: [query/src/simple-engine.ts:186](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L186)

Columns to read

***

### rowRange?

> `optional` **rowRange**: `object`

Defined in: [query/src/simple-engine.ts:188](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L188)

Row range to read

#### start

> **start**: `number`

#### end

> **end**: `number`

***

### filters?

> `optional` **filters**: [`SimpleFilterPredicate`](SimpleFilterPredicate.md)[]

Defined in: [query/src/simple-engine.ts:190](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L190)

Filter predicates for pushdown
