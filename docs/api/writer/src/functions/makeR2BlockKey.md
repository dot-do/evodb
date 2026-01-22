[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / makeR2BlockKey

# Function: makeR2BlockKey()

> **makeR2BlockKey**(`tableLocation`, `timestamp`, `seq`): `string`

Defined in: [writer/src/r2-writer.ts:35](https://github.com/dot-do/evodb/blob/main/writer/src/r2-writer.ts#L35)

R2 block key format: {tableLocation}/data/{timestamp}-{seq}.cjlb

## Parameters

### tableLocation

`string`

### timestamp

`number`

### seq

`number`

## Returns

`string`
