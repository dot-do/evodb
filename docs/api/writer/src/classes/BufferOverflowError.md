[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BufferOverflowError

# Class: BufferOverflowError

Defined in: [writer/src/buffer.ts:24](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L24)

Error thrown when buffer exceeds maximum size limit.
This prevents unbounded memory growth when flush operations fail.

## Extends

- `Error`

## Constructors

### Constructor

> **new BufferOverflowError**(`currentSize`, `maxSize`): `BufferOverflowError`

Defined in: [writer/src/buffer.ts:28](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L28)

#### Parameters

##### currentSize

`number`

##### maxSize

`number`

#### Returns

`BufferOverflowError`

#### Overrides

`Error.constructor`

## Properties

### currentSize

> `readonly` **currentSize**: `number`

Defined in: [writer/src/buffer.ts:25](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L25)

***

### maxSize

> `readonly` **maxSize**: `number`

Defined in: [writer/src/buffer.ts:26](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L26)
