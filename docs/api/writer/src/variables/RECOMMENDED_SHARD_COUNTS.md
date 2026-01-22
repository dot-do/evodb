[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / RECOMMENDED\_SHARD\_COUNTS

# Variable: RECOMMENDED\_SHARD\_COUNTS

> `const` **RECOMMENDED\_SHARD\_COUNTS**: `object`

Defined in: [writer/src/shard-router.ts:481](https://github.com/dot-do/evodb/blob/main/writer/src/shard-router.ts#L481)

Recommended shard counts for different scales

## Type Declaration

### small

> `readonly` **small**: `4` = `4`

Small scale: up to 1000 tenants

### medium

> `readonly` **medium**: `16` = `16`

Medium scale: 1000-10000 tenants

### large

> `readonly` **large**: `64` = `64`

Large scale: 10000-100000 tenants

### enterprise

> `readonly` **enterprise**: `256` = `256`

Enterprise scale: 100000+ tenants
