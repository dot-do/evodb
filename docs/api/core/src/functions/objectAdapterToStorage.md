[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / objectAdapterToStorage

# Function: objectAdapterToStorage()

> **objectAdapterToStorage**(`adapter`): [`Storage`](../interfaces/Storage.md)

Defined in: [core/src/storage.ts:582](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L582)

Wrap a legacy ObjectStorageAdapter to provide the unified Storage interface.
Use this when migrating existing code to the new interface.

## Parameters

### adapter

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)

## Returns

[`Storage`](../interfaces/Storage.md)
