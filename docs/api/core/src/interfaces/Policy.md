[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / Policy

# Interface: Policy

Defined in: core/src/rls.ts:48

Policy definition for row-level security

## Properties

### name

> **name**: `string`

Defined in: core/src/rls.ts:50

Unique policy name within the table

***

### table

> **table**: `string`

Defined in: core/src/rls.ts:52

Table this policy applies to

***

### operations

> **operations**: [`PolicyOperation`](../type-aliases/PolicyOperation.md)[]

Defined in: core/src/rls.ts:54

Operations this policy applies to

***

### check()

> **check**: (`row`, `context`) => `boolean`

Defined in: core/src/rls.ts:56

Check function that determines if access is allowed

#### Parameters

##### row

`unknown`

##### context

[`SecurityContext`](SecurityContext.md)

#### Returns

`boolean`
