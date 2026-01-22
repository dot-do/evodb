[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / providerToObjectAdapter

# ~~Function: providerToObjectAdapter()~~

> **providerToObjectAdapter**(`provider`): [`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)

Defined in: [core/src/storage-provider.ts:507](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L507)

Adapt a StorageProvider to the legacy ObjectStorageAdapter interface.

Use this when passing a StorageProvider to code that expects
the ObjectStorageAdapter interface (put/get/list/head/delete).

## Parameters

### provider

[`StorageProvider`](../interfaces/StorageProvider.md)

StorageProvider to adapt

## Returns

[`ObjectStorageAdapter`](../interfaces/ObjectStorageAdapter.md)

ObjectStorageAdapter interface

## Deprecated

Use StorageProvider directly in new code
