[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / AggregationEngine

# Class: AggregationEngine

Defined in: [query/src/engine.ts:1145](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1145)

Aggregation Engine

Computes aggregations over columnar data.

## Constructors

### Constructor

> **new AggregationEngine**(): `AggregationEngine`

#### Returns

`AggregationEngine`

## Methods

### count()

> **count**(`partitions`, `_predicate?`): `Promise`\<`number`\>

Defined in: [query/src/engine.ts:1149](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1149)

Compute COUNT(*) over partitions

#### Parameters

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

##### \_predicate?

[`Predicate`](../interfaces/Predicate.md)

#### Returns

`Promise`\<`number`\>

***

### sum()

> **sum**(`partitions`, `column`, `_predicate?`): `Promise`\<`number`\>

Defined in: [query/src/engine.ts:1157](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1157)

Compute SUM over a column

#### Parameters

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

##### column

`string`

##### \_predicate?

[`Predicate`](../interfaces/Predicate.md)

#### Returns

`Promise`\<`number`\>

***

### avg()

> **avg**(`partitions`, `column`, `predicate?`): `Promise`\<`number`\>

Defined in: [query/src/engine.ts:1175](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1175)

Compute AVG over a column

#### Parameters

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

##### column

`string`

##### predicate?

[`Predicate`](../interfaces/Predicate.md)

#### Returns

`Promise`\<`number`\>

***

### min()

> **min**(`partitions`, `column`, `_predicate?`): `Promise`\<`unknown`\>

Defined in: [query/src/engine.ts:1184](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1184)

Compute MIN over a column

#### Parameters

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

##### column

`string`

##### \_predicate?

[`Predicate`](../interfaces/Predicate.md)

#### Returns

`Promise`\<`unknown`\>

***

### max()

> **max**(`partitions`, `column`, `_predicate?`): `Promise`\<`unknown`\>

Defined in: [query/src/engine.ts:1200](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1200)

Compute MAX over a column

#### Parameters

##### partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

##### column

`string`

##### \_predicate?

[`Predicate`](../interfaces/Predicate.md)

#### Returns

`Promise`\<`unknown`\>

***

### groupBy()

> **groupBy**(`_partitions`, `_groupColumns`, `_aggregations`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [query/src/engine.ts:1222](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1222)

Compute GROUP BY aggregations

#### Parameters

##### \_partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

##### \_groupColumns

`string`[]

##### \_aggregations

[`Aggregation`](../interfaces/Aggregation.md)[]

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

***

### distinct()

> **distinct**(`_partitions`, `_column`): `Promise`\<`unknown`[]\>

Defined in: [query/src/engine.ts:1235](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1235)

Compute DISTINCT values

#### Parameters

##### \_partitions

[`PartitionInfo`](../interfaces/PartitionInfo.md)[]

##### \_column

`string`

#### Returns

`Promise`\<`unknown`[]\>
