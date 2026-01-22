[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / ChangeEvent

# Interface: ChangeEvent\<T\>

Defined in: core/src/subscriptions.ts:59

Event emitted when data changes in the database.
Contains the type of change, affected table, and relevant data.

## Type Parameters

### T

`T` = `unknown`

Type of the data being changed (defaults to unknown)

## Properties

### type

> **type**: `"insert"` \| `"update"` \| `"delete"`

Defined in: core/src/subscriptions.ts:61

Type of change that occurred

***

### table

> **table**: `string`

Defined in: core/src/subscriptions.ts:64

Name of the affected table

***

### data

> **data**: `T`

Defined in: core/src/subscriptions.ts:67

The new/current data (for insert/update) or deleted data (for delete)

***

### previousData?

> `optional` **previousData**: `T`

Defined in: core/src/subscriptions.ts:70

Previous data before the change (only for update events)

***

### timestamp

> **timestamp**: `number`

Defined in: core/src/subscriptions.ts:73

Unix timestamp (milliseconds) when the event occurred
