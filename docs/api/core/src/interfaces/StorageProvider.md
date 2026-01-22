[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / StorageProvider

# Interface: StorageProvider

Defined in: [core/src/storage-provider.ts:157](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L157)

Unified StorageProvider interface - the canonical interface for storage operations.

This interface consolidates multiple overlapping storage abstractions into a
single, consistent API. Use this interface for all new code.

Design principles:
- Simple, minimal interface (5 core methods)
- Matches common object storage semantics (R2, S3, GCS)
- Uses Uint8Array for binary data (not ArrayBuffer) for consistency
- Returns null/false for missing keys (not exceptions)
- Consistent method naming (get/put/delete/list/exists)

Migration from other interfaces:
- Storage: read() -> get(), write() -> put()
- ObjectStorageAdapter: Same naming, but list() returns string[] not { paths: string[] }
- StorageAdapter: readBlock() -> get(), writeBlock() -> put(), listBlocks() -> list()
- R2StorageAdapter: readBinary() -> get(), writeBinary() -> put()
- lance-reader StorageAdapter: Same naming (get/list/exists)

## Example

```typescript
// In production: use R2StorageProvider
const provider = new R2StorageProvider(env.MY_BUCKET);

// In tests: use InMemoryStorageProvider
const testProvider = new InMemoryStorageProvider();

// Both implement the same interface
async function processData(provider: StorageProvider) {
  const data = await provider.get('path/to/file.bin');
  if (!data) {
    await provider.put('path/to/file.bin', new Uint8Array([1, 2, 3]));
  }
}
```

## Methods

### get()

> **get**(`key`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage-provider.ts:164](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L164)

Retrieve data from storage.

#### Parameters

##### key

`string`

The storage key/path

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

The data as Uint8Array, or null if key doesn't exist

***

### put()

> **put**(`key`, `data`): `Promise`\<`void`\>

Defined in: [core/src/storage-provider.ts:172](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L172)

Store data in storage.

#### Parameters

##### key

`string`

The storage key/path

##### data

`Uint8Array`

The data to store

#### Returns

`Promise`\<`void`\>

***

### delete()

> **delete**(`key`): `Promise`\<`void`\>

Defined in: [core/src/storage-provider.ts:180](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L180)

Delete data from storage.
Does not throw if key doesn't exist.

#### Parameters

##### key

`string`

The storage key/path

#### Returns

`Promise`\<`void`\>

***

### list()

> **list**(`prefix`): `Promise`\<`string`[]\>

Defined in: [core/src/storage-provider.ts:188](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L188)

List keys with a given prefix.

#### Parameters

##### prefix

`string`

The prefix to filter keys

#### Returns

`Promise`\<`string`[]\>

Array of matching keys, sorted alphabetically

***

### exists()

> **exists**(`key`): `Promise`\<`boolean`\>

Defined in: [core/src/storage-provider.ts:196](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L196)

Check if a key exists in storage.

#### Parameters

##### key

`string`

The storage key/path

#### Returns

`Promise`\<`boolean`\>

true if key exists, false otherwise
