[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / storageToProvider

# Function: storageToProvider()

> **storageToProvider**(`storage`): [`StorageProvider`](../interfaces/StorageProvider.md)

Defined in: [core/src/storage-provider.ts:544](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L544)

Adapt a legacy Storage interface to StorageProvider.

Use this when migrating existing Storage code to use StorageProvider.

## Parameters

### storage

[`Storage`](../interfaces/Storage.md)

Storage interface to adapt

## Returns

[`StorageProvider`](../interfaces/StorageProvider.md)

StorageProvider implementation
