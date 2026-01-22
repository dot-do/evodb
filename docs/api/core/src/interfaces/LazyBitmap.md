[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / LazyBitmap

# Interface: LazyBitmap

Defined in: [core/src/encode.ts:399](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L399)

Lazy bitmap interface for on-demand bit access.
Avoids allocating the full boolean array upfront - ideal for sparse access patterns
where only a subset of bits are needed.

Memory comparison for 100K elements:
- Eager unpackBits: ~100KB (boolean array allocated upfront)
- LazyBitmap: ~0KB (no allocation until toArray() is called)

Use cases:
- Checking specific indices without full unpacking
- Early termination in scan operations
- Memory-constrained environments (Cloudflare Snippets: 32MB RAM)

## Properties

### length

> `readonly` **length**: `number`

Defined in: [core/src/encode.ts:405](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L405)

Total number of elements in the bitmap

## Methods

### get()

> **get**(`i`): `boolean`

Defined in: [core/src/encode.ts:401](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L401)

Get the boolean value at index i

#### Parameters

##### i

`number`

#### Returns

`boolean`

***

### toArray()

> **toArray**(): `boolean`[]

Defined in: [core/src/encode.ts:403](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L403)

Convert to full boolean array for dense access patterns

#### Returns

`boolean`[]
