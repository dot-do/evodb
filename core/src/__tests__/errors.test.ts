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
