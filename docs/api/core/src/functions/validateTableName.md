[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / validateTableName

# Function: validateTableName()

> **validateTableName**(`tableName`): `void`

Defined in: [core/src/storage.ts:710](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L710)

Validate a table name to prevent SQL injection.
Table names must:
- Start with a letter or underscore
- Contain only alphanumeric characters and underscores
- Not be empty

## Parameters

### tableName

`string`

## Returns

`void`

## Throws

Error if table name is invalid
