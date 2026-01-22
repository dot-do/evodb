[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / TableDataSource

# Interface: TableDataSource

Defined in: [query/src/types.ts:1400](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1400)

Data source interface for providing table data to the query engine.

This abstraction allows the query engine to work with different data backends:
- R2DataSource: Reads from R2 bucket via manifest (production)
- MockDataSource: Provides in-memory test data (testing)
- Custom implementations for other backends

## Example

```typescript
const customSource: TableDataSource = {
  async getTableMetadata(tableName) {
    const metadata = await fetchMetadataFromCatalog(tableName);
    return {
      tableName,
      partitions: metadata.partitions,
      schema: metadata.schema,
      rowCount: metadata.rowCount
    };
  },

  async readPartition(partition, columns) {
    const data = await fetchPartitionData(partition.path);
    return columns ? projectColumns(data, columns) : data;
  },

  async *streamPartition(partition, columns) {
    for await (const batch of fetchPartitionStream(partition.path)) {
      for (const row of batch) {
        yield columns ? projectRow(row, columns) : row;
      }
    }
  }
};
```

## Methods

### getTableMetadata()

> **getTableMetadata**(`tableName`): `Promise`\<[`TableDataSourceMetadata`](TableDataSourceMetadata.md)\>

Defined in: [query/src/types.ts:1402](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1402)

Get table metadata including partitions and schema

#### Parameters

##### tableName

`string`

#### Returns

`Promise`\<[`TableDataSourceMetadata`](TableDataSourceMetadata.md)\>

***

### readPartition()

> **readPartition**(`partition`, `columns?`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [query/src/types.ts:1405](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1405)

Read all rows from a partition

#### Parameters

##### partition

[`PartitionInfo`](PartitionInfo.md)

##### columns?

`string`[]

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

***

### streamPartition()

> **streamPartition**(`partition`, `columns?`): `AsyncIterableIterator`\<`Record`\<`string`, `unknown`\>\>

Defined in: [query/src/types.ts:1408](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1408)

Stream rows from a partition (for large partitions)

#### Parameters

##### partition

[`PartitionInfo`](PartitionInfo.md)

##### columns?

`string`[]

#### Returns

`AsyncIterableIterator`\<`Record`\<`string`, `unknown`\>\>
