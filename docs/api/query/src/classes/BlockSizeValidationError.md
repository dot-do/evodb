[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / BlockSizeValidationError

# Class: BlockSizeValidationError

Defined in: [query/src/simple-engine.ts:361](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L361)

Error thrown when block size validation fails.

## Extends

- `Error`

## Constructors

### Constructor

> **new BlockSizeValidationError**(`message`, `blockPath`, `code`, `details?`): `BlockSizeValidationError`

Defined in: [query/src/simple-engine.ts:365](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L365)

#### Parameters

##### message

`string`

##### blockPath

`string`

##### code

[`BlockSizeValidationErrorCode`](../enumerations/BlockSizeValidationErrorCode.md)

##### details?

###### actualSize?

`number`

###### maxSize?

`number`

#### Returns

`BlockSizeValidationError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: [`BlockSizeValidationErrorCode`](../enumerations/BlockSizeValidationErrorCode.md)

Defined in: [query/src/simple-engine.ts:362](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L362)

***

### details?

> `readonly` `optional` **details**: `object`

Defined in: [query/src/simple-engine.ts:363](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L363)

#### actualSize?

> `optional` **actualSize**: `number`

#### maxSize?

> `optional` **maxSize**: `number`

***

### blockPath

> `readonly` **blockPath**: `string`

Defined in: [query/src/simple-engine.ts:367](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L367)
