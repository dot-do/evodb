/**
 * Tests for typed exception classes
 *
 * TDD: Write tests first, then implement the error classes
 */

import { describe, it, expect } from 'vitest';
import {
  EvoDBError,
  QueryError,
  TimeoutError,
  ValidationError,
  StorageError,
  CorruptedBlockError,
} from '../errors.js';

describe('EvoDBError base class', () => {
  it('should be an instance of Error', () => {
    const error = new EvoDBError('Test error', 'TEST_ERROR');
    expect(error).toBeInstanceOf(Error);
  });

  it('should have a name property set to EvoDBError', () => {
    const error = new EvoDBError('Test error', 'TEST_ERROR');
    expect(error.name).toBe('EvoDBError');
  });

  it('should have a message property', () => {
    const error = new EvoDBError('Test error message', 'TEST_ERROR');
    expect(error.message).toBe('Test error message');
  });

  it('should have a code property', () => {
    const error = new EvoDBError('Test error', 'MY_ERROR_CODE');
    expect(error.code).toBe('MY_ERROR_CODE');
  });

  it('should capture stack trace', () => {
    const error = new EvoDBError('Test error', 'TEST_ERROR');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('EvoDBError');
  });

  it('should support optional details property', () => {
    const details = { path: 'users.name', index: 5 };
    const error = new EvoDBError('Test error', 'TEST_ERROR', details);
    expect(error.details).toEqual(details);
  });

  it('should have undefined details when not provided', () => {
    const error = new EvoDBError('Test error', 'TEST_ERROR');
    expect(error.details).toBeUndefined();
  });
});

describe('QueryError', () => {
  it('should extend EvoDBError', () => {
    const error = new QueryError('Invalid query');
    expect(error).toBeInstanceOf(EvoDBError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should have name set to QueryError', () => {
    const error = new QueryError('Invalid query');
    expect(error.name).toBe('QueryError');
  });

  it('should have default code QUERY_ERROR', () => {
    const error = new QueryError('Invalid query');
    expect(error.code).toBe('QUERY_ERROR');
  });

  it('should allow custom error code', () => {
    const error = new QueryError('Invalid query', 'QUERY_SYNTAX_ERROR');
    expect(error.code).toBe('QUERY_SYNTAX_ERROR');
  });

  it('should have the correct message', () => {
    const error = new QueryError('Query execution failed');
    expect(error.message).toBe('Query execution failed');
  });
});

describe('TimeoutError', () => {
  it('should extend EvoDBError', () => {
    const error = new TimeoutError('Operation timed out');
    expect(error).toBeInstanceOf(EvoDBError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should have name set to TimeoutError', () => {
    const error = new TimeoutError('Operation timed out');
    expect(error.name).toBe('TimeoutError');
  });

  it('should have default code TIMEOUT_ERROR', () => {
    const error = new TimeoutError('Operation timed out');
    expect(error.code).toBe('TIMEOUT_ERROR');
  });

  it('should allow custom error code', () => {
    const error = new TimeoutError('Query timed out', 'QUERY_TIMEOUT');
    expect(error.code).toBe('QUERY_TIMEOUT');
  });

  it('should have the correct message', () => {
    const error = new TimeoutError('Connection timed out after 30s');
    expect(error.message).toBe('Connection timed out after 30s');
  });
});

describe('ValidationError', () => {
  it('should extend EvoDBError', () => {
    const error = new ValidationError('Invalid data');
    expect(error).toBeInstanceOf(EvoDBError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should have name set to ValidationError', () => {
    const error = new ValidationError('Invalid data');
    expect(error.name).toBe('ValidationError');
  });

  it('should have default code VALIDATION_ERROR', () => {
    const error = new ValidationError('Invalid data');
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('should allow custom error code', () => {
    const error = new ValidationError('Schema mismatch', 'SCHEMA_VALIDATION_ERROR');
    expect(error.code).toBe('SCHEMA_VALIDATION_ERROR');
  });

  it('should have the correct message', () => {
    const error = new ValidationError("Field 'name' is required");
    expect(error.message).toBe("Field 'name' is required");
  });

  it('should support encoding validation details', () => {
    const details = {
      path: 'user.age',
      index: 2,
      expectedType: 'Int32',
      actualType: 'string',
      actualValue: 'not a number',
    };
    const error = new ValidationError('Type mismatch at index 2', 'ENCODING_VALIDATION_ERROR', details);
    expect(error.code).toBe('ENCODING_VALIDATION_ERROR');
    expect(error.details).toEqual(details);
    expect(error.details?.path).toBe('user.age');
  });
});

describe('StorageError', () => {
  it('should extend EvoDBError', () => {
    const error = new StorageError('Storage operation failed');
    expect(error).toBeInstanceOf(EvoDBError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should have name set to StorageError', () => {
    const error = new StorageError('Storage operation failed');
    expect(error.name).toBe('StorageError');
  });

  it('should have default code STORAGE_ERROR', () => {
    const error = new StorageError('Storage operation failed');
    expect(error.code).toBe('STORAGE_ERROR');
  });

  it('should allow custom error code', () => {
    const error = new StorageError('R2 bucket not found', 'R2_NOT_FOUND');
    expect(error.code).toBe('R2_NOT_FOUND');
  });

  it('should have the correct message', () => {
    const error = new StorageError('Failed to write block to storage');
    expect(error.message).toBe('Failed to write block to storage');
  });

  it('should support corruption details', () => {
    const details = {
      expected: 0x434A4C42,
      actual: 0x00000000,
      offset: 0,
    };
    const error = new StorageError('Invalid magic number', 'INVALID_MAGIC', details);
    expect(error.code).toBe('INVALID_MAGIC');
    expect(error.details).toEqual(details);
    expect(error.details?.expected).toBe(0x434A4C42);
  });
});

describe('StorageErrorCode enum', () => {
  it('should be exported from errors module', async () => {
    const { StorageErrorCode } = await import('../errors.js');
    expect(StorageErrorCode).toBeDefined();
  });

  it('should have NOT_FOUND code', async () => {
    const { StorageErrorCode } = await import('../errors.js');
    expect(StorageErrorCode.NOT_FOUND).toBe('NOT_FOUND');
  });

  it('should have PERMISSION_DENIED code', async () => {
    const { StorageErrorCode } = await import('../errors.js');
    expect(StorageErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
  });

  it('should have TIMEOUT code', async () => {
    const { StorageErrorCode } = await import('../errors.js');
    expect(StorageErrorCode.TIMEOUT).toBe('TIMEOUT');
  });

  it('should have QUOTA_EXCEEDED code', async () => {
    const { StorageErrorCode } = await import('../errors.js');
    expect(StorageErrorCode.QUOTA_EXCEEDED).toBe('QUOTA_EXCEEDED');
  });

  it('should have NETWORK_ERROR code', async () => {
    const { StorageErrorCode } = await import('../errors.js');
    expect(StorageErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
  });

  it('should have CORRUPTED_DATA code', async () => {
    const { StorageErrorCode } = await import('../errors.js');
    expect(StorageErrorCode.CORRUPTED_DATA).toBe('CORRUPTED_DATA');
  });

  it('should have INVALID_PATH code', async () => {
    const { StorageErrorCode } = await import('../errors.js');
    expect(StorageErrorCode.INVALID_PATH).toBe('INVALID_PATH');
  });

  it('should have CONCURRENT_MODIFICATION code', async () => {
    const { StorageErrorCode } = await import('../errors.js');
    expect(StorageErrorCode.CONCURRENT_MODIFICATION).toBe('CONCURRENT_MODIFICATION');
  });

  it('should have UNKNOWN code', async () => {
    const { StorageErrorCode } = await import('../errors.js');
    expect(StorageErrorCode.UNKNOWN).toBe('UNKNOWN');
  });
});

describe('StorageError with StorageErrorCode', () => {
  it('should accept StorageErrorCode enum values', async () => {
    const { StorageError, StorageErrorCode } = await import('../errors.js');
    const error = new StorageError('Object not found', StorageErrorCode.NOT_FOUND);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('should allow programmatic error code matching', async () => {
    const { StorageError, StorageErrorCode } = await import('../errors.js');
    const error = new StorageError('Permission denied', StorageErrorCode.PERMISSION_DENIED);

    // Programmatic matching - the main use case for error codes
    expect(error.code === StorageErrorCode.PERMISSION_DENIED).toBe(true);
    expect(error.code === StorageErrorCode.NOT_FOUND).toBe(false);
  });

  it('should support switch statement matching on error codes', async () => {
    const { StorageError, StorageErrorCode } = await import('../errors.js');
    const error = new StorageError('Quota exceeded', StorageErrorCode.QUOTA_EXCEEDED);

    let matchedCode = '';
    switch (error.code) {
      case StorageErrorCode.NOT_FOUND:
        matchedCode = 'not_found';
        break;
      case StorageErrorCode.PERMISSION_DENIED:
        matchedCode = 'permission_denied';
        break;
      case StorageErrorCode.QUOTA_EXCEEDED:
        matchedCode = 'quota_exceeded';
        break;
      default:
        matchedCode = 'other';
    }

    expect(matchedCode).toBe('quota_exceeded');
  });

  it('should maintain backward compatibility with string codes', async () => {
    const { StorageError } = await import('../errors.js');
    // Old code using string codes should still work
    const error = new StorageError('Custom error', 'MY_CUSTOM_CODE');
    expect(error.code).toBe('MY_CUSTOM_CODE');
  });

  it('should allow isStorageErrorCode type guard', async () => {
    const { StorageErrorCode, isStorageErrorCode } = await import('../errors.js');

    expect(isStorageErrorCode(StorageErrorCode.NOT_FOUND)).toBe(true);
    expect(isStorageErrorCode(StorageErrorCode.TIMEOUT)).toBe(true);
    expect(isStorageErrorCode('RANDOM_STRING')).toBe(false);
    expect(isStorageErrorCode('NOT_FOUND')).toBe(true); // String value matching enum
  });
});

describe('Error type checking', () => {
  it('should allow catching specific error types', () => {
    const queryError = new QueryError('Query failed');
    const timeoutError = new TimeoutError('Timed out');
    const validationError = new ValidationError('Invalid');
    const storageError = new StorageError('Storage failed');

    expect(queryError instanceof QueryError).toBe(true);
    expect(queryError instanceof TimeoutError).toBe(false);
    expect(queryError instanceof ValidationError).toBe(false);
    expect(queryError instanceof StorageError).toBe(false);

    expect(timeoutError instanceof TimeoutError).toBe(true);
    expect(timeoutError instanceof QueryError).toBe(false);

    expect(validationError instanceof ValidationError).toBe(true);
    expect(validationError instanceof QueryError).toBe(false);

    expect(storageError instanceof StorageError).toBe(true);
    expect(storageError instanceof QueryError).toBe(false);
  });

  it('should allow catching all EvoDB errors with base class', () => {
    const errors = [
      new QueryError('Query failed'),
      new TimeoutError('Timed out'),
      new ValidationError('Invalid'),
      new StorageError('Storage failed'),
    ];

    for (const error of errors) {
      expect(error instanceof EvoDBError).toBe(true);
    }
  });
});

describe('Error codes', () => {
  it('should have distinct default codes for each error type', () => {
    const codes = new Set([
      new QueryError('').code,
      new TimeoutError('').code,
      new ValidationError('').code,
      new StorageError('').code,
    ]);
    expect(codes.size).toBe(4);
  });
});

describe('Consolidated error hierarchy', () => {
  it('should have 4 essential error types extending EvoDBError', () => {
    // Core 4 types that extend EvoDBError directly
    expect(new QueryError('test')).toBeInstanceOf(EvoDBError);
    expect(new TimeoutError('test')).toBeInstanceOf(EvoDBError);
    expect(new ValidationError('test')).toBeInstanceOf(EvoDBError);
    expect(new StorageError('test')).toBeInstanceOf(EvoDBError);
  });

  it('should have EncodingValidationError as ValidationError alias', async () => {
    const { EncodingValidationError } = await import('../errors.js');
    const error = new EncodingValidationError('test');
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe('ENCODING_VALIDATION_ERROR');
  });

  it('should have CorruptedBlockError as StorageError alias', () => {
    const error = new CorruptedBlockError('test');
    expect(error).toBeInstanceOf(StorageError);
    expect(error.code).toBe('CORRUPTED_BLOCK');
  });

  it('should support details property on all error types', async () => {
    const { EncodingValidationError } = await import('../errors.js');

    const queryError = new QueryError('test', 'QUERY_ERROR', { table: 'users' });
    const timeoutError = new TimeoutError('test', 'TIMEOUT_ERROR', { duration: 30000 });
    const validationError = new ValidationError('test', 'VALIDATION_ERROR', { field: 'email' });
    const storageError = new StorageError('test', 'STORAGE_ERROR', { path: '/data/block.bin' });
    const encodingError = new EncodingValidationError('test', 'ENCODING_VALIDATION_ERROR', { path: 'user.age' });
    const corruptedError = new CorruptedBlockError('test', 'CORRUPTED_BLOCK', { expected: 0x434A4C42 });

    expect(queryError.details?.table).toBe('users');
    expect(timeoutError.details?.duration).toBe(30000);
    expect(validationError.details?.field).toBe('email');
    expect(storageError.details?.path).toBe('/data/block.bin');
    expect(encodingError.details?.path).toBe('user.age');
    expect(corruptedError.details?.expected).toBe(0x434A4C42);
  });
});

describe('CorruptedBlockError', () => {
  it('should extend StorageError', () => {
    const error = new CorruptedBlockError('Block corrupted');
    expect(error).toBeInstanceOf(StorageError);
    expect(error).toBeInstanceOf(EvoDBError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should have name set to CorruptedBlockError', () => {
    const error = new CorruptedBlockError('Block corrupted');
    expect(error.name).toBe('CorruptedBlockError');
  });

  it('should have default code CORRUPTED_BLOCK', () => {
    const error = new CorruptedBlockError('Block corrupted');
    expect(error.code).toBe('CORRUPTED_BLOCK');
  });

  it('should allow custom error code', () => {
    const error = new CorruptedBlockError('Invalid magic', 'INVALID_MAGIC');
    expect(error.code).toBe('INVALID_MAGIC');
  });

  it('should have the correct message', () => {
    const error = new CorruptedBlockError('Checksum mismatch detected');
    expect(error.message).toBe('Checksum mismatch detected');
  });

  it('should support optional details property', () => {
    const error = new CorruptedBlockError('Checksum mismatch', 'CHECKSUM_MISMATCH', {
      expected: 0x12345678,
      actual: 0x87654321,
      offset: 30,
    });
    expect(error.details).toBeDefined();
    expect(error.details?.expected).toBe(0x12345678);
    expect(error.details?.actual).toBe(0x87654321);
    expect(error.details?.offset).toBe(30);
  });

  it('should have undefined details when not provided', () => {
    const error = new CorruptedBlockError('Block corrupted');
    expect(error.details).toBeUndefined();
  });

  it('should be catchable as StorageError', () => {
    let caughtAsStorage = false;
    try {
      throw new CorruptedBlockError('Block corrupted');
    } catch (error) {
      if (error instanceof StorageError) {
        caughtAsStorage = true;
      }
    }
    expect(caughtAsStorage).toBe(true);
  });
});

describe('EncodingValidationError', () => {
  it('should extend ValidationError', async () => {
    const { EncodingValidationError } = await import('../errors.js');
    const error = new EncodingValidationError('Type mismatch');
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toBeInstanceOf(EvoDBError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should have name set to EncodingValidationError', async () => {
    const { EncodingValidationError } = await import('../errors.js');
    const error = new EncodingValidationError('Type mismatch');
    expect(error.name).toBe('EncodingValidationError');
  });

  it('should have default code ENCODING_VALIDATION_ERROR', async () => {
    const { EncodingValidationError } = await import('../errors.js');
    const error = new EncodingValidationError('Type mismatch');
    expect(error.code).toBe('ENCODING_VALIDATION_ERROR');
  });

  it('should allow custom error code', async () => {
    const { EncodingValidationError } = await import('../errors.js');
    const error = new EncodingValidationError('Null not allowed', 'NULL_NOT_ALLOWED');
    expect(error.code).toBe('NULL_NOT_ALLOWED');
  });

  it('should support encoding validation details', async () => {
    const { EncodingValidationError } = await import('../errors.js');
    const details = {
      path: 'user.age',
      index: 2,
      expectedType: 'Int32',
      actualType: 'string',
      actualValue: 'not a number',
    };
    const error = new EncodingValidationError('Type mismatch at index 2', 'TYPE_MISMATCH', details);
    expect(error.details).toEqual(details);
    expect(error.details?.path).toBe('user.age');
    expect(error.details?.expectedType).toBe('Int32');
  });

  it('should be catchable as ValidationError', async () => {
    const { EncodingValidationError } = await import('../errors.js');
    let caughtAsValidation = false;
    try {
      throw new EncodingValidationError('Type mismatch');
    } catch (error) {
      if (error instanceof ValidationError) {
        caughtAsValidation = true;
      }
    }
    expect(caughtAsValidation).toBe(true);
  });
});
