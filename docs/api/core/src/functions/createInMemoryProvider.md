[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / createInMemoryProvider

# Function: createInMemoryProvider()

> **createInMemoryProvider**(): [`InMemoryStorageProvider`](../classes/InMemoryStorageProvider.md)

Defined in: [core/src/storage-provider.ts:453](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L453)

Create an in-memory storage provider for testing.

## Returns

[`InMemoryStorageProvider`](../classes/InMemoryStorageProvider.md)

InMemoryStorageProvider implementation

## Example

```typescript
const provider = createInMemoryProvider();
await provider.put('test.bin', new Uint8Array([1, 2, 3]));
```
