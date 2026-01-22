[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / createShardCoordinatorClass

# Function: createShardCoordinatorClass()

> **createShardCoordinatorClass**(`config`): (`state`, `env`) => [`ShardCoordinator`](../classes/ShardCoordinator.md)

Defined in: [writer/src/sharded-parent-do.ts:872](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L872)

Factory function to create a ShardCoordinator class

## Parameters

### config

[`ShardedParentDOConfig`](../interfaces/ShardedParentDOConfig.md)

## Returns

> **new createShardCoordinatorClass**(`state`, `env`): [`ShardCoordinator`](../classes/ShardCoordinator.md)

### Parameters

#### state

`DurableObjectState`

#### env

[`ShardedParentDOEnv`](../interfaces/ShardedParentDOEnv.md)

### Returns

[`ShardCoordinator`](../classes/ShardCoordinator.md)
