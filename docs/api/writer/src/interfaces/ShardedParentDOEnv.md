[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ShardedParentDOEnv

# Interface: ShardedParentDOEnv

Defined in: [writer/src/sharded-parent-do.ts:43](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L43)

Environment bindings for sharded parent DO

## Extends

- [`ParentDOEnv`](ParentDOEnv.md)

## Properties

### SHARD\_WRITERS

> **SHARD\_WRITERS**: `DurableObjectNamespace`

Defined in: [writer/src/sharded-parent-do.ts:45](https://github.com/dot-do/evodb/blob/main/writer/src/sharded-parent-do.ts#L45)

Shard writer DO namespace

***

### R2\_BUCKET

> **R2\_BUCKET**: [`R2Bucket`](R2Bucket.md)

Defined in: [writer/src/types.ts:514](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L514)

R2 bucket for block storage

#### Inherited from

[`ParentDOEnv`](ParentDOEnv.md).[`R2_BUCKET`](ParentDOEnv.md#r2_bucket)

***

### CHILD\_DO?

> `optional` **CHILD\_DO**: `DurableObjectNamespace`

Defined in: [writer/src/types.ts:516](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L516)

Optional: Child DO namespace for routing

#### Inherited from

[`ParentDOEnv`](ParentDOEnv.md).[`CHILD_DO`](ParentDOEnv.md#child_do)
