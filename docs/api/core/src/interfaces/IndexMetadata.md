[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / IndexMetadata

# Interface: IndexMetadata

Defined in: core/src/indexes.ts:53

Extended index metadata including creation time and uniqueness

## Extends

- [`Index`](Index.md)

## Properties

### name

> **name**: `string`

Defined in: core/src/indexes.ts:43

Index name

#### Inherited from

[`Index`](Index.md).[`name`](Index.md#name)

***

### columns

> **columns**: `string`[]

Defined in: core/src/indexes.ts:45

Columns included in the index (in order for composite indexes)

#### Inherited from

[`Index`](Index.md).[`columns`](Index.md#columns)

***

### type

> **type**: [`IndexType`](../type-aliases/IndexType.md)

Defined in: core/src/indexes.ts:47

Index type (btree for range queries, hash for equality)

#### Inherited from

[`Index`](Index.md).[`type`](Index.md#type)

***

### unique

> **unique**: `boolean`

Defined in: core/src/indexes.ts:55

Whether the index enforces uniqueness

***

### createdAt

> **createdAt**: `number`

Defined in: core/src/indexes.ts:57

Unix timestamp when the index was created
