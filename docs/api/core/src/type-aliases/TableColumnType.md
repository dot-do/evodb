[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TableColumnType

# Type Alias: TableColumnType

> **TableColumnType** = `"null"` \| `"boolean"` \| `"int32"` \| `"int64"` \| `"float64"` \| `"string"` \| `"binary"` \| `"timestamp"` \| `"date"` \| `"uuid"` \| `"json"` \| \{ `type`: `"array"`; `elementType`: `TableColumnType`; \} \| \{ `type`: `"map"`; `keyType`: `TableColumnType`; `valueType`: `TableColumnType`; \} \| \{ `type`: `"struct"`; `fields`: [`TableSchemaColumn`](../interfaces/TableSchemaColumn.md)[]; \}

Defined in: [core/src/types.ts:296](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L296)

String-based column types for table schemas (human-readable format).
Used in table manifests and lakehouse operations.
Maps to Core `Type` enum for low-level columnar operations.
