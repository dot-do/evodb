[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / JSONValidationError

# Class: JSONValidationError

Defined in: core/src/validation.ts:661

Error thrown when JSON validation fails

## Extends

- `Error`

## Constructors

### Constructor

> **new JSONValidationError**(`message`, `zodError`): `JSONValidationError`

Defined in: core/src/validation.ts:662

#### Parameters

##### message

`string`

##### zodError

[`ZodErrorLike`](../interfaces/ZodErrorLike.md)

#### Returns

`JSONValidationError`

#### Overrides

`Error.constructor`

## Properties

### zodError

> `readonly` **zodError**: [`ZodErrorLike`](../interfaces/ZodErrorLike.md)

Defined in: core/src/validation.ts:664
