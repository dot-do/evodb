[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / BloomFilterInfo

# Interface: BloomFilterInfo

Defined in: [query/src/types.ts:880](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L880)

Bloom filter information for a column.

Bloom filters provide probabilistic membership testing for equality
predicates. A negative test definitively proves a value is not present;
a positive test may have false positives at the configured rate.

## Example

```typescript
const bloomFilter: BloomFilterInfo = {
  column: 'user_id',
  sizeBits: 1048576,
  numHashFunctions: 7,
  falsePositiveRate: 0.01
};
```

## Properties

### column

> **column**: `string`

Defined in: [query/src/types.ts:882](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L882)

Column name

***

### sizeBits

> **sizeBits**: `number`

Defined in: [query/src/types.ts:885](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L885)

Filter size in bits

***

### numHashFunctions

> **numHashFunctions**: `number`

Defined in: [query/src/types.ts:888](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L888)

Number of hash functions

***

### falsePositiveRate

> **falsePositiveRate**: `number`

Defined in: [query/src/types.ts:891](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L891)

Approximate false positive rate
