[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / TableDataSourceMetadata

# Interface: TableDataSourceMetadata

Defined in: [query/src/types.ts:1432](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1432)

Table metadata returned by a data source.

Contains schema information and partition list needed for query planning.

## Example

```typescript
const metadata: TableDataSourceMetadata = {
  tableName: 'events',
  partitions: [partition1, partition2, partition3],
  schema: {
    id: 'string',
    timestamp: 'timestamp',
    user_id: 'int64',
    event_type: 'string',
    payload: 'json'
  },
  rowCount: 5000000
};
```

## Properties

### tableName

> **tableName**: `string`

Defined in: [query/src/types.ts:1434](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1434)

Table name/path

***

### partitions

> **partitions**: [`PartitionInfo`](PartitionInfo.md)[]

Defined in: [query/src/types.ts:1437](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1437)

Available partitions with zone maps

***

### schema

> **schema**: `Record`\<`string`, `string`\>

Defined in: [query/src/types.ts:1440](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1440)

Column schema (column name -> type)

***

### rowCount?

> `optional` **rowCount**: `number`

Defined in: [query/src/types.ts:1443](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1443)

Total row count across all partitions (if known)
