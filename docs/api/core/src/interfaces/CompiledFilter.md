[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / CompiledFilter

# Interface: CompiledFilter

Defined in: [core/src/query-ops.ts:488](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L488)

Compiled filter with pre-validated column and pre-split path parts

## Properties

### filter

> **filter**: [`FilterPredicate`](FilterPredicate.md)

Defined in: [core/src/query-ops.ts:490](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L490)

Original filter predicate

***

### pathParts

> **pathParts**: `string`[]

Defined in: [core/src/query-ops.ts:492](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L492)

Pre-split path parts for fast nested access

***

### likeRegex?

> `optional` **likeRegex**: `RegExp`

Defined in: [core/src/query-ops.ts:494](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L494)

Pre-compiled regex for LIKE operations
