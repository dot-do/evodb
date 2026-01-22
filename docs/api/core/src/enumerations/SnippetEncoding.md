[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / SnippetEncoding

# Enumeration: SnippetEncoding

Defined in: [core/src/snippet-format.ts:92](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L92)

Snippet-specific encodings optimized for 5ms decode

## Enumeration Members

### Raw

> **Raw**: `0`

Defined in: [core/src/snippet-format.ts:94](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L94)

Raw bytes - zero copy read

***

### Delta

> **Delta**: `1`

Defined in: [core/src/snippet-format.ts:96](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L96)

Delta encoding for sorted integers

***

### DeltaBitPack

> **DeltaBitPack**: `2`

Defined in: [core/src/snippet-format.ts:98](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L98)

Delta + BitPacking for integers (no decompression needed)

***

### Dict

> **Dict**: `3`

Defined in: [core/src/snippet-format.ts:100](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L100)

Dictionary encoding with binary search

***

### RLE

> **RLE**: `4`

Defined in: [core/src/snippet-format.ts:102](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L102)

Run-length encoding

***

### Bitmap

> **Bitmap**: `5`

Defined in: [core/src/snippet-format.ts:104](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L104)

Boolean bitmap
