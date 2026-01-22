[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / Storage

# ~~Interface: Storage~~

Defined in: [core/src/storage.ts:53](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L53)

Unified Storage interface - the single source of truth for storage operations.

## Deprecated

Use StorageProvider from @evodb/core/storage instead.
This interface is maintained for backward compatibility.

Migration guide:
- read() -> get()
- write() -> put()
- list() returns string[] instead of { paths: string[] }
- delete() -> delete() (same)
- exists() -> exists() (same, but required in StorageProvider)

This interface consolidates the following overlapping abstractions:
1. StorageAdapter (core/types.ts) - DO block storage (writeBlock/readBlock)
2. ObjectStorageAdapter (core/storage.ts) - R2-compatible (put/get)
3. R2StorageAdapter (lakehouse/types.ts) - High-level JSON/binary
4. StorageAdapter (lance-reader/types.ts) - Read-only lance files

Design principles:
- Simple, minimal interface (4 core methods)
- Matches common object storage semantics (R2, S3, GCS)
- Uses Uint8Array for binary data (not ArrayBuffer) for consistency
- Optional methods for advanced use cases (exists, head, readRange)

## Example

```typescript
// New code should use StorageProvider:
import { StorageProvider, createInMemoryProvider } from '@evodb/core';
const provider: StorageProvider = createInMemoryProvider();
await provider.put('test.bin', new Uint8Array([1, 2, 3]));

// Legacy code using Storage (deprecated):
const storage = new MemoryStorage();
await storage.write('test.bin', new Uint8Array([1, 2, 3]));
```

## Methods

### ~~read()~~

> **read**(`path`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage.ts:55](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L55)

Read data from a path, returns null if not found

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

***

### ~~write()~~

> **write**(`path`, `data`): `Promise`\<`void`\>

Defined in: [core/src/storage.ts:58](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L58)

Write data to a path

#### Parameters

##### path

`string`

##### data

`Uint8Array`

#### Returns

`Promise`\<`void`\>

***

### ~~list()~~

> **list**(`prefix`): `Promise`\<\{ `paths`: `string`[]; \}\>

Defined in: [core/src/storage.ts:61](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L61)

List objects with a prefix, returns array of paths

#### Parameters

##### prefix

`string`

#### Returns

`Promise`\<\{ `paths`: `string`[]; \}\>

***

### ~~delete()~~

> **delete**(`path`): `Promise`\<`void`\>

Defined in: [core/src/storage.ts:64](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L64)

Delete an object at path

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`void`\>

***

### ~~exists()?~~

> `optional` **exists**(`path`): `Promise`\<`boolean`\>

Defined in: [core/src/storage.ts:71](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L71)

Check if an object exists (optional - can be derived from read)

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`boolean`\>

***

### ~~head()?~~

> `optional` **head**(`path`): `Promise`\<[`StorageMetadata`](StorageMetadata.md)\>

Defined in: [core/src/storage.ts:74](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L74)

Get object metadata without reading body (optional)

#### Parameters

##### path

`string`

#### Returns

`Promise`\<[`StorageMetadata`](StorageMetadata.md)\>

***

### ~~readRange()?~~

> `optional` **readRange**(`path`, `offset`, `length`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage.ts:77](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L77)

Read a byte range from an object (optional - for efficient partial reads)

#### Parameters

##### path

`string`

##### offset

`number`

##### length

`number`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>
