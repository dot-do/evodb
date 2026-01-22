[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / PartitionScanner

# Class: PartitionScanner

Defined in: [query/src/engine.ts:1443](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1443)

Partition Scanner

Reads columnar data from R2 partitions.

## Constructors

### Constructor

> **new PartitionScanner**(`bucket`, `_config`): `PartitionScanner`

Defined in: [query/src/engine.ts:1446](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1446)

#### Parameters

##### bucket

[`R2Bucket`](../interfaces/R2Bucket.md)

##### \_config

[`QueryEngineConfig`](../interfaces/QueryEngineConfig.md)

#### Returns

`PartitionScanner`

## Methods

### scan()

> **scan**(`partition`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [query/src/engine.ts:1454](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1454)

Scan all rows from a partition

#### Parameters

##### partition

[`PartitionInfo`](../interfaces/PartitionInfo.md)

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

***

### scanWithProjection()

> **scanWithProjection**(`partition`, `columns`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [query/src/engine.ts:1470](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1470)

Scan with column projection

#### Parameters

##### partition

[`PartitionInfo`](../interfaces/PartitionInfo.md)

##### columns

`string`[]

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

***

### scanWithFilter()

> **scanWithFilter**(`partition`, `predicates`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [query/src/engine.ts:1488](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1488)

Scan with predicate filtering

#### Parameters

##### partition

[`PartitionInfo`](../interfaces/PartitionInfo.md)

##### predicates

[`Predicate`](../interfaces/Predicate.md)[]

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

***

### scanStream()

> **scanStream**(`partition`): `AsyncIterableIterator`\<`Record`\<`string`, `unknown`\>\>

Defined in: [query/src/engine.ts:1525](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1525)

Stream rows from a partition

#### Parameters

##### partition

[`PartitionInfo`](../interfaces/PartitionInfo.md)

#### Returns

`AsyncIterableIterator`\<`Record`\<`string`, `unknown`\>\>
