[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / captureStackTrace

# Function: captureStackTrace()

> **captureStackTrace**(`error`, `constructorOpt?`): `void`

Defined in: [core/src/stack-trace.ts:76](https://github.com/dot-do/evodb/blob/main/core/src/stack-trace.ts#L76)

Captures a stack trace for the given error object.

In V8 environments (Node.js, Chrome, Cloudflare Workers), this uses
the native Error.captureStackTrace to create clean stack traces
that exclude internal constructor frames.

In non-V8 environments, this is a no-op - the error will still have
a stack trace from the Error constructor, just without the exclusion
of constructor frames.

## Parameters

### error

`Error`

The error object to capture the stack trace on

### constructorOpt?

`Function`

Optional constructor function to exclude from trace.
                        Pass the error class constructor to exclude it and
                        all frames above it from the stack trace.

## Returns

`void`

## Example

```typescript
// Basic usage - exclude the current constructor
class MyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MyError';
    captureStackTrace(this, MyError);
  }
}

// Usage without constructor exclusion
const error = new Error('test');
captureStackTrace(error);
```
