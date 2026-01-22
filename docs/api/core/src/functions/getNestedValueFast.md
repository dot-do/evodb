[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / getNestedValueFast

# Function: getNestedValueFast()

> **getNestedValueFast**(`obj`, `path`, `pathParts`): `unknown`

Defined in: [core/src/query-ops.ts:237](https://github.com/dot-do/evodb/blob/main/core/src/query-ops.ts#L237)

Get nested value using pre-split path parts (fast path for compiled filters)
This avoids parsing the path string on every row access.

## Parameters

### obj

`Record`\<`string`, `unknown`\>

### path

`string`

### pathParts

`string`[]

## Returns

`unknown`
