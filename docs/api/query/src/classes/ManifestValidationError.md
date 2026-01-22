[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ManifestValidationError

# Class: ManifestValidationError

Defined in: [query/src/simple-engine.ts:604](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L604)

Error thrown when manifest validation fails.

## Extends

- `Error`

## Constructors

### Constructor

> **new ManifestValidationError**(`message`, `code`, `details?`): `ManifestValidationError`

Defined in: [query/src/simple-engine.ts:607](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L607)

#### Parameters

##### message

`string`

##### code

[`ManifestValidationErrorCode`](../enumerations/ManifestValidationErrorCode.md)

##### details?

`Record`\<`string`, `unknown`\>

#### Returns

`ManifestValidationError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: [`ManifestValidationErrorCode`](../enumerations/ManifestValidationErrorCode.md)

Defined in: [query/src/simple-engine.ts:605](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L605)

***

### details?

> `readonly` `optional` **details**: `Record`\<`string`, `unknown`\>

Defined in: [query/src/simple-engine.ts:610](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L610)
