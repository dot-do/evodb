[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / QueryBuilder

# Class: QueryBuilder\<T\>

Defined in: [core/src/evodb.ts:303](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L303)

Fluent query builder for EvoDB

## Example

```typescript
const results = await db.query('users')
  .where('status', '=', 'active')
  .where('age', '>=', 18)
  .select(['id', 'name', 'email'])
  .orderBy('name', 'asc')
  .limit(10)
  .offset(20);
```

## Type Parameters

### T

`T` = `Record`\<`string`, `unknown`\>

## Constructors

### Constructor

> **new QueryBuilder**\<`T`\>(`evodb`, `tableName`): `QueryBuilder`\<`T`\>

Defined in: [core/src/evodb.ts:314](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L314)

#### Parameters

##### evodb

[`EvoDB`](EvoDB.md)

##### tableName

`string`

#### Returns

`QueryBuilder`\<`T`\>

## Methods

### where()

> **where**(`column`, `operator`, `value`): `QueryBuilder`\<`T`\>

Defined in: [core/src/evodb.ts:326](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L326)

Add a filter condition

#### Parameters

##### column

`string`

Column name to filter on

##### operator

[`UserFilterOperator`](../type-aliases/UserFilterOperator.md)

Comparison operator (supports SQL-like syntax: =, !=, >, >=, <, <=, in, like)

##### value

`unknown`

Value to compare against

#### Returns

`QueryBuilder`\<`T`\>

***

### select()

> **select**(`columns`): `QueryBuilder`\<`T`\>

Defined in: [core/src/evodb.ts:336](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L336)

Select specific columns

#### Parameters

##### columns

`string`[]

Array of column names to select

#### Returns

`QueryBuilder`\<`T`\>

***

### orderBy()

> **orderBy**(`column`, `direction`): `QueryBuilder`\<`T`\>

Defined in: [core/src/evodb.ts:347](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L347)

Add sorting

#### Parameters

##### column

`string`

Column to sort by

##### direction

Sort direction ('asc' or 'desc')

`"asc"` | `"desc"`

#### Returns

`QueryBuilder`\<`T`\>

***

### limit()

> **limit**(`count`): `QueryBuilder`\<`T`\>

Defined in: [core/src/evodb.ts:357](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L357)

Limit the number of results

#### Parameters

##### count

`number`

Maximum number of rows to return

#### Returns

`QueryBuilder`\<`T`\>

***

### offset()

> **offset**(`count`): `QueryBuilder`\<`T`\>

Defined in: [core/src/evodb.ts:367](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L367)

Skip a number of results

#### Parameters

##### count

`number`

Number of rows to skip

#### Returns

`QueryBuilder`\<`T`\>

***

### aggregate()

> **aggregate**(`fn`, `column`, `alias`): `QueryBuilder`\<`T`\>

Defined in: [core/src/evodb.ts:379](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L379)

Add aggregation

#### Parameters

##### fn

Aggregation function

`"count"` | `"sum"` | `"avg"` | `"min"` | `"max"`

##### column

`string`

Column to aggregate

##### alias

`string`

Output alias

#### Returns

`QueryBuilder`\<`T`\>

***

### groupBy()

> **groupBy**(`columns`): `QueryBuilder`\<`T`\>

Defined in: [core/src/evodb.ts:393](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L393)

Group results by columns

#### Parameters

##### columns

`string`[]

Columns to group by

#### Returns

`QueryBuilder`\<`T`\>

***

### execute()

> **execute**(): `Promise`\<`T`[]\>

Defined in: [core/src/evodb.ts:401](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L401)

Execute the query and return results

#### Returns

`Promise`\<`T`[]\>

***

### executeWithMeta()

> **executeWithMeta**(): `Promise`\<[`QueryResult`](../interfaces/QueryResult.md)\<`T`\>\>

Defined in: [core/src/evodb.ts:418](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L418)

Execute and return full result with metadata

#### Returns

`Promise`\<[`QueryResult`](../interfaces/QueryResult.md)\<`T`\>\>

***

### then()

> **then**\<`TResult1`, `TResult2`\>(`onfulfilled?`, `onrejected?`): `Promise`\<`TResult1` \| `TResult2`\>

Defined in: [core/src/evodb.ts:434](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L434)

Make QueryBuilder thenable for await support

#### Type Parameters

##### TResult1

`TResult1` = `T`[]

##### TResult2

`TResult2` = `never`

#### Parameters

##### onfulfilled?

(`value`) => `TResult1` \| `PromiseLike`\<`TResult1`\>

##### onrejected?

(`reason`) => `TResult2` \| `PromiseLike`\<`TResult2`\>

#### Returns

`Promise`\<`TResult1` \| `TResult2`\>
