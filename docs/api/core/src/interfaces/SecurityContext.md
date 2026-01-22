[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SecurityContext

# Interface: SecurityContext

Defined in: core/src/rls.ts:62

Security context passed to policy check functions

## Indexable

\[`key`: `string`\]: `unknown`

Additional custom properties

## Properties

### userId?

> `optional` **userId**: `string`

Defined in: core/src/rls.ts:64

Current user's ID

***

### roles?

> `optional` **roles**: `string`[]

Defined in: core/src/rls.ts:66

Current user's roles
