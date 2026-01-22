[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / CorruptedBlockDetails

# Interface: CorruptedBlockDetails

Defined in: [core/src/errors.ts:451](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L451)

Details about block corruption for debugging and logging

## Properties

### expected?

> `optional` **expected**: `number`

Defined in: [core/src/errors.ts:453](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L453)

Expected value (for mismatches)

***

### actual?

> `optional` **actual**: `number`

Defined in: [core/src/errors.ts:455](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L455)

Actual value found

***

### offset?

> `optional` **offset**: `number`

Defined in: [core/src/errors.ts:457](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L457)

Byte offset where corruption was detected

***

### actualSize?

> `optional` **actualSize**: `number`

Defined in: [core/src/errors.ts:459](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L459)

Actual size of the data

***

### minExpectedSize?

> `optional` **minExpectedSize**: `number`

Defined in: [core/src/errors.ts:461](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L461)

Minimum expected size

***

### version?

> `optional` **version**: `number`

Defined in: [core/src/errors.ts:463](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L463)

Version found in corrupted block

***

### supportedVersions?

> `optional` **supportedVersions**: `number`[]

Defined in: [core/src/errors.ts:465](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L465)

List of supported versions
