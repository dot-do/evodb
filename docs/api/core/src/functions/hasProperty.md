[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / hasProperty

# Function: hasProperty()

> **hasProperty**\<`K`\>(`value`, `key`): `value is Record<string, unknown> & Record<K, unknown>`

Defined in: [core/src/guards.ts:356](https://github.com/dot-do/evodb/blob/main/core/src/guards.ts#L356)

Type guard: check if a record has a specific property

This is useful for safely accessing properties on unknown objects
after validating they exist.

## Type Parameters

### K

`K` *extends* `string`

## Parameters

### value

`unknown`

Value to check (must be a record)

### key

`K`

Property key to check for

## Returns

`value is Record<string, unknown> & Record<K, unknown>`

True if value is a record with the specified property

## Example

```typescript
const data: unknown = { name: 'Alice', age: 30 };
if (hasProperty(data, 'name')) {
  console.log(data.name); // TypeScript knows 'name' exists
}
```
