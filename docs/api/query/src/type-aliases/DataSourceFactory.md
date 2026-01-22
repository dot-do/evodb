[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / DataSourceFactory

# Type Alias: DataSourceFactory()

> **DataSourceFactory** = (`config`) => [`TableDataSource`](../interfaces/TableDataSource.md)

Defined in: [query/src/types.ts:1451](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L1451)

Factory function type for creating data sources.

Used for dependency injection of data source implementations.

## Parameters

### config

[`QueryEngineConfig`](../interfaces/QueryEngineConfig.md)

## Returns

[`TableDataSource`](../interfaces/TableDataSource.md)
