[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TransactionState

# Enumeration: TransactionState

Defined in: core/src/transactions.ts:35

Transaction state enum

## Enumeration Members

### Active

> **Active**: `"active"`

Defined in: core/src/transactions.ts:37

Transaction is active and accepting operations

***

### Committing

> **Committing**: `"committing"`

Defined in: core/src/transactions.ts:39

Transaction is being committed

***

### Committed

> **Committed**: `"committed"`

Defined in: core/src/transactions.ts:41

Transaction has been successfully committed

***

### RollingBack

> **RollingBack**: `"rolling_back"`

Defined in: core/src/transactions.ts:43

Transaction is being rolled back

***

### RolledBack

> **RolledBack**: `"rolled_back"`

Defined in: core/src/transactions.ts:45

Transaction has been rolled back
