[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / calculateBloomParams

# Function: calculateBloomParams()

> **calculateBloomParams**(`expectedElements`, `falsePositiveRate`): `object`

Defined in: [core/src/snippet-format.ts:311](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L311)

Calculate optimal bloom filter parameters for a target false positive rate.

Formula:
- m (bits) = -n * ln(p) / (ln(2)^2)
- k (hashes) = (m/n) * ln(2)

Where n = expected elements, p = false positive rate

## Parameters

### expectedElements

`number`

### falsePositiveRate

`number` = `0.01`

## Returns

`object`

### numBits

> **numBits**: `number`

### numHashes

> **numHashes**: `number`
