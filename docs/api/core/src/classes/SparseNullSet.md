[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SparseNullSet

# Class: SparseNullSet

Defined in: [core/src/encode.ts:464](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L464)

Sparse representation of null indices for columns with few nulls.
Uses a Set internally for O(1) null checks instead of O(1) array access,
but with dramatically less memory for sparse data.

Memory comparison for 100K elements with 10 nulls:
- Boolean array: ~100KB (1 byte per boolean in JS)
- SparseNullSet: ~80 bytes (Set overhead + 10 numbers)

## Implements

- `Iterable`\<`boolean`\>

## Constructors

### Constructor

> **new SparseNullSet**(`nullIndices`, `totalCount`): `SparseNullSet`

Defined in: [core/src/encode.ts:468](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L468)

#### Parameters

##### nullIndices

`Set`\<`number`\>

##### totalCount

`number`

#### Returns

`SparseNullSet`

## Accessors

### nullCount

#### Get Signature

> **get** **nullCount**(): `number`

Defined in: [core/src/encode.ts:479](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L479)

Number of null values

##### Returns

`number`

***

### totalCount

#### Get Signature

> **get** **totalCount**(): `number`

Defined in: [core/src/encode.ts:484](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L484)

Total number of elements (including non-null)

##### Returns

`number`

***

### length

#### Get Signature

> **get** **length**(): `number`

Defined in: [core/src/encode.ts:489](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L489)

Alias for totalCount for array-like interface

##### Returns

`number`

## Methods

### isNull()

> **isNull**(`index`): `boolean`

Defined in: [core/src/encode.ts:474](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L474)

Check if a specific index is null

#### Parameters

##### index

`number`

#### Returns

`boolean`

***

### nullIndices()

> **nullIndices**(): `Generator`\<`number`\>

Defined in: [core/src/encode.ts:494](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L494)

Iterate over null indices only (efficient for sparse data)

#### Returns

`Generator`\<`number`\>

***

### toArray()

> **toArray**(): `boolean`[]

Defined in: [core/src/encode.ts:501](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L501)

Convert to full boolean array for compatibility

#### Returns

`boolean`[]

***

### \[iterator\]()

> **\[iterator\]**(): `Generator`\<`boolean`\>

Defined in: [core/src/encode.ts:510](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L510)

Iterable implementation for for...of loops

#### Returns

`Generator`\<`boolean`\>

#### Implementation of

`Iterable.[iterator]`
