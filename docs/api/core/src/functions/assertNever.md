[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / assertNever

# Function: assertNever()

> **assertNever**(`value`, `message?`): `never`

Defined in: [core/src/types.ts:283](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L283)

Assert that a value is of type `never` at compile time.
Used in switch statements to ensure all cases are handled.

## Parameters

### value

`never`

### message?

`string`

## Returns

`never`

## Example

```typescript
switch (value.type) {
  case 'a': return handleA();
  case 'b': return handleB();
  default:
    return assertNever(value.type, `Unhandled type: ${value.type}`);
}
```

If a new case is added to the union type, TypeScript will error at compile time
because the value won't be assignable to `never`.
