[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [rpc/src](../README.md) / EventEmitterConfig

# Interface: EventEmitterConfig

Defined in: [rpc/src/client.ts:90](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L90)

Configuration for EventEmitter

## Properties

### onHandlerError?

> `optional` **onHandlerError**: [`OnHandlerErrorCallback`](../type-aliases/OnHandlerErrorCallback.md)

Defined in: [rpc/src/client.ts:95](https://github.com/dot-do/evodb/blob/main/rpc/src/client.ts#L95)

Optional callback for custom error handling when event handlers throw.
If not provided, errors are only logged to console.error.
