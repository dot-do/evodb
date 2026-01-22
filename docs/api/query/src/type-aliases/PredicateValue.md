[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / PredicateValue

# Type Alias: PredicateValue

> **PredicateValue** = `string` \| `number` \| `boolean` \| `null` \| `Date` \| `bigint` \| `string`[] \| `number`[] \| \[`unknown`, `unknown`\]

Defined in: [query/src/types.ts:306](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L306)

Value types for predicates.

The type of value depends on the predicate operator being used:
- Scalar types (string, number, boolean, null, Date, bigint): Used with
  comparison operators (eq, ne, gt, gte, lt, lte, like)
- Array types (string[], number[]): Used with set operators (in, notIn)
- Tuple type ([unknown, unknown]): Used with range operator (between)

## Example

```typescript
// Scalar value for equality
const scalarValue: PredicateValue = 'active';

// Array value for IN operator
const arrayValue: PredicateValue = ['pending', 'processing', 'shipped'];

// Tuple value for BETWEEN operator (inclusive range)
const rangeValue: PredicateValue = [100, 500];

// Date value for timestamp comparison
const dateValue: PredicateValue = new Date('2024-01-01');
```
