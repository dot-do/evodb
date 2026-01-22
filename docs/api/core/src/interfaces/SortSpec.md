[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SortSpec

# Interface: SortSpec

Defined in: [core/src/query-ops.ts:64](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L64)

Sort specification

## Properties

### column

> **column**: `string`

Defined in: [core/src/query-ops.ts:66](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L66)

Column to sort by

***

### direction

> **direction**: [`SortDirection`](../type-aliases/SortDirection.md)

Defined in: [core/src/query-ops.ts:68](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L68)

Sort direction

***

### nullsFirst?

> `optional` **nullsFirst**: `boolean`

Defined in: [core/src/query-ops.ts:70](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L70)

Null handling - nullsFirst=true puts nulls first, false puts nulls last

***

### nulls?

> `optional` **nulls**: `"first"` \| `"last"`

Defined in: [core/src/query-ops.ts:72](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L72)

Alias for compatibility: 'first' | 'last'
