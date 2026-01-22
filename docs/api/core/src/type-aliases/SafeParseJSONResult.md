[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SafeParseJSONResult

# Type Alias: SafeParseJSONResult\<T\>

> **SafeParseJSONResult**\<`T`\> = \{ `success`: `true`; `data`: `T`; `error?`: `never`; \} \| \{ `success`: `false`; `data?`: `never`; `error`: [`ZodErrorLike`](../interfaces/ZodErrorLike.md); \}

Defined in: core/src/validation.ts:619

Result type for safe JSON parsing operations

## Type Parameters

### T

`T`
