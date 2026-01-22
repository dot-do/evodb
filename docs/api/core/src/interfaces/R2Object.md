[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / R2Object

# Interface: R2Object

Defined in: core/src/types/r2.ts:119

R2 object metadata (without body).
Returned by head() and as part of list() results.

## Extended by

- [`R2ObjectBody`](R2ObjectBody.md)

## Properties

### key

> **key**: `string`

Defined in: core/src/types/r2.ts:121

Object key/path

***

### version

> **version**: `string`

Defined in: core/src/types/r2.ts:123

Version identifier

***

### size

> **size**: `number`

Defined in: core/src/types/r2.ts:125

Object size in bytes

***

### etag

> **etag**: `string`

Defined in: core/src/types/r2.ts:127

ETag for cache validation

***

### httpEtag

> **httpEtag**: `string`

Defined in: core/src/types/r2.ts:129

HTTP-formatted ETag (with quotes)

***

### checksums

> **checksums**: [`R2Checksums`](R2Checksums.md)

Defined in: core/src/types/r2.ts:131

Object checksums

***

### uploaded

> **uploaded**: `Date`

Defined in: core/src/types/r2.ts:133

Upload timestamp

***

### httpMetadata?

> `optional` **httpMetadata**: [`R2HTTPMetadata`](R2HTTPMetadata.md)

Defined in: core/src/types/r2.ts:135

HTTP metadata

***

### customMetadata?

> `optional` **customMetadata**: `Record`\<`string`, `string`\>

Defined in: core/src/types/r2.ts:137

Custom metadata key-value pairs

***

### range?

> `optional` **range**: [`R2Range`](R2Range.md)

Defined in: core/src/types/r2.ts:139

Range information (present when partial read requested)
