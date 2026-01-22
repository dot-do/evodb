[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / ParentDOEnv

# Interface: ParentDOEnv

Defined in: [writer/src/types.ts:512](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L512)

Environment bindings for Parent DO

## Extended by

- [`ShardedParentDOEnv`](ShardedParentDOEnv.md)

## Properties

### R2\_BUCKET

> **R2\_BUCKET**: [`R2Bucket`](R2Bucket.md)

Defined in: [writer/src/types.ts:514](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L514)

R2 bucket for block storage

***

### CHILD\_DO?

> `optional` **CHILD\_DO**: `DurableObjectNamespace`

Defined in: [writer/src/types.ts:516](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L516)

Optional: Child DO namespace for routing
