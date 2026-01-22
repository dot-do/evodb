[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / BloomFilter

# Class: BloomFilter

Defined in: [core/src/snippet-format.ts:347](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L347)

Space-efficient bloom filter implementation using bit arrays.

Uses Uint8Array for compact storage instead of Map<string, Set<string>>.
Achieves ~136x smaller memory footprint compared to Map-based approaches.

Features:
- Configurable false positive rate (default ~1%)
- Optimal hash count based on target FPR
- Serializable to/from bytes for storage/caching
- No false negatives guaranteed

## Constructors

### Constructor

> **new BloomFilter**(`expectedElements`, `configOrFpr?`): `BloomFilter`

Defined in: [core/src/snippet-format.ts:371](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L371)

Create a new bloom filter.

#### Parameters

##### expectedElements

`number`

Expected number of elements to add

##### configOrFpr?

Optional: false positive rate (0-1) or full config object.
                     Default is ~1% FPR using BLOOM_BITS_PER_ELEMENT.

`number` | \{ `falsePositiveRate?`: `number`; \}

#### Returns

`BloomFilter`

#### Examples

```ts
// Default 1% false positive rate
const bloom = new BloomFilter(1000);
```

```ts
// Custom 0.1% false positive rate
const bloom = new BloomFilter(1000, 0.001);
```

```ts
// Using config object
const bloom = new BloomFilter(1000, { falsePositiveRate: 0.001 });
```

## Methods

### fromBytes()

> `static` **fromBytes**(`bytes`): `BloomFilter`

Defined in: [core/src/snippet-format.ts:396](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L396)

Create from existing bytes

#### Parameters

##### bytes

`Uint8Array`

#### Returns

`BloomFilter`

***

### withFalsePositiveRate()

> `static` **withFalsePositiveRate**(`expectedElements`, `falsePositiveRate`): `BloomFilter`

Defined in: [core/src/snippet-format.ts:410](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L410)

Create a bloom filter with specific false positive rate.
Convenience factory method.

#### Parameters

##### expectedElements

`number`

Expected number of elements

##### falsePositiveRate

`number`

Target false positive rate (0-1)

#### Returns

`BloomFilter`

***

### add()

> **add**(`value`): `void`

Defined in: [core/src/snippet-format.ts:415](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L415)

Add a value to the filter

#### Parameters

##### value

`string` | `number`

#### Returns

`void`

***

### mightContain()

> **mightContain**(`value`): `boolean`

Defined in: [core/src/snippet-format.ts:424](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L424)

Check if value might be in the filter

#### Parameters

##### value

`string` | `number`

#### Returns

`boolean`

***

### toBytes()

> **toBytes**(): `Uint8Array`

Defined in: [core/src/snippet-format.ts:436](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L436)

Get the underlying bytes

#### Returns

`Uint8Array`

***

### getHashCount()

> **getHashCount**(): `number`

Defined in: [core/src/snippet-format.ts:441](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L441)

Get the number of hash functions used

#### Returns

`number`

***

### getSizeBytes()

> **getSizeBytes**(): `number`

Defined in: [core/src/snippet-format.ts:446](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L446)

Get the size in bytes

#### Returns

`number`

***

### getSizeBits()

> **getSizeBits**(): `number`

Defined in: [core/src/snippet-format.ts:451](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L451)

Get the size in bits

#### Returns

`number`
