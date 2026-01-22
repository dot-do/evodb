[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / StorageProviderError

# Class: StorageProviderError

Defined in: [core/src/storage-provider.ts:79](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L79)

Base error class for all storage provider errors.
Provides consistent error handling across all storage implementations.

## Example

```typescript
try {
  await provider.get('path/to/file.bin');
} catch (error) {
  if (error instanceof StorageProviderError) {
    console.error('Storage error:', error.message);
  }
}
```

## Extends

- `Error`

## Extended by

- [`NotFoundError`](NotFoundError.md)

## Constructors

### Constructor

> **new StorageProviderError**(`message`, `options?`): `StorageProviderError`

Defined in: [core/src/storage-provider.ts:82](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L82)

#### Parameters

##### message

`string`

##### options?

###### cause?

`Error`

#### Returns

`StorageProviderError`

#### Overrides

`Error.constructor`

## Properties

### cause?

> `readonly` `optional` **cause**: `Error`

Defined in: [core/src/storage-provider.ts:80](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L80)
