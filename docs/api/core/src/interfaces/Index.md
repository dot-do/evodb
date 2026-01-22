[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / Index

# Interface: Index

Defined in: core/src/indexes.ts:41

Basic index definition

## Extended by

- [`IndexMetadata`](IndexMetadata.md)

## Properties

### name

> **name**: `string`

Defined in: core/src/indexes.ts:43

Index name

***

### columns

> **columns**: `string`[]

Defined in: core/src/indexes.ts:45

Columns included in the index (in order for composite indexes)

***

### type

> **type**: [`IndexType`](../type-aliases/IndexType.md)

Defined in: core/src/indexes.ts:47

Index type (btree for range queries, hash for equality)
