[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / StorageError

# Class: StorageError

Defined in: [core/src/errors.ts:377](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L377)

Error thrown when a storage operation fails

Examples:
- Failed to read/write to R2
- Storage quota exceeded
- Permission denied
- Network errors during storage operations
- Block corruption (invalid magic, checksum mismatch, etc.)

Common codes: STORAGE_ERROR, NOT_FOUND, PERMISSION_DENIED, QUOTA_EXCEEDED,
CORRUPTED_BLOCK, INVALID_MAGIC, CHECKSUM_MISMATCH, TRUNCATED_DATA

## Example

```typescript
throw new StorageError('Failed to write block to R2');
throw new StorageError('Storage quota exceeded', StorageErrorCode.QUOTA_EXCEEDED);
throw new StorageError('Custom error', 'CUSTOM_CODE'); // backward compatible
// Block corruption with details
throw new StorageError('Invalid magic number', 'INVALID_MAGIC', {
  expected: 0x434A4C42, actual: 0x00000000, offset: 0
});
```

## Extends

- [`EvoDBError`](EvoDBError.md)

## Extended by

- [`CorruptedBlockError`](CorruptedBlockError.md)

## Constructors

### Constructor

> **new StorageError**(`message`, `code`, `details?`): `StorageError`

Defined in: [core/src/errors.ts:385](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L385)

Create a new StorageError

#### Parameters

##### message

`string`

Human-readable error message

##### code

`string` = `'STORAGE_ERROR'`

Error code (default: 'STORAGE_ERROR'). Can be a StorageErrorCode enum value or a custom string.

##### details?

`Record`\<`string`, `unknown`\>

Optional additional details for debugging (e.g., expected/actual values, offset)

#### Returns

`StorageError`

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
