[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / compareValues

# Function: compareValues()

> **compareValues**(`a`, `b`): `number`

Defined in: [core/src/query-ops.ts:334](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L334)

Compare two values for sorting or filtering.

This is the canonical implementation used across

## Parameters

### a

`unknown`

First value to compare

### b

`unknown`

Second value to compare

## Returns

`number`

Negative if a < b, positive if a > b, 0 if equal

## Evodb

packages for
consistent value comparison in sorting, filtering, and zone map pruning.

Comparison rules:
- null/undefined values are ordered before non-null values
- Numbers use numeric comparison (a - b)
- Strings use fast ASCII comparison when possible, localeCompare otherwise
- Dates compare by timestamp
- Other types fall back to string comparison via localeCompare

## Examples

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
