[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / BloomFilterConfig

# Interface: BloomFilterConfig

Defined in: [core/src/snippet-format.ts:286](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L286)

Bloom filter configuration for customizing false positive rate

## Properties

### expectedElements

> **expectedElements**: `number`

Defined in: [core/src/snippet-format.ts:288](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L288)

Expected number of elements

***

### falsePositiveRate?

> `optional` **falsePositiveRate**: `number`

Defined in: [core/src/snippet-format.ts:299](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L299)

Target false positive rate (0-1).
Default is ~1% (0.01) when using BLOOM_BITS_PER_ELEMENT=10 and BLOOM_HASH_COUNT=7.
Lower rates require more memory.

Common presets:
- 0.01 (1%): 10 bits/element, 7 hashes (default)
- 0.001 (0.1%): 15 bits/element, 10 hashes
- 0.0001 (0.01%): 20 bits/element, 14 hashes
