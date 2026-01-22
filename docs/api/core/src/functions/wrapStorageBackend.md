[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / wrapStorageBackend

# Function: wrapStorageBackend()

> **wrapStorageBackend**(`backend`, `keyPrefix?`): [`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)

Defined in: [core/src/storage.ts:659](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L659)

Wrap a raw R2Bucket (or R2BucketLike) in an ObjectStorageAdapter
Provides backward compatibility - accepts either an adapter or a raw bucket

## Parameters

### backend

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md) | `R2BucketLike`

### keyPrefix?

`string`

## Returns

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)
