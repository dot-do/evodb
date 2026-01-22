[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / IsolationLevel

# Enumeration: IsolationLevel

Defined in: core/src/transactions.ts:51

Isolation level for transactions

## Enumeration Members

### ReadCommitted

> **ReadCommitted**: `"read_committed"`

Defined in: core/src/transactions.ts:53

Read committed - default, prevents dirty reads

***

### RepeatableRead

> **RepeatableRead**: `"repeatable_read"`

Defined in: core/src/transactions.ts:55

Repeatable read - prevents non-repeatable reads

***

### Serializable

> **Serializable**: `"serializable"`

Defined in: core/src/transactions.ts:57

Serializable - strictest isolation level
