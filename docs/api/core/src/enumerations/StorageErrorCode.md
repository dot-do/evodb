[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / StorageErrorCode

# Enumeration: StorageErrorCode

Defined in: [core/src/errors.ts:313](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L313)

Error codes for storage operations.
Use these codes for programmatic error identification and handling.

## Example

```typescript
import { StorageError, StorageErrorCode } from '@evodb/core';

try {
  await storage.read('nonexistent');
} catch (error) {
  if (error instanceof StorageError) {
    switch (error.code) {
      case StorageErrorCode.NOT_FOUND:
        console.log('Object does not exist');
        break;
      case StorageErrorCode.PERMISSION_DENIED:
        console.log('Access denied');
        break;
      default:
        console.log('Storage error:', error.message);
    }
  }
}
```

## Enumeration Members

### NOT\_FOUND

> **NOT\_FOUND**: `"NOT_FOUND"`

Defined in: [core/src/errors.ts:315](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L315)

Object or resource not found in storage

***

### PERMISSION\_DENIED

> **PERMISSION\_DENIED**: `"PERMISSION_DENIED"`

Defined in: [core/src/errors.ts:317](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L317)

Permission denied to access the resource

***

### TIMEOUT

> **TIMEOUT**: `"TIMEOUT"`

Defined in: [core/src/errors.ts:319](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L319)

Operation timed out

***

### QUOTA\_EXCEEDED

> **QUOTA\_EXCEEDED**: `"QUOTA_EXCEEDED"`

Defined in: [core/src/errors.ts:321](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L321)

Storage quota exceeded

***

### NETWORK\_ERROR

> **NETWORK\_ERROR**: `"NETWORK_ERROR"`

Defined in: [core/src/errors.ts:323](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L323)

Network error during storage operation

***

### CORRUPTED\_DATA

> **CORRUPTED\_DATA**: `"CORRUPTED_DATA"`

Defined in: [core/src/errors.ts:325](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L325)

Data corruption detected (checksum mismatch, invalid format, etc.)

***

### INVALID\_PATH

> **INVALID\_PATH**: `"INVALID_PATH"`

Defined in: [core/src/errors.ts:327](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L327)

Invalid storage path or key

***

### CONCURRENT\_MODIFICATION

> **CONCURRENT\_MODIFICATION**: `"CONCURRENT_MODIFICATION"`

Defined in: [core/src/errors.ts:329](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L329)

Concurrent modification conflict (optimistic locking failure)

***

### UNKNOWN

> **UNKNOWN**: `"UNKNOWN"`

Defined in: [core/src/errors.ts:331](https://github.com/dot-do/evodb/blob/main/core/src/errors.ts#L331)

Unknown or unclassified storage error
