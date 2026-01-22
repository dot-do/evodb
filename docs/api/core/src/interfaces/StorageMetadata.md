[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / StorageMetadata

# Interface: StorageMetadata

Defined in: [core/src/storage.ts:83](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L83)

Storage metadata returned by head() operation

## Properties

### size

> **size**: `number`

Defined in: [core/src/storage.ts:85](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L85)

Size in bytes

***

### etag

> **etag**: `string`

Defined in: [core/src/storage.ts:87](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L87)

ETag for cache validation

***

### lastModified?

> `optional` **lastModified**: `Date`

Defined in: [core/src/storage.ts:89](https://github.com/dot-do/evodb/blob/main/core/src/storage.ts#L89)

Last modification time
