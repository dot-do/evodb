[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TableSchemaColumn

# Interface: TableSchemaColumn

Defined in: [core/src/types.ts:316](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L316)

Column definition for table schemas (high-level format).
Uses string-based types and `name` field for manifest compatibility.

## Properties

### name

> **name**: `string`

Defined in: [core/src/types.ts:318](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L318)

Column name (use dot-notation for nested: "user.address.city")

***

### type

> **type**: [`TableColumnType`](../type-aliases/TableColumnType.md)

Defined in: [core/src/types.ts:320](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L320)

Column data type

***

### nullable

> **nullable**: `boolean`

Defined in: [core/src/types.ts:322](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L322)

Whether column accepts null values

***

### defaultValue?

> `optional` **defaultValue**: `unknown`

Defined in: [core/src/types.ts:324](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L324)

Optional default value

***

### doc?

> `optional` **doc**: `string`

Defined in: [core/src/types.ts:326](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L326)

Optional documentation
