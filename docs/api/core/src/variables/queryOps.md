[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / queryOps

# Variable: queryOps

> `const` **queryOps**: `object`

Defined in: [core/src/query-ops.ts:1108](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L1108)

All-in-one query operations for simple use cases

## Type Declaration

### evaluateFilter()

> **evaluateFilter**: (`value`, `filter`) => `boolean`

Evaluate a single filter predicate against a value

#### Parameters

##### value

`unknown`

##### filter

[`FilterPredicate`](../interfaces/FilterPredicate.md)

#### Returns

`boolean`

### evaluateFilters()

> **evaluateFilters**: (`row`, `filters`) => `boolean`

Evaluate all filters against a row (AND logic)

#### Parameters

##### row

`Record`\<`string`, `unknown`\>

##### filters

[`FilterPredicate`](../interfaces/FilterPredicate.md)[]

#### Returns

`boolean`

### createFilterEvaluator()

> **createFilterEvaluator**: () => [`FilterEvaluator`](../interfaces/FilterEvaluator.md)

Create a filter evaluator instance

#### Returns

[`FilterEvaluator`](../interfaces/FilterEvaluator.md)

### sortRows()

> **sortRows**: \<`T`\>(`rows`, `orderBy`) => `T`[]

Sort rows by multiple columns

Uses slice() + in-place sort instead of [...rows].sort() to avoid
double memory allocation from spread operator creating intermediate array.

#### Type Parameters

##### T

`T` *extends* `Record`\<`string`, `unknown`\>

#### Parameters

##### rows

`T`[]

##### orderBy

[`SortSpec`](../interfaces/SortSpec.md)[]

#### Returns

`T`[]

### limitRows()

> **limitRows**: \<`T`\>(`rows`, `limit`, `offset?`) => `T`[]

Apply limit and offset to rows

#### Type Parameters

##### T

`T`

#### Parameters

##### rows

`T`[]

##### limit

`number`

##### offset?

`number`

#### Returns

`T`[]

### compareForSort()

> **compareForSort**: (`a`, `b`, `direction`, `nullsFirst?`) => `number`

Compare values for sorting with direction and null handling

#### Parameters

##### a

`unknown`

##### b

`unknown`

##### direction

[`SortDirection`](../type-aliases/SortDirection.md)

##### nullsFirst?

`boolean`

#### Returns

`number`

### compareValues()

> **compareValues**: (`a`, `b`) => `number`

Compare two values for sorting or filtering.

This is the canonical implementation used across

#### Parameters

##### a

`unknown`

First value to compare

##### b

`unknown`

Second value to compare

#### Returns

`number`

Negative if a < b, positive if a > b, 0 if equal

#### Evodb

packages for
consistent value comparison in sorting, filtering, and zone map pruning.

Comparison rules:
- null/undefined values are ordered before non-null values
- Numbers use numeric comparison (a - b)
- Strings use fast ASCII comparison when possible, localeCompare otherwise
- Dates compare by timestamp
- Other types fall back to string comparison via localeCompare

#### Examples

```ts
// Number comparison
compareValues(1, 2)  // => -1 (negative)
compareValues(2, 1)  // => 1 (positive)
compareValues(5, 5)  // => 0
```

```ts
// Null handling
compareValues(null, 5)    // => -1 (nulls sort first)
compareValues(5, null)    // => 1
compareValues(null, null) // => 0
```

```ts
// String comparison
compareValues('apple', 'banana') // => negative
```

### createResultProcessor()

> **createResultProcessor**: () => [`ResultProcessor`](../interfaces/ResultProcessor.md)

Create a result processor instance

#### Returns

[`ResultProcessor`](../interfaces/ResultProcessor.md)

### computeAggregate()

> **computeAggregate**: (`rows`, `spec`) => `unknown`

Compute a single aggregate value over rows.
This function is kept for backward compatibility but now uses the aggregator pattern internally.

#### Parameters

##### rows

`Record`\<`string`, `unknown`\>[]

##### spec

[`AggregateSpec`](../interfaces/AggregateSpec.md)

#### Returns

`unknown`

### computeAggregations()

> **computeAggregations**: (`rows`, `aggregates`, `groupBy?`) => `object`

Compute aggregations over rows, optionally grouped.
Uses single-pass aggregation for efficiency - all aggregates are computed
in a single iteration over each group's rows.

#### Parameters

##### rows

`Record`\<`string`, `unknown`\>[]

##### aggregates

[`AggregateSpec`](../interfaces/AggregateSpec.md)[]

##### groupBy?

`string`[]

#### Returns

`object`

##### columns

> **columns**: `string`[]

##### rows

> **rows**: `unknown`[][]

### createAggregationEngine()

> **createAggregationEngine**: () => [`AggregationEngine`](../interfaces/AggregationEngine.md)

Create an aggregation engine instance

#### Returns

[`AggregationEngine`](../interfaces/AggregationEngine.md)

### getNestedValue()

> **getNestedValue**: (`obj`, `path`) => `unknown`

Get nested value from object using dot notation.

This is the canonical implementation used across

#### Parameters

##### obj

`Record`\<`string`, `unknown`\>

The object to extract value from

##### path

`string`

Dot-notation path (e.g., 'user.profile.name')

#### Returns

`unknown`

The value at the path, or undefined if not found

#### Evodb

packages for
consistent nested property access in queries, filters, and partition computations.

Behavior:
- For paths without dots, returns direct property access
- For dotted paths, first checks if path exists as a flat key (e.g., 'user.name')
- Falls back to traversing nested objects if flat key not found
- Returns undefined for missing paths or non-object intermediates

#### Examples

```ts
// Simple property access
getNestedValue({ x: 5 }, 'x') // => 5
```

```ts
// Nested path traversal
getNestedValue({ user: { name: 'Alice' } }, 'user.name') // => 'Alice'
```

```ts
// Flat dotted key takes precedence
getNestedValue({ 'user.name': 'flat' }, 'user.name') // => 'flat'
```

### setNestedValue()

> **setNestedValue**: (`obj`, `path`, `value`) => `void`

Set nested value in object using dot notation

#### Parameters

##### obj

`Record`\<`string`, `unknown`\>

##### path

`string`

##### value

`unknown`

#### Returns

`void`

### likePatternToRegex()

> **likePatternToRegex**: (`pattern`) => `RegExp`

Convert SQL LIKE pattern to RegExp
% matches any sequence, _ matches single char

#### Parameters

##### pattern

`string`

#### Returns

`RegExp`

### validateColumnName()

> **validateColumnName**: (`name`) => `void`

Validate a column name to prevent injection attacks.

This function delegates to the centralized validation module which provides
comprehensive security checks including:
- SQL injection prevention (DROP, DELETE, UNION, etc.)
- XSS pattern rejection (script tags, event handlers)
- Control character filtering (null bytes, etc.)
- Path traversal prevention

Valid column names:
- Consist of alphanumeric characters, underscores, and dots
- Each segment (separated by dots) must start with a letter or underscore
- Cannot be empty, start with a dot, or end with a dot

#### Parameters

##### name

`string`

#### Returns

`void`

#### Throws

Error if column name is invalid
