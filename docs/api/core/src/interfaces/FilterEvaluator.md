[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / FilterEvaluator

# Interface: FilterEvaluator

Defined in: [core/src/query-ops.ts:111](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L111)

Filter evaluator interface

## Methods

### evaluate()

> **evaluate**(`value`, `filter`): `boolean`

Defined in: [core/src/query-ops.ts:115](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L115)

Evaluate a single filter predicate against a value

#### Parameters

##### value

`unknown`

##### filter

[`FilterPredicate`](FilterPredicate.md)

#### Returns

`boolean`

***

### evaluateAll()

> **evaluateAll**(`row`, `filters`): `boolean`

Defined in: [core/src/query-ops.ts:120](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L120)

Evaluate multiple filters against a row (AND logic)

#### Parameters

##### row

`Record`\<`string`, `unknown`\>

##### filters

[`FilterPredicate`](FilterPredicate.md)[]

#### Returns

`boolean`
