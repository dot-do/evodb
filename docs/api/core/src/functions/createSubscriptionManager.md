[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / createSubscriptionManager

# Function: createSubscriptionManager()

> **createSubscriptionManager**(): [`SubscriptionManager`](../interfaces/SubscriptionManager.md)

Defined in: core/src/subscriptions.ts:225

Create a new subscription manager instance.

## Returns

[`SubscriptionManager`](../interfaces/SubscriptionManager.md)

A new SubscriptionManager for handling real-time subscriptions

## Example

```typescript
const manager = createSubscriptionManager();

// Subscribe to all user changes
const sub = manager.subscribe('users', (event) => {
  console.log('User changed:', event.type, event.data);
});

// Emit an event
manager.emit({
  type: 'insert',
  table: 'users',
  data: { id: 1, name: 'Alice' },
  timestamp: Date.now()
});

// Cleanup
sub.unsubscribe();
```
