[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / PredicateOperator

# Type Alias: PredicateOperator

> **PredicateOperator** = `"eq"` \| `"ne"` \| `"gt"` \| `"gte"` \| `"lt"` \| `"lte"` \| `"in"` \| `"notIn"` \| `"between"` \| `"like"` \| `"isNull"` \| `"isNotNull"`

Defined in: [query/src/types.ts:268](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L268)

Supported predicate operators.

Maps to SQL-style comparison operations. Zone map optimization
works best with 'eq', 'gt', 'gte', 'lt', 'lte', and 'between'.
Bloom filter optimization applies to 'eq' and 'in' operators.

| Operator   | SQL Equivalent     | Zone Map | Bloom Filter |
|------------|-------------------|----------|--------------|
| eq         | =                 | Yes      | Yes          |
| ne         | !=                | Partial  | No           |
| gt         | >                 | Yes      | No           |
| gte        | >=                | Yes      | No           |
| lt         | <                 | Yes      | No           |
| lte        | <=                | Yes      | No           |
| in         | IN (...)          | Yes      | Yes          |
| notIn      | NOT IN (...)      | Partial  | No           |
| between    | BETWEEN ... AND   | Yes      | No           |
| like       | LIKE pattern      | Partial  | No           |
| isNull     | IS NULL           | Yes      | No           |
| isNotNull  | IS NOT NULL       | Yes      | No           |
