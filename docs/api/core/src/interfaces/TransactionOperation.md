[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / TransactionOperation

# Interface: TransactionOperation

Defined in: core/src/transactions.ts:80

Represents a single operation within a transaction

## Properties

### type

> **type**: `OperationType`

Defined in: core/src/transactions.ts:82

Type of operation

***

### table

> **table**: `string`

Defined in: core/src/transactions.ts:84

Target table name

***

### key?

> `optional` **key**: `string`

Defined in: core/src/transactions.ts:86

Primary key for update/delete operations

***

### data

> **data**: `Record`\<`string`, `unknown`\>

Defined in: core/src/transactions.ts:88

Data for insert/update operations

***

### simulateError?

> `optional` **simulateError**: `string`

Defined in: core/src/transactions.ts:90

Simulate an error during commit (for testing)

***

### transactionId?

> `optional` **transactionId**: `string`

Defined in: core/src/transactions.ts:92

Transaction ID that created this operation

***

### timestamp?

> `optional` **timestamp**: `number`

Defined in: core/src/transactions.ts:94

Timestamp when operation was added
