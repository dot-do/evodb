[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / R2Range

# Interface: R2Range

Defined in: core/src/types/r2.ts:20

R2 range request options for partial reads.
Used in R2GetOptions.range parameter.

## Properties

### offset?

> `optional` **offset**: `number`

Defined in: core/src/types/r2.ts:22

Byte offset to start reading from

***

### length?

> `optional` **length**: `number`

Defined in: core/src/types/r2.ts:24

Number of bytes to read

***

### suffix?

> `optional` **suffix**: `number`

Defined in: core/src/types/r2.ts:26

Read last N bytes (alternative to offset+length)
