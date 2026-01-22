[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / R2Objects

# Interface: R2Objects

Defined in: core/src/types/r2.ts:164

R2 list operation result.

## Properties

### objects

> **objects**: [`R2Object`](R2Object.md)[]

Defined in: core/src/types/r2.ts:166

Array of objects matching the list query

***

### truncated

> **truncated**: `boolean`

Defined in: core/src/types/r2.ts:168

Whether there are more results available

***

### cursor?

> `optional` **cursor**: `string`

Defined in: core/src/types/r2.ts:170

Cursor for pagination (present when truncated)

***

### delimitedPrefixes

> **delimitedPrefixes**: `string`[]

Defined in: core/src/types/r2.ts:172

Prefixes when using delimiter (for "directory" listing)
