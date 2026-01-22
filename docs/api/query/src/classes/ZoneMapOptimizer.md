[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ZoneMapOptimizer

# Class: ZoneMapOptimizer

Defined in: [query/src/engine.ts:792](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L792)

Zone Map Optimizer

Uses min/max statistics to prune partitions.

## Constructors

### Constructor

> **new ZoneMapOptimizer**(): `ZoneMapOptimizer`

#### Returns

`ZoneMapOptimizer`

## Methods

### canPrune()

> **canPrune**(`partition`, `predicates`): `boolean`

Defined in: [query/src/engine.ts:796](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L796)

Check if partition can be pruned based on predicates

#### Parameters

##### partition

[`PartitionInfo`](../interfaces/PartitionInfo.md)

##### predicates

[`Predicate`](../interfaces/Predicate.md)[]

#### Returns

`boolean`

***

### prunePartitions()

> **prunePartitions**(`partitions`, `predicates`): `object`

Defined in: [query/src/engine.ts:811](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L811)

Get prunable partitions from a list

#### Parameters

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

##### predicates

[`Predicate`](../interfaces/Predicate.md)[]

#### Returns

`object`

##### selected

> **selected**: [`PartitionInfo`](../interfaces/PartitionInfo.md)[]

##### pruned

> **pruned**: [`PartitionInfo`](../interfaces/PartitionInfo.md)[]

***

### estimateSelectivity()

> **estimateSelectivity**(`partition`, `predicate`): `number`

Defined in: [query/src/engine.ts:921](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L921)

Estimate selectivity of predicates

#### Parameters

##### partition

[`PartitionInfo`](../interfaces/PartitionInfo.md)

##### predicate

[`Predicate`](../interfaces/Predicate.md)

#### Returns

`number`
