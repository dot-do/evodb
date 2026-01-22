[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / createLakehouseParentDOClass

# Function: createLakehouseParentDOClass()

> **createLakehouseParentDOClass**(`tableLocation`, `partitionMode`, `options?`): (`state`, `env`) => [`LakehouseParentDO`](../classes/LakehouseParentDO.md)

Defined in: [writer/src/parent-do.ts:655](https://github.com/dot-do/evodb/blob/main/writer/src/parent-do.ts#L655)

Factory function to create Parent DO class with custom table location

## Parameters

### tableLocation

`string`

### partitionMode

[`PartitionMode`](../type-aliases/PartitionMode.md) = `'do-sqlite'`

### options?

`Partial`\<[`WriterOptions`](../interfaces/WriterOptions.md)\>

## Returns

> **new createLakehouseParentDOClass**(`state`, `env`): [`LakehouseParentDO`](../classes/LakehouseParentDO.md)

### Parameters

#### state

`DurableObjectState`

#### env

[`ParentDOEnv`](../interfaces/ParentDOEnv.md)

### Returns

[`LakehouseParentDO`](../classes/LakehouseParentDO.md)
