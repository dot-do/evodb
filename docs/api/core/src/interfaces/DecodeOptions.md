[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / DecodeOptions

# Interface: DecodeOptions

Defined in: [core/src/snippet-format.ts:120](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L120)

Decode options for zero-copy paths

## Properties

### zeroCopy?

> `optional` **zeroCopy**: `boolean`

Defined in: [core/src/snippet-format.ts:122](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L122)

Skip decoding, return raw typed array view

***

### rowRange?

> `optional` **rowRange**: \[`number`, `number`\]

Defined in: [core/src/snippet-format.ts:124](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L124)

Only decode rows in range [start, end)

***

### columns?

> `optional` **columns**: `string`[]

Defined in: [core/src/snippet-format.ts:126](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L126)

Column paths to decode (projection pushdown)

***

### skipByZoneMap?

> `optional` **skipByZoneMap**: `object`

Defined in: [core/src/snippet-format.ts:128](https://github.com/dot-do/evodb/blob/main/core/src/snippet-format.ts#L128)

Skip columns where zone map indicates no matching values

#### min?

> `optional` **min**: `number`

#### max?

> `optional` **max**: `number`
