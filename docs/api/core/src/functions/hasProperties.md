[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / hasProperties

# Function: hasProperties()

> **hasProperties**\<`K`\>(`value`, `keys`): `value is Record<string, unknown> & Record<K, unknown>`

Defined in: [core/src/guards.ts:379](https://github.com/dot-do/evodb/blob/main/core/src/guards.ts#L379)

Type guard: check if a record has all specified properties

## Type Parameters

### K

`K` *extends* `string`

## Parameters

### value

`unknown`

Value to check (must be a record)

### keys

`K`[]

Array of property keys to check for

## Returns

`value is Record<string, unknown> & Record<K, unknown>`

True if value is a record with all specified properties

## Example

```typescript
const data: unknown = { lsn: '123', timestamp: '456', op: 1 };
if (hasProperties(data, ['lsn', 'timestamp', 'op'])) {
  // TypeScript knows all properties exist
  console.log(data.lsn, data.timestamp, data.op);
}
```
