[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / CorruptedBlockError

# Class: CorruptedBlockError

Defined in: [core/src/errors.ts:494](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L494)

Error thrown when block data is corrupted

This is a convenience alias for StorageError with corruption-specific defaults.
For new code, prefer using StorageError directly with CORRUPTED_* codes.

This error is thrown when reading block data that has been corrupted,
such as when R2 returns corrupted data due to storage issues, network
transmission errors, or other data integrity problems.

Error codes:
- CORRUPTED_BLOCK: Generic corruption error
- INVALID_MAGIC: Magic number does not match expected value
- TRUNCATED_DATA: Data is shorter than expected
- CHECKSUM_MISMATCH: CRC32 checksum validation failed
- UNSUPPORTED_VERSION: Block version is not supported
- INVALID_STRUCTURE: Block structure is invalid (bad column count, sizes, etc.)

## Example

```typescript
throw new CorruptedBlockError('Invalid magic number: expected 0x434A4C42, got 0x00000000', 'INVALID_MAGIC', {
  expected: 0x434A4C42,
  actual: 0x00000000,
});
```

## Extends

- [`StorageError`](StorageError.md)

## Constructors

### Constructor

> **new CorruptedBlockError**(`message`, `code`, `details?`): `CorruptedBlockError`

Defined in: [core/src/errors.ts:502](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L502)

Create a new CorruptedBlockError

#### Parameters

##### message

`string`

Human-readable error message describing the corruption

##### code

`string` = `'CORRUPTED_BLOCK'`

Error code (default: 'CORRUPTED_BLOCK')

##### details?

[`CorruptedBlockDetails`](../interfaces/CorruptedBlockDetails.md)

Additional details about the corruption

#### Returns

`CorruptedBlockError`

#### Overrides

[`StorageError`](StorageError.md).[`constructor`](StorageError.md#constructor)

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

[`StorageError`](StorageError.md).[`code`](StorageError.md#code)

***

### details?

> `readonly` `optional` **details**: `Record`\<`string`, `unknown`\>

Defined in: [core/src/errors.ts:167](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L167)

Optional details for debugging (used by validation and storage errors)

#### Inherited from

[`StorageError`](StorageError.md).[`details`](StorageError.md#details)
