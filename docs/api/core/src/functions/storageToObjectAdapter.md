[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / storageToObjectAdapter

# Function: storageToObjectAdapter()

> **storageToObjectAdapter**(`storage`): [`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)

Defined in: [core/src/storage.ts:533](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L533)

Wrap a unified Storage implementation to provide the legacy ObjectStorageAdapter interface.
Use this when you need to pass a Storage to code that expects ObjectStorageAdapter.

## Parameters

### storage

[`Storage`](../interfaces/Storage.md)

## Returns

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)
