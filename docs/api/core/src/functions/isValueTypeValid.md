[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isValueTypeValid

# Function: isValueTypeValid()

> **isValueTypeValid**(`value`, `expectedType`): `boolean`

Defined in: [core/src/encode.ts:187](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L187)

Check if a runtime value matches the expected Type enum.
This is a type guard that validates values against the columnar type system.

## Parameters

### value

`unknown`

The value to check

### expectedType

[`Type`](../enumerations/Type.md)

The expected Type enum value

## Returns

`boolean`

true if the value matches the expected type, false otherwise

## Example

```typescript
isValueTypeValid(42, Type.Int32) // true
isValueTypeValid('hello', Type.String) // true
isValueTypeValid('hello', Type.Int32) // false
```
