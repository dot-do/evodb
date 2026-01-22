[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / FastDecodeOptions

# Interface: FastDecodeOptions

Defined in: [core/src/encode.ts:1222](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L1222)

Fast decode options for snippet constraints

## Properties

### useTypedArray?

> `optional` **useTypedArray**: `boolean`

Defined in: [core/src/encode.ts:1224](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L1224)

Return typed array instead of plain array for numeric types

***

### zeroCopy?

> `optional` **zeroCopy**: `boolean`

Defined in: [core/src/encode.ts:1226](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L1226)

Skip decoding and return raw buffer (zero-copy)

***

### rowRange?

> `optional` **rowRange**: \[`number`, `number`\]

Defined in: [core/src/encode.ts:1228](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L1228)

Only decode specific row range
