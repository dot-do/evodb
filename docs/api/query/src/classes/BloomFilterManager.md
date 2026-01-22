[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / BloomFilterManager

# Class: BloomFilterManager

Defined in: [query/src/engine.ts:984](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L984)

Bloom Filter Manager

Uses actual bloom filters for efficient point lookups.
Implements proper bit array storage with multiple hash functions
for fast "definitely not present" checks.

## Constructors

### Constructor

> **new BloomFilterManager**(`targetFalsePositiveRate`): `BloomFilterManager`

Defined in: [query/src/engine.ts:996](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L996)

#### Parameters

##### targetFalsePositiveRate

`number` = `0.01`

#### Returns

`BloomFilterManager`

## Methods

### mightContain()

> **mightContain**(`partition`, `column`, `value`): `boolean`

Defined in: [query/src/engine.ts:1003](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1003)

Check if value might exist in partition using actual bloom filter

#### Parameters

##### partition

[`PartitionInfo`](../interfaces/PartitionInfo.md)

##### column

`string`

##### value

`unknown`

#### Returns

`boolean`

***

### checkPredicate()

> **checkPredicate**(`partition`, `predicate`): `boolean`

Defined in: [query/src/engine.ts:1037](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1037)

Check partition against equality predicate

#### Parameters

##### partition

[`PartitionInfo`](../interfaces/PartitionInfo.md)

##### predicate

[`Predicate`](../interfaces/Predicate.md)

#### Returns

`boolean`

***

### getStats()

> **getStats**(): `object`

Defined in: [query/src/engine.ts:1048](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1048)

Get bloom filter statistics

#### Returns

`object`

##### checks

> **checks**: `number`

##### hits

> **hits**: `number`

##### falsePositiveRate

> **falsePositiveRate**: `number`

##### trueNegatives

> **trueNegatives**: `number`

##### targetFpr

> **targetFpr**: `number`

***

### registerFilter()

> **registerFilter**(`partitionPath`, `column`, `values`): `void`

Defined in: [query/src/engine.ts:1074](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1074)

Register a bloom filter from values (creates actual bloom filter with bit array)

#### Parameters

##### partitionPath

`string`

##### column

`string`

##### values

`Set`\<`string`\>

#### Returns

`void`

***

### registerFilterFromBytes()

> **registerFilterFromBytes**(`partitionPath`, `column`, `bytes`): `void`

Defined in: [query/src/engine.ts:1088](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1088)

Register a bloom filter from raw bytes (for loading from storage)

#### Parameters

##### partitionPath

`string`

##### column

`string`

##### bytes

`Uint8Array`

#### Returns

`void`

***

### getFilterBytes()

> **getFilterBytes**(`partitionPath`, `column`): `Uint8Array`\<`ArrayBufferLike`\>

Defined in: [query/src/engine.ts:1096](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1096)

Get the raw bytes of a bloom filter (for serialization/storage)

#### Parameters

##### partitionPath

`string`

##### column

`string`

#### Returns

`Uint8Array`\<`ArrayBufferLike`\>

***

### recordFalsePositive()

> **recordFalsePositive**(): `void`

Defined in: [query/src/engine.ts:1105](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1105)

Record a false positive (for accuracy tracking)
Call this when bloom filter returns true but value doesn't actually exist

#### Returns

`void`

***

### recordTrueNegative()

> **recordTrueNegative**(): `void`

Defined in: [query/src/engine.ts:1113](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1113)

Record a true negative (for accuracy tracking)
Call this when bloom filter returns false (value definitely doesn't exist)

#### Returns

`void`

***

### clear()

> **clear**(): `void`

Defined in: [query/src/engine.ts:1120](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1120)

Clear all filters and reset statistics

#### Returns

`void`

***

### hasFilter()

> **hasFilter**(`partitionPath`, `column`): `boolean`

Defined in: [query/src/engine.ts:1131](https://github.com/dot-do/evodb/blob/main/query/src/engine.ts#L1131)

Check if a filter exists for a partition/column combination

#### Parameters

##### partitionPath

`string`

##### column

`string`

#### Returns

`boolean`
