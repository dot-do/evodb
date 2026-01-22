[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BlockIndexLimitError

# Class: BlockIndexLimitError

Defined in: [writer/src/errors.ts:19](https://github.com/dot-do/evodb/blob/main/writer/src/errors.ts#L19)

Error thrown when the block index exceeds its configured maximum size
and eviction policy is set to 'none'.

## Extends

- [`WriterError`](WriterError.md)

## Constructors

### Constructor

> **new BlockIndexLimitError**(`currentSize`, `limit`): `BlockIndexLimitError`

Defined in: [writer/src/errors.ts:26](https://github.com/dot-do/evodb/blob/main/writer/src/errors.ts#L26)

#### Parameters

##### currentSize

`number`

##### limit

`number`

#### Returns

`BlockIndexLimitError`

#### Overrides

[`WriterError`](WriterError.md).[`constructor`](WriterError.md#constructor)

## Properties

### currentSize

> `readonly` **currentSize**: `number`

Defined in: [writer/src/errors.ts:21](https://github.com/dot-do/evodb/blob/main/writer/src/errors.ts#L21)

Current number of entries in the block index

***

### limit

> `readonly` **limit**: `number`

Defined in: [writer/src/errors.ts:24](https://github.com/dot-do/evodb/blob/main/writer/src/errors.ts#L24)

Configured maximum size limit
