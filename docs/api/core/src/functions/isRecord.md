[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isRecord

# Function: isRecord()

> **isRecord**(`value`): `value is Record<string, unknown>`

Defined in: [core/src/guards.ts:62](https://github.com/dot-do/evodb/blob/main/core/src/guards.ts#L62)

Type guard: check if value is a plain object (not null, not array)

This is more strict than `typeof value === 'object'` as it excludes:
- null
- arrays
- class instances (by default objects but often not what you want)

## Parameters

### value

`unknown`

Value to check

## Returns

`value is Record<string, unknown>`

True if value is a plain object, narrowing type to Record<string, unknown>

## Example

```typescript
const data: unknown = { name: 'Alice', age: 30 };
if (isRecord(data)) {
  // data is now typed as Record<string, unknown>
  console.log(data.name);
}
```
