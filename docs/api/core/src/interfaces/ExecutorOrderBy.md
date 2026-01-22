[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ExecutorOrderBy

# Interface: ExecutorOrderBy

Defined in: [core/src/query-executor.ts:117](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L117)

Sort specification

## Properties

### column

> **column**: `string`

Defined in: [core/src/query-executor.ts:119](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L119)

Column to sort by

***

### direction

> **direction**: `"asc"` \| `"desc"`

Defined in: [core/src/query-executor.ts:122](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L122)

Sort direction

***

### nulls?

> `optional` **nulls**: `"first"` \| `"last"`

Defined in: [core/src/query-executor.ts:125](https://github.com/dot-do/evodb/blob/main/core/src/query-executor.ts#L125)

Null handling
