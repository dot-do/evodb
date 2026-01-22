[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ValidationResult

# Interface: ValidationResult

Defined in: core/src/validation.ts:78

Detailed validation result with reason for failure

## Properties

### valid

> **valid**: `boolean`

Defined in: core/src/validation.ts:80

Whether the input is valid

***

### reason?

> `optional` **reason**: `string`

Defined in: core/src/validation.ts:82

Reason for validation failure (only set if valid is false)

***

### code?

> `optional` **code**: `string`

Defined in: core/src/validation.ts:84

Error code for programmatic handling
