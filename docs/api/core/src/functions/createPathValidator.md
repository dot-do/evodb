[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / createPathValidator

# Function: createPathValidator()

> **createPathValidator**(`options`): [`PathValidator`](../type-aliases/PathValidator.md)

Defined in: core/src/validation.ts:322

Creates a path validator with configurable options.

This validator protects against:
- Path traversal attacks (../)
- Encoded path traversal
- Null byte injection
- Shell metacharacters
- Overly long paths

## Parameters

### options

[`PathValidatorOptions`](../interfaces/PathValidatorOptions.md) = `{}`

Configuration options

## Returns

[`PathValidator`](../type-aliases/PathValidator.md)

A validator function that returns true for valid paths

## Example

```typescript
const validate = createPathValidator();
validate('blocks/123');           // true
validate('data/2024/01/file.bin'); // true
validate('../secret');            // false - traversal
validate('/etc/passwd');          // false - absolute path
validate('file%00.txt');          // false - null byte
```
