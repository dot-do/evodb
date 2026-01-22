[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ZodSchemaLike

# Interface: ZodSchemaLike\<T\>

Defined in: core/src/validation.ts:640

Interface for Zod-compatible schema
This allows using any Zod schema without importing the full zod package

## Type Parameters

### T

`T`

## Methods

### safeParse()

> **safeParse**(`data`): \{ `success`: `true`; `data`: `T`; \} \| \{ `success`: `false`; `error`: [`ZodErrorLike`](ZodErrorLike.md); \}

Defined in: core/src/validation.ts:641

#### Parameters

##### data

`unknown`

#### Returns

\{ `success`: `true`; `data`: `T`; \} \| \{ `success`: `false`; `error`: [`ZodErrorLike`](ZodErrorLike.md); \}

***

### parse()

> **parse**(`data`): `T`

Defined in: core/src/validation.ts:642

#### Parameters

##### data

`unknown`

#### Returns

`T`
