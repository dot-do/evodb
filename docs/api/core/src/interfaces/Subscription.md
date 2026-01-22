[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / Subscription

# Interface: Subscription

Defined in: core/src/subscriptions.ts:45

Subscription handle returned when subscribing to events.
Provides the ability to unsubscribe when notifications are no longer needed.

## Properties

### id

> **id**: `string`

Defined in: core/src/subscriptions.ts:47

Unique identifier for this subscription

## Methods

### unsubscribe()

> **unsubscribe**(): `void`

Defined in: core/src/subscriptions.ts:50

Stop receiving events for this subscription

#### Returns

`void`
