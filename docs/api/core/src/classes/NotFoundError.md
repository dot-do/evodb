[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / NotFoundError

# Class: NotFoundError

Defined in: [core/src/storage-provider.ts:105](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L105)

Error thrown when a requested key is not found in storage.
This is typically used for operations that require the key to exist
(e.g., readRange on a non-existent file).

Note: get() and exists() return null/false instead of throwing this error.

## Example

```typescript
if (error instanceof NotFoundError) {
  console.log(`File not found: ${error.path}`);
}
```

## Extends

- [`StorageProviderError`](StorageProviderError.md)

## Constructors

### Constructor

> **new NotFoundError**(`path`, `options?`): `NotFoundError`

Defined in: [core/src/storage-provider.ts:106](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L106)

#### Parameters

##### path

`string`

##### options?

###### cause?

`Error`

#### Returns

`NotFoundError`

#### Overrides

[`StorageProviderError`](StorageProviderError.md).[`constructor`](StorageProviderError.md#constructor)

## Properties

### cause?

> `readonly` `optional` **cause**: `Error`

Defined in: [core/src/storage-provider.ts:80](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L80)

#### Inherited from

[`StorageProviderError`](StorageProviderError.md).[`cause`](StorageProviderError.md#cause)

***

### path

> `readonly` **path**: `string`

Defined in: [core/src/storage-provider.ts:107](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L107)
