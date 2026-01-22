[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / objectAdapterToProvider

# Function: objectAdapterToProvider()

> **objectAdapterToProvider**(`adapter`): [`StorageProvider`](../interfaces/StorageProvider.md)

Defined in: [core/src/storage-provider.ts:577](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L577)

Adapt a legacy ObjectStorageAdapter to StorageProvider.

Use this when migrating existing ObjectStorageAdapter code to use StorageProvider.

## Parameters

### adapter

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)

ObjectStorageAdapter to adapt

## Returns

[`StorageProvider`](../interfaces/StorageProvider.md)

StorageProvider implementation
