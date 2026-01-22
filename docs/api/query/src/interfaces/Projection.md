[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / Projection

# Interface: Projection

Defined in: [query/src/types.ts:185](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L185)

Column projection specification.

Defines which columns to include in query results. Supports nested column
paths using dot notation (e.g., 'user.address.city'). Projection pushdown
to the storage layer reduces I/O by only reading required columns.

## Example

```typescript
// Select specific columns
const projection: Projection = {
  columns: ['id', 'name', 'email'],
  includeMetadata: false
};

// Include nested columns and metadata
const nestedProjection: Projection = {
  columns: ['user.name', 'user.address.city', 'order.total'],
  includeMetadata: true
};
```

## Properties

### columns

> **columns**: `string`[]

Defined in: [query/src/types.ts:187](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L187)

Column names/paths to include

***

### includeMetadata?

> `optional` **includeMetadata**: `boolean`

Defined in: [query/src/types.ts:190](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L190)

Whether to include row metadata (_id, _version, etc.)
