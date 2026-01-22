[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / isRetryableError

# Function: isRetryableError()

> **isRetryableError**(`error`): `boolean`

Defined in: core/src/retry.ts:183

Determines if an error should be retried based on its type and content.

Errors that ARE retryable (transient failures):
- StorageError with NETWORK_ERROR or TIMEOUT codes
- TimeoutError
- Generic errors with network-related messages (ECONNRESET, etc.)

Errors that are NOT retryable (permanent failures):
- ValidationError (input validation failure)
- QueryError (invalid query syntax)
- StorageError with NOT_FOUND, PERMISSION_DENIED, CORRUPTED_DATA codes
- Any error without clear transient indicators

## Parameters

### error

`Error`

The error to evaluate

## Returns

`boolean`

true if the error indicates a transient failure that may succeed on retry

## Example

```typescript
try {
  await storage.read(key);
} catch (error) {
  if (isRetryableError(error)) {
    // Safe to retry - likely a temporary network issue
    await retry();
  } else {
    // Don't retry - permanent failure like file not found
    throw error;
  }
}
```
