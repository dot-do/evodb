[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / InMemoryStorageProvider

# Class: InMemoryStorageProvider

Defined in: [core/src/storage-provider.ts:273](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L273)

In-memory implementation of StorageProvider.
Use for unit testing storage-dependent code.

Features:
- Stores data in a Map (isolated per instance)
- Defensive copying prevents mutation issues
- Provides clear() and size for test utilities

## Example

```typescript
const provider = new InMemoryStorageProvider();
await provider.put('test.bin', new Uint8Array([1, 2, 3]));
const data = await provider.get('test.bin');
expect(data).toEqual(new Uint8Array([1, 2, 3]));

// Clean up after test
provider.clear();
```

## Implements

- [`StorageProvider`](../interfaces/StorageProvider.md)

## Constructors

### Constructor

> **new InMemoryStorageProvider**(): `InMemoryStorageProvider`

#### Returns

`InMemoryStorageProvider`

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [core/src/storage-provider.ts:311](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L311)

Get the number of stored objects.
Useful for test assertions.

##### Returns

`number`

## Methods

### get()

> **get**(`key`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [core/src/storage-provider.ts:276](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L276)

Retrieve data from storage.

#### Parameters

##### key

`string`

The storage key/path

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

The data as Uint8Array, or null if key doesn't exist

#### Implementation of

[`StorageProvider`](../interfaces/StorageProvider.md).[`get`](../interfaces/StorageProvider.md#get)

***

### put()

> **put**(`key`, `data`): `Promise`\<`void`\>

Defined in: [core/src/storage-provider.ts:281](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L281)

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

#### Implementation of

[`StorageProvider`](../interfaces/StorageProvider.md).[`put`](../interfaces/StorageProvider.md#put)

***

### delete()

> **delete**(`key`): `Promise`\<`void`\>

Defined in: [core/src/storage-provider.ts:285](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L285)

Delete data from storage.
Does not throw if key doesn't exist.

#### Parameters

##### key

`string`

The storage key/path

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`StorageProvider`](../interfaces/StorageProvider.md).[`delete`](../interfaces/StorageProvider.md#delete)

***

### list()

> **list**(`prefix`): `Promise`\<`string`[]\>

Defined in: [core/src/storage-provider.ts:289](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L289)

List keys with a given prefix.

#### Parameters

##### prefix

`string`

The prefix to filter keys

#### Returns

`Promise`\<`string`[]\>

Array of matching keys, sorted alphabetically

#### Implementation of

[`StorageProvider`](../interfaces/StorageProvider.md).[`list`](../interfaces/StorageProvider.md#list)

***

### exists()

> **exists**(`key`): `Promise`\<`boolean`\>

Defined in: [core/src/storage-provider.ts:295](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L295)

Check if a key exists in storage.

#### Parameters

##### key

`string`

The storage key/path

#### Returns

`Promise`\<`boolean`\>

true if key exists, false otherwise

#### Implementation of

[`StorageProvider`](../interfaces/StorageProvider.md).[`exists`](../interfaces/StorageProvider.md#exists)

***

### clear()

> **clear**(): `void`

Defined in: [core/src/storage-provider.ts:303](https://github.com/dot-do/evodb/blob/main/core/src/storage-provider.ts#L303)

Clear all stored data.
Useful for test cleanup between test cases.

#### Returns

`void`
