[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / BlockDataValidationError

# Class: BlockDataValidationError

Defined in: [query/src/simple-engine.ts:393](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L393)

Error thrown when block data validation fails.

## Extends

- `Error`

## Constructors

### Constructor

> **new BlockDataValidationError**(`message`, `blockPath`, `code`, `details?`): `BlockDataValidationError`

Defined in: [query/src/simple-engine.ts:396](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L396)

#### Parameters

##### message

`string`

##### blockPath

`string`

##### code

[`BlockDataValidationErrorCode`](../enumerations/BlockDataValidationErrorCode.md)

##### details?

`Record`\<`string`, `unknown`\>

#### Returns

`BlockDataValidationError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: [`BlockDataValidationErrorCode`](../enumerations/BlockDataValidationErrorCode.md)

Defined in: [query/src/simple-engine.ts:394](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L394)

***

### blockPath

> `readonly` **blockPath**: `string`

Defined in: [query/src/simple-engine.ts:398](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L398)

***

### details?

> `readonly` `optional` **details**: `Record`\<`string`, `unknown`\>

Defined in: [query/src/simple-engine.ts:400](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L400)
