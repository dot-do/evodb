[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ZodErrorLike

# Interface: ZodErrorLike

Defined in: core/src/validation.ts:627

ZodError-like interface for JSON parse failures
This allows consistent error handling without requiring zod as a runtime dependency

## Properties

### issues

> **issues**: `object`[]

Defined in: core/src/validation.ts:628

#### code

> **code**: `string`

#### path

> **path**: (`string` \| `number`)[]

#### message

> **message**: `string`

***

### message

> **message**: `string`

Defined in: core/src/validation.ts:633
