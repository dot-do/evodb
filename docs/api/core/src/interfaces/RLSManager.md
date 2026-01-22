[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / RLSManager

# Interface: RLSManager

Defined in: core/src/rls.ts:74

RLS Manager interface for managing row-level security policies

## Methods

### definePolicy()

> **definePolicy**(`policy`): `void`

Defined in: core/src/rls.ts:80

Define a new policy for a table

#### Parameters

##### policy

[`Policy`](Policy.md)

The policy to define

#### Returns

`void`

#### Throws

RLSError if policy name already exists for the table

***

### removePolicy()

> **removePolicy**(`table`, `name`): `void`

Defined in: core/src/rls.ts:88

Remove a policy from a table

#### Parameters

##### table

`string`

The table name

##### name

`string`

The policy name to remove

#### Returns

`void`

#### Throws

RLSError if policy doesn't exist

***

### getPolicies()

> **getPolicies**(`table`): [`Policy`](Policy.md)[]

Defined in: core/src/rls.ts:95

Get all policies for a table

#### Parameters

##### table

`string`

The table name

#### Returns

[`Policy`](Policy.md)[]

Array of policies for the table

***

### checkAccess()

> **checkAccess**(`table`, `operation`, `row`, `context`): `boolean`

Defined in: core/src/rls.ts:105

Check if an operation is allowed for a specific row

#### Parameters

##### table

`string`

The table name

##### operation

[`PolicyOperation`](../type-aliases/PolicyOperation.md)

The operation type

##### row

`unknown`

The row to check

##### context

[`SecurityContext`](SecurityContext.md)

The security context

#### Returns

`boolean`

true if access is allowed, false otherwise

***

### filterRows()

> **filterRows**\<`T`\>(`table`, `rows`, `context`): `T`[]

Defined in: core/src/rls.ts:119

Filter rows based on SELECT policies

#### Type Parameters

##### T

`T`

#### Parameters

##### table

`string`

The table name

##### rows

`T`[]

The rows to filter

##### context

[`SecurityContext`](SecurityContext.md)

The security context

#### Returns

`T`[]

Filtered array of rows the context has access to

***

### bypassRLS()

> **bypassRLS**(): `RLSManager`

Defined in: core/src/rls.ts:125

Create a bypass manager that skips all policy checks

#### Returns

`RLSManager`

A new RLSManager that bypasses all policies
