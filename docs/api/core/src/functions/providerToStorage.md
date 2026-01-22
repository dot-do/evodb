[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / providerToStorage

# ~~Function: providerToStorage()~~

> **providerToStorage**(`provider`): [`Storage`](../interfaces/Storage.md)

Defined in: [core/src/storage-provider.ts:475](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L475)

Adapt a StorageProvider to the legacy Storage interface.

Use this when passing a StorageProvider to code that expects
the Storage interface (read/write/list/delete).

## Parameters

### provider

[`StorageProvider`](../interfaces/StorageProvider.md)

StorageProvider to adapt

## Returns

[`Storage`](../interfaces/Storage.md)

Storage interface

## Deprecated

Use StorageProvider directly in new code
