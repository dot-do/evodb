[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / createRLSManager

# Function: createRLSManager()

> **createRLSManager**(): [`RLSManager`](../interfaces/RLSManager.md)

Defined in: core/src/rls.ts:288

Create a new RLS Manager instance

## Returns

[`RLSManager`](../interfaces/RLSManager.md)

A new RLSManager for managing row-level security policies

## Example

```typescript
const rlsManager = createRLSManager();

rlsManager.definePolicy({
  name: 'tenant_isolation',
  table: 'data',
  operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  check: (row, context) => row.tenantId === context.tenantId,
});
```
