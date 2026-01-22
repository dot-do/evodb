[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / DEFAULT\_MAX\_BUFFER\_SIZE

# Variable: DEFAULT\_MAX\_BUFFER\_SIZE

> `const` **DEFAULT\_MAX\_BUFFER\_SIZE**: `number`

Defined in: [writer/src/buffer.ts:18](https://github.com/dot-do/evodb/blob/main/writer/src/buffer.ts#L18)

Default maximum buffer size (128MB)
This provides a hard limit to prevent unbounded memory growth
when flush operations fail repeatedly.
