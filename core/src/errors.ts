/**
 * Typed exception classes for EvoDB
 *
 * Provides a standardized error hierarchy for consistent error handling
 * across the codebase. Each error class has a code property for programmatic
 * error identification.
 *
 * @example
 * ```typescript
 * import { QueryError, ValidationError, StorageError, TimeoutError } from '@evodb/core';
 *
 * try {
 *   await db.query('users').where('invalid').execute();
 * } catch (error) {
 *   if (error instanceof QueryError) {
 *     console.log(`Query failed: ${error.message} (code: ${error.code})`);
 *   } else if (error instanceof ValidationError) {
 *     console.log(`Validation failed: ${error.message}`);
 *   }
 * }
 * ```
 */

/**
 * Base error class for all EvoDB errors
 *
 * All EvoDB-specific errors extend this class, allowing for:
 * - Catching all EvoDB errors with a single catch block
 * - Programmatic error identification via the `code` property
 * - Proper stack traces and error inheritance
 */
export class EvoDBError extends Error {
  /**
   * Error code for programmatic identification
   *
   * Common codes:
   * - QUERY_ERROR: Query-related errors
   * - TIMEOUT_ERROR: Operation timeout
   * - VALIDATION_ERROR: Data validation failures
   * - STORAGE_ERROR: Storage operation failures
   */
  public readonly code: string;

  /**
   * Create a new EvoDBError
   *
   * @param message - Human-readable error message
   * @param code - Error code for programmatic identification
   */
  constructor(message: string, code: string) {
    super(message);
    this.name = 'EvoDBError';
    this.code = code;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((Error as any).captureStackTrace) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when a query operation fails
 *
 * Examples:
 * - Invalid query syntax
 * - Query execution failure
 * - Unsupported query operation
 *
 * @example
 * ```typescript
 * throw new QueryError('Invalid filter operator: unknown');
 * throw new QueryError('Table not found: users', 'TABLE_NOT_FOUND');
 * ```
 */
export class QueryError extends EvoDBError {
  /**
   * Create a new QueryError
   *
   * @param message - Human-readable error message
   * @param code - Error code (default: 'QUERY_ERROR')
   */
  constructor(message: string, code: string = 'QUERY_ERROR') {
    super(message, code);
    this.name = 'QueryError';
  }
}

/**
 * Error thrown when an operation times out
 *
 * Examples:
 * - Query execution timeout
 * - Storage operation timeout
 * - Connection timeout
 *
 * @example
 * ```typescript
 * throw new TimeoutError('Query execution timed out after 30s');
 * throw new TimeoutError('Connection timed out', 'CONNECTION_TIMEOUT');
 * ```
 */
export class TimeoutError extends EvoDBError {
  /**
   * Create a new TimeoutError
   *
   * @param message - Human-readable error message
   * @param code - Error code (default: 'TIMEOUT_ERROR')
   */
  constructor(message: string, code: string = 'TIMEOUT_ERROR') {
    super(message, code);
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when data validation fails
 *
 * Examples:
 * - Required field missing
 * - Type mismatch
 * - Schema constraint violation
 * - Format validation failure (email, URL, etc.)
 *
 * @example
 * ```typescript
 * throw new ValidationError("Required field 'email' is missing");
 * throw new ValidationError('Schema mismatch: expected number, got string', 'TYPE_MISMATCH');
 * ```
 */
export class ValidationError extends EvoDBError {
  /**
   * Create a new ValidationError
   *
   * @param message - Human-readable error message
   * @param code - Error code (default: 'VALIDATION_ERROR')
   */
  constructor(message: string, code: string = 'VALIDATION_ERROR') {
    super(message, code);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when a storage operation fails
 *
 * Examples:
 * - Failed to read/write to R2
 * - Storage quota exceeded
 * - Permission denied
 * - Network errors during storage operations
 *
 * @example
 * ```typescript
 * throw new StorageError('Failed to write block to R2');
 * throw new StorageError('Storage quota exceeded', 'QUOTA_EXCEEDED');
 * ```
 */
export class StorageError extends EvoDBError {
  /**
   * Create a new StorageError
   *
   * @param message - Human-readable error message
   * @param code - Error code (default: 'STORAGE_ERROR')
   */
  constructor(message: string, code: string = 'STORAGE_ERROR') {
    super(message, code);
    this.name = 'StorageError';
  }
}

/**
 * Details about block corruption for debugging and logging
 */
export interface CorruptedBlockDetails {
  /** Expected value (for mismatches) */
  expected?: number;
  /** Actual value found */
  actual?: number;
  /** Byte offset where corruption was detected */
  offset?: number;
  /** Actual size of the data */
  actualSize?: number;
  /** Minimum expected size */
  minExpectedSize?: number;
  /** Version found in corrupted block */
  version?: number;
  /** List of supported versions */
  supportedVersions?: number[];
}

/**
 * Error thrown when block data is corrupted
 *
 * This error is thrown when reading block data that has been corrupted,
 * such as when R2 returns corrupted data due to storage issues, network
 * transmission errors, or other data integrity problems.
 *
 * Error codes:
 * - CORRUPTED_BLOCK: Generic corruption error
 * - INVALID_MAGIC: Magic number does not match expected value
 * - TRUNCATED_DATA: Data is shorter than expected
 * - CHECKSUM_MISMATCH: CRC32 checksum validation failed
 * - UNSUPPORTED_VERSION: Block version is not supported
 * - INVALID_STRUCTURE: Block structure is invalid (bad column count, sizes, etc.)
 *
 * @example
 * ```typescript
 * throw new CorruptedBlockError('Invalid magic number: expected 0x434A4C42, got 0x00000000', 'INVALID_MAGIC', {
 *   expected: 0x434A4C42,
 *   actual: 0x00000000,
 * });
 * ```
 */
export class CorruptedBlockError extends StorageError {
  /**
   * Additional details about the corruption for debugging
   */
  public readonly details?: CorruptedBlockDetails;

  /**
   * Create a new CorruptedBlockError
   *
   * @param message - Human-readable error message describing the corruption
   * @param code - Error code (default: 'CORRUPTED_BLOCK')
   * @param details - Additional details about the corruption
   */
  constructor(
    message: string,
    code: string = 'CORRUPTED_BLOCK',
    details?: CorruptedBlockDetails
  ) {
    super(message, code);
    this.name = 'CorruptedBlockError';
    this.details = details;
  }
}
