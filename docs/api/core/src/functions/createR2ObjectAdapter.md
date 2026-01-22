[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / createR2ObjectAdapter

# Function: createR2ObjectAdapter()

> **createR2ObjectAdapter**(`bucket`, `keyPrefix?`): [`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)

Defined in: [core/src/storage.ts:644](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L644)

Create an R2 storage adapter from a bucket binding

## Parameters

### bucket

`R2BucketLike`

R2Bucket binding or R2BucketLike interface

### keyPrefix?

`string`

Optional prefix to prepend to all keys

## Returns

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)
