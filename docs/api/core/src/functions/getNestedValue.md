[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / getNestedValue

# Function: getNestedValue()

> **getNestedValue**(`obj`, `path`): `unknown`

Defined in: [core/src/query-ops.ts:214](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L214)

Get nested value from object using dot notation.

This is the canonical implementation used across

## Parameters

### obj

`Record`\<`string`, `unknown`\>

The object to extract value from

### path

`string`

Dot-notation path (e.g., 'user.profile.name')

## Returns

`unknown`

The value at the path, or undefined if not found

## Evodb

packages for
consistent nested property access in queries, filters, and partition computations.

Behavior:
- For paths without dots, returns direct property access
- For dotted paths, first checks if path exists as a flat key (e.g., 'user.name')
- Falls back to traversing nested objects if flat key not found
- Returns undefined for missing paths or non-object intermediates

## Examples

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
