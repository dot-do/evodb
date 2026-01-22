[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TableSchema

# Interface: TableSchema

Defined in: [core/src/types.ts:338](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L338)

Table schema definition (high-level format for manifests).
Used in lakehouse operations, table catalogs, and metadata.

Different from Core `Schema` which uses:
- `id` instead of `schemaId`
- `path` instead of `name` in columns
- `Type` enum instead of string types

## Properties

### schemaId

> **schemaId**: `number`

Defined in: [core/src/types.ts:340](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L340)

Schema version identifier

***

### version

> **version**: `number`

Defined in: [core/src/types.ts:342](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L342)

Schema version number

***

### columns

> **columns**: [`TableSchemaColumn`](TableSchemaColumn.md)[]

Defined in: [core/src/types.ts:344](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L344)

Column definitions

***

### createdAt

> **createdAt**: `number`

Defined in: [core/src/types.ts:346](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L346)

Creation timestamp (ms since epoch)
