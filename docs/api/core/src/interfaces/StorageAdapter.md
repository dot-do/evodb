[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / StorageAdapter

# ~~Interface: StorageAdapter~~

Defined in: [core/src/types.ts:249](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L249)

Storage adapter interface for DO block storage.

## Deprecated

Use StorageProvider from @evodb/core/storage instead.
This interface is maintained for backward compatibility with existing
DO block storage code.

Migration guide:
- writeBlock() -> put()
- readBlock() -> get()
- listBlocks() -> list()
- deleteBlock() -> delete()

## Example

```typescript
// Old code using StorageAdapter
const adapter: StorageAdapter = createMemoryAdapter();
await adapter.writeBlock('block-1', data);

// New code using StorageProvider
import { createInMemoryProvider, StorageProvider } from '@evodb/core';
const provider: StorageProvider = createInMemoryProvider();
await provider.put('block-1', data);
```

## Methods

### ~~writeBlock()~~

> **writeBlock**(`id`, `data`): `Promise`\<`void`\>

Defined in: [core/src/types.ts:250](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L250)

#### Parameters

##### id

`string`

##### data

`Uint8Array`

#### Returns

`Promise`\<`void`\>

***

### ~~readBlock()~~

> **readBlock**(`id`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/types.ts:251](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L251)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

***

### ~~listBlocks()~~

> **listBlocks**(`prefix?`): `Promise`\<`string`[]\>

Defined in: [core/src/types.ts:252](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L252)

#### Parameters

##### prefix?

`string`

#### Returns

`Promise`\<`string`[]\>

***

### ~~deleteBlock()~~

> **deleteBlock**(`id`): `Promise`\<`void`\>

Defined in: [core/src/types.ts:253](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L253)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>
