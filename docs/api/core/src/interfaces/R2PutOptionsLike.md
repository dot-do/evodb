[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / R2PutOptionsLike

# Interface: R2PutOptionsLike

Defined in: core/src/types/r2.ts:277

Minimal R2 put options.

## Properties

### httpMetadata?

> `optional` **httpMetadata**: `object`

Defined in: core/src/types/r2.ts:278

#### contentType?

> `optional` **contentType**: `string`

***

### customMetadata?

> `optional` **customMetadata**: `Record`\<`string`, `string`\>

Defined in: core/src/types/r2.ts:279

***

### onlyIf?

> `optional` **onlyIf**: `object`

Defined in: core/src/types/r2.ts:280

#### etagMatches?

> `optional` **etagMatches**: `string`

#### etagDoesNotMatch?

> `optional` **etagDoesNotMatch**: `string`
