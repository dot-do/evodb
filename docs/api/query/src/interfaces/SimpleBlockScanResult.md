[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / SimpleBlockScanResult

# Interface: SimpleBlockScanResult

Defined in: [query/src/simple-engine.ts:196](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L196)

Block scan result

## Properties

### data

> **data**: `Map`\<`string`, `unknown`[]\>

Defined in: [query/src/simple-engine.ts:198](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L198)

Columnar data: column name -> values

***

### rowCount

> **rowCount**: `number`

Defined in: [query/src/simple-engine.ts:200](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L200)

Number of rows in result

***

### bytesRead

> **bytesRead**: `number`

Defined in: [query/src/simple-engine.ts:202](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L202)

Bytes read

***

### fromCache

> **fromCache**: `boolean`

Defined in: [query/src/simple-engine.ts:204](https://github.com/dot-do/evodb/blob/main/query/src/simple-engine.ts#L204)

Whether data came from cache
