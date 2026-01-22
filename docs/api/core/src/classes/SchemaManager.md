[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SchemaManager

# Class: SchemaManager

Defined in: [core/src/evodb.ts:455](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L455)

Schema management for EvoDB

Provides methods for:
- Locking schemas in production
- Defining relationships between tables
- Enforcing constraints
- Inferring schemas from data

## Constructors

### Constructor

> **new SchemaManager**(`evodb`): `SchemaManager`

Defined in: [core/src/evodb.ts:461](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L461)

#### Parameters

##### evodb

[`EvoDB`](EvoDB.md)

#### Returns

`SchemaManager`

## Methods

### lock()

> **lock**(`table`, `schema`): `Promise`\<`void`\>

Defined in: [core/src/evodb.ts:474](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L474)

Lock a table's schema

Once locked, the schema cannot evolve automatically.
All writes must conform to the locked schema.

#### Parameters

##### table

`string`

Table name

##### schema

[`SchemaDefinition`](../type-aliases/SchemaDefinition.md)

Schema definition to lock

#### Returns

`Promise`\<`void`\>

***

### relate()

> **relate**(`from`, `to`, `options`): `Promise`\<`void`\>

Defined in: [core/src/evodb.ts:490](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L490)

Define a relationship between tables

#### Parameters

##### from

`string`

Source table.field (e.g., 'posts.author')

##### to

`string`

Target table (e.g., 'users')

##### options

[`RelationshipOptions`](../interfaces/RelationshipOptions.md) = `{}`

Relationship options

#### Returns

`Promise`\<`void`\>

***

### enforce()

> **enforce**(`table`, `constraints`, `options`): `Promise`\<`void`\>

Defined in: [core/src/evodb.ts:518](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L518)

Enforce constraints on a table

#### Parameters

##### table

`string`

Table name

##### constraints

[`SchemaDefinition`](../type-aliases/SchemaDefinition.md)

Partial schema with constraints to enforce

##### options

[`EnforceOptions`](../interfaces/EnforceOptions.md) = `{}`

Enforcement options

#### Returns

`Promise`\<`void`\>

***

### infer()

> **infer**(`table`): `Promise`\<[`InferredSchema`](../interfaces/InferredSchema.md)\>

Defined in: [core/src/evodb.ts:536](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L536)

Infer the schema from existing data

#### Parameters

##### table

`string`

Table name

#### Returns

`Promise`\<[`InferredSchema`](../interfaces/InferredSchema.md)\>

Inferred schema as a simple type map

***

### isLocked()

> **isLocked**(`table`): `boolean`

Defined in: [core/src/evodb.ts:550](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L550)

Check if a table's schema is locked

#### Parameters

##### table

`string`

#### Returns

`boolean`

***

### getLockedSchema()

> **getLockedSchema**(`table`): [`SchemaDefinition`](../type-aliases/SchemaDefinition.md)

Defined in: [core/src/evodb.ts:557](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L557)

Get the locked schema for a table

#### Parameters

##### table

`string`

#### Returns

[`SchemaDefinition`](../type-aliases/SchemaDefinition.md)

***

### getRelationships()

> **getRelationships**(`table`): `Map`\<`string`, [`RelationshipOptions`](../interfaces/RelationshipOptions.md)\>

Defined in: [core/src/evodb.ts:564](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L564)

Get relationships for a table

#### Parameters

##### table

`string`

#### Returns

`Map`\<`string`, [`RelationshipOptions`](../interfaces/RelationshipOptions.md)\>

***

### getEnforcement()

> **getEnforcement**(`table`): [`EnforceOptions`](../interfaces/EnforceOptions.md)

Defined in: [core/src/evodb.ts:571](https://github.com/dot-do/evodb/blob/main/core/src/evodb.ts#L571)

Get enforcement options for a table

#### Parameters

##### table

`string`

#### Returns

[`EnforceOptions`](../interfaces/EnforceOptions.md)
