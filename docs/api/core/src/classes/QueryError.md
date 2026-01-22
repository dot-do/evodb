[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / QueryError

# Class: QueryError

Defined in: [core/src/errors.ts:203](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L203)

Error thrown when a query operation fails

Examples:
- Invalid query syntax
- Query execution failure
- Unsupported query operation

Common codes: QUERY_ERROR, TABLE_NOT_FOUND, QUERY_SYNTAX_ERROR

## Example

```typescript
throw new QueryError('Invalid filter operator: unknown');
throw new QueryError('Table not found: users', 'TABLE_NOT_FOUND');
```

## Extends

- [`EvoDBError`](EvoDBError.md)

## Constructors

### Constructor

> **new QueryError**(`message`, `code`, `details?`): `QueryError`

Defined in: [core/src/errors.ts:211](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L211)

Create a new QueryError

#### Parameters

##### message

`string`

Human-readable error message

##### code

`string` = `'QUERY_ERROR'`

Error code (default: 'QUERY_ERROR')

##### details?

`Record`\<`string`, `unknown`\>

Optional additional details for debugging

#### Returns

`QueryError`

#### Overrides

[`EvoDBError`](EvoDBError.md).[`constructor`](EvoDBError.md#constructor)

## Properties

### code

> `readonly` **code**: `string`

Defined in: [core/src/errors.ts:162](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L162)

Error code for programmatic identification

Common codes:
- QUERY_ERROR: Query-related errors
- TIMEOUT_ERROR: Operation timeout
- VALIDATION_ERROR: Data validation failures
- STORAGE_ERROR: Storage operation failures

#### Inherited from

[`EvoDBError`](EvoDBError.md).[`code`](EvoDBError.md#code)

***

### details?

> `readonly` `optional` **details**: `Record`\<`string`, `unknown`\>

Defined in: [core/src/errors.ts:167](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L167)

Optional details for debugging (used by validation and storage errors)

#### Inherited from

[`EvoDBError`](EvoDBError.md).[`details`](EvoDBError.md#details)
