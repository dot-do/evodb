[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / createStorageProvider

# Function: createStorageProvider()

> **createStorageProvider**(`bucket`, `keyPrefix?`): [`R2StorageProvider`](../classes/R2StorageProvider.md)

Defined in: [core/src/storage-provider.ts:435](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L435)

Create an R2 storage provider from a bucket binding.

## Parameters

### bucket

[`StorageProviderR2BucketLike`](../interfaces/StorageProviderR2BucketLike.md)

R2Bucket binding

### keyPrefix?

`string`

Optional prefix to prepend to all keys

## Returns

[`R2StorageProvider`](../classes/R2StorageProvider.md)

StorageProvider implementation

## Example

```typescript
const provider = createStorageProvider(env.MY_BUCKET);
// or with prefix
const tenantProvider = createStorageProvider(env.MY_BUCKET, 'tenant-123');
```
