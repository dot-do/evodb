[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SubscriptionManager

# Interface: SubscriptionManager

Defined in: core/src/subscriptions.ts:87

Manager for real-time subscriptions.
Handles subscription lifecycle and event distribution.

## Methods

### subscribe()

> **subscribe**\<`T`\>(`table`, `callback`): [`Subscription`](Subscription.md)

Defined in: core/src/subscriptions.ts:96

Subscribe to all changes on a specific table.

#### Type Parameters

##### T

`T` = `unknown`

Type of the data in events

#### Parameters

##### table

`string`

Name of the table to subscribe to

##### callback

[`SubscriptionCallback`](../type-aliases/SubscriptionCallback.md)\<`T`\>

Function to call when events occur

#### Returns

[`Subscription`](Subscription.md)

Subscription handle for managing the subscription

***

### subscribeQuery()

> **subscribeQuery**\<`T`\>(`query`, `callback`): [`Subscription`](Subscription.md)

Defined in: core/src/subscriptions.ts:107

Subscribe to changes matching a query filter.
Only events that match the query predicates will trigger the callback.

#### Type Parameters

##### T

`T` = `unknown`

Type of the data in events

#### Parameters

##### query

[`ExecutorQuery`](ExecutorQuery.md)

Query specification with table and optional predicates

##### callback

[`SubscriptionCallback`](../type-aliases/SubscriptionCallback.md)\<`T`\>

Function to call when matching events occur

#### Returns

[`Subscription`](Subscription.md)

Subscription handle for managing the subscription

***

### emit()

> **emit**(`event`): `void`

Defined in: core/src/subscriptions.ts:115

Emit a change event to all matching subscribers.
This is typically called by the database layer when data changes.

#### Parameters

##### event

[`ChangeEvent`](ChangeEvent.md)

The change event to emit

#### Returns

`void`
