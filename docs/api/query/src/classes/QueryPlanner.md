[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / QueryPlanner

# Class: QueryPlanner

Defined in: [query/src/engine.ts:1569](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1569)

Query Planner

Creates optimized execution plans for queries.

## Constructors

### Constructor

> **new QueryPlanner**(`config`): `QueryPlanner`

Defined in: [query/src/engine.ts:1573](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1573)

#### Parameters

##### config

[`QueryEngineConfig`](../interfaces/QueryEngineConfig.md)

#### Returns

`QueryPlanner`

## Methods

### createPlan()

> **createPlan**(`query`): `Promise`\<[`QueryPlan`](../interfaces/QueryPlan.md)\>

Defined in: [query/src/engine.ts:1581](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1581)

Create an execution plan for a query

#### Parameters

##### query

[`Query`](../interfaces/Query.md)

#### Returns

`Promise`\<[`QueryPlan`](../interfaces/QueryPlan.md)\>

***

### optimize()

> **optimize**(`plan`): `Promise`\<[`QueryPlan`](../interfaces/QueryPlan.md)\>

Defined in: [query/src/engine.ts:1775](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1775)

Optimize an existing plan

#### Parameters

##### plan

[`QueryPlan`](../interfaces/QueryPlan.md)

#### Returns

`Promise`\<[`QueryPlan`](../interfaces/QueryPlan.md)\>

***

### estimateCost()

> **estimateCost**(`query`): `Promise`\<`number`\>

Defined in: [query/src/engine.ts:1804](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1804)

Estimate query cost

#### Parameters

##### query

[`Query`](../interfaces/Query.md)

#### Returns

`Promise`\<`number`\>
