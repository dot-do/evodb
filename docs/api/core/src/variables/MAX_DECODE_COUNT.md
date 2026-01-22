[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / MAX\_DECODE\_COUNT

# Variable: MAX\_DECODE\_COUNT

> `const` **MAX\_DECODE\_COUNT**: `number`

Defined in: [core/src/encode.ts:971](https://github.com/dot-do/evodb/blob/main/core/src/encode.ts#L971)

Maximum count for decode operations.
JavaScript arrays have a maximum length of 2^32 - 1 elements.
We use a lower bound to be safe and catch unreasonably large counts early,
preventing memory allocation failures with cryptic error messages.
