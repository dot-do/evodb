[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / sanitizeInput

# Function: sanitizeInput()

> **sanitizeInput**(`input`, `options`): `string`

Defined in: core/src/validation.ts:426

Sanitizes input strings by removing dangerous characters and escaping HTML.

This function:
- Removes control characters (preserving tabs/newlines by default)
- Escapes HTML entities to prevent XSS
- Truncates overly long inputs
- Preserves valid Unicode characters

## Parameters

### input

`string`

The string to sanitize

### options

[`SanitizeInputOptions`](../interfaces/SanitizeInputOptions.md) = `{}`

Configuration options

## Returns

`string`

The sanitized string

## Example

```typescript
sanitizeInput('<script>alert(1)</script>');
// Returns: '&lt;script&gt;alert(1)&lt;/script&gt;'

sanitizeInput('hello\0world');
// Returns: 'helloworld'

sanitizeInput('Hello 世界');
// Returns: 'Hello 世界' (Unicode preserved)
```
