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

import { captureStackTrace } from './stack-trace.js';

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
    captureStackTrace(this, EvoDBError);
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
    captureStackTrace(this, QueryError);
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
    captureStackTrace(this, TimeoutError);
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
    captureStackTrace(this, ValidationError);
  }
}

/**
 * Error codes for storage operations.
 * Use these codes for programmatic error identification and handling.
 *
 * @example
 * ```typescript
 * import { StorageError, StorageErrorCode } from '@evodb/core';
 *
 * try {
 *   await storage.read('nonexistent');
 * } catch (error) {
 *   if (error instanceof StorageError) {
 *     switch (error.code) {
 *       case StorageErrorCode.NOT_FOUND:
 *         console.log('Object does not exist');
 *         break;
 *       case StorageErrorCode.PERMISSION_DENIED:
 *         console.log('Access denied');
 *         break;
 *       default:
 *         console.log('Storage error:', error.message);
 *     }
 *   }
 * }
 * ```
 */
export enum StorageErrorCode {
  /** Object or resource not found in storage */
  NOT_FOUND = 'NOT_FOUND',
  /** Permission denied to access the resource */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /** Operation timed out */
  TIMEOUT = 'TIMEOUT',
  /** Storage quota exceeded */
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  /** Network error during storage operation */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Data corruption detected (checksum mismatch, invalid format, etc.) */
  CORRUPTED_DATA = 'CORRUPTED_DATA',
  /** Invalid storage path or key */
  INVALID_PATH = 'INVALID_PATH',
  /** Concurrent modification conflict (optimistic locking failure) */
  CONCURRENT_MODIFICATION = 'CONCURRENT_MODIFICATION',
  /** Unknown or unclassified storage error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Type guard to check if a string is a valid StorageErrorCode.
 * Useful for validating error codes from external sources.
 *
 * @param code - The string to check
 * @returns true if the code is a valid StorageErrorCode value
 *
 * @example
 * ```typescript
 * if (isStorageErrorCode(error.code)) {
 *   // TypeScript knows error.code is StorageErrorCode here
 *   handleKnownError(error.code);
 * }
 * ```
 */
export function isStorageErrorCode(code: string): code is StorageErrorCode {
  return Object.values(StorageErrorCode).includes(code as StorageErrorCode);
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
 * throw new StorageError('Storage quota exceeded', StorageErrorCode.QUOTA_EXCEEDED);
 * throw new StorageError('Custom error', 'CUSTOM_CODE'); // backward compatible
 * ```
 */
export class StorageError extends EvoDBError {
  /**
   * Create a new StorageError
   *
   * @param message - Human-readable error message
   * @param code - Error code (default: 'STORAGE_ERROR'). Can be a StorageErrorCode enum value or a custom string.
   */
  constructor(message: string, code: string | StorageErrorCode = 'STORAGE_ERROR') {
    super(message, code);
    this.name = 'StorageError';
    captureStackTrace(this, StorageError);
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
    captureStackTrace(this, CorruptedBlockError);
  }
}
