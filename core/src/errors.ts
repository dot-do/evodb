/**
 * Typed exception classes for EvoDB
 *
 * Error hierarchy:
 * - EvoDBError: Base error class for all EvoDB errors
 *   - QueryError: Query-related issues (syntax, execution, table not found)
 *   - ValidationError: Input/schema/encoding validation failures
 *     - EncodingValidationError: Column encoding validation errors
 *   - TimeoutError: Operation timeouts (query, connection, storage)
 *   - StorageError: Storage operation failures (R2, DO storage)
 *     - CorruptedBlockError: Data corruption (invalid magic, checksum mismatch)
 *   - NetworkError: Network-related failures (connection, WebSocket, RPC)
 *
 * Use error codes for fine-grained programmatic error handling:
 * - ErrorCode.QUERY_ERROR, ErrorCode.TABLE_NOT_FOUND, etc.
 * - ErrorCode.VALIDATION_ERROR, ErrorCode.TYPE_MISMATCH, etc.
 * - ErrorCode.TIMEOUT_ERROR, ErrorCode.CONNECTION_TIMEOUT, etc.
 * - ErrorCode.STORAGE_ERROR, ErrorCode.NOT_FOUND, etc.
 * - ErrorCode.NETWORK_ERROR, ErrorCode.WEBSOCKET_ERROR, etc.
 *
 * @example
 * ```typescript
 * import { QueryError, ValidationError, NetworkError, ErrorCode } from '@evodb/core';
 *
 * try {
 *   await db.query('users').where('invalid').execute();
 * } catch (error) {
 *   if (error instanceof QueryError) {
 *     logger.error(`Query failed: ${error.message}`, { code: error.code });
 *   } else if (error instanceof ValidationError) {
 *     logger.warn(`Validation failed: ${error.message}`, error.details);
 *   } else if (error instanceof NetworkError) {
 *     logger.error(`Network error: ${error.message}`, { code: error.code });
 *   }
 * }
 * ```
 */

import { captureStackTrace } from './stack-trace.js';

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Standard error codes for programmatic error handling.
 *
 * These codes are used across all error types for consistent identification.
 *
 * @example
 * ```typescript
 * if (error.code === ErrorCode.TABLE_NOT_FOUND) {
 *   // Create the table
 * } else if (error.code === ErrorCode.NETWORK_ERROR) {
 *   // Retry the operation
 * }
 * ```
 */
export enum ErrorCode {
  // General errors
  UNKNOWN = 'UNKNOWN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // Query errors
  QUERY_ERROR = 'QUERY_ERROR',
  TABLE_NOT_FOUND = 'TABLE_NOT_FOUND',
  QUERY_SYNTAX_ERROR = 'QUERY_SYNTAX_ERROR',
  INVALID_FILTER = 'INVALID_FILTER',
  UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  SCHEMA_VALIDATION_ERROR = 'SCHEMA_VALIDATION_ERROR',
  ENCODING_VALIDATION_ERROR = 'ENCODING_VALIDATION_ERROR',
  NULL_NOT_ALLOWED = 'NULL_NOT_ALLOWED',
  INVALID_FORMAT = 'INVALID_FORMAT',
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',

  // Timeout errors
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  QUERY_TIMEOUT = 'QUERY_TIMEOUT',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',

  // Storage errors
  STORAGE_ERROR = 'STORAGE_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  CORRUPTED_DATA = 'CORRUPTED_DATA',
  INVALID_PATH = 'INVALID_PATH',
  CONCURRENT_MODIFICATION = 'CONCURRENT_MODIFICATION',
  CORRUPTED_BLOCK = 'CORRUPTED_BLOCK',
  INVALID_MAGIC = 'INVALID_MAGIC',
  CHECKSUM_MISMATCH = 'CHECKSUM_MISMATCH',
  TRUNCATED_DATA = 'TRUNCATED_DATA',
  UNSUPPORTED_VERSION = 'UNSUPPORTED_VERSION',
  INVALID_STRUCTURE = 'INVALID_STRUCTURE',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  WEBSOCKET_ERROR = 'WEBSOCKET_ERROR',
  RPC_ERROR = 'RPC_ERROR',
  CONNECTION_CLOSED = 'CONNECTION_CLOSED',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',

  // RPC errors (@evodb/rpc)
  RPC_CONNECTION_ERROR = 'RPC_CONNECTION_ERROR',
  BUFFER_OVERFLOW = 'BUFFER_OVERFLOW',
  FLUSH_ERROR = 'FLUSH_ERROR',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',

  // Query errors (@evodb/query)
  SUBREQUEST_BUDGET_EXCEEDED = 'SUBREQUEST_BUDGET_EXCEEDED',
  MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',
  BLOCK_SIZE_VALIDATION = 'BLOCK_SIZE_VALIDATION',
  BLOCK_DATA_VALIDATION = 'BLOCK_DATA_VALIDATION',
  MANIFEST_VALIDATION = 'MANIFEST_VALIDATION',

  // Writer errors (@evodb/writer)
  WRITER_ERROR = 'WRITER_ERROR',
  BLOCK_INDEX_LIMIT = 'BLOCK_INDEX_LIMIT',

  // Lakehouse errors (@evodb/lakehouse)
  SCHEMA_ERROR = 'SCHEMA_ERROR',
  MANIFEST_ERROR = 'MANIFEST_ERROR',
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  VERSION_MISMATCH = 'VERSION_MISMATCH',

  // Streaming errors
  STREAMING_CANCELLED = 'STREAMING_CANCELLED',
  BACKPRESSURE_TIMEOUT = 'BACKPRESSURE_TIMEOUT',
}

/**
 * Type guard to check if a string is a valid ErrorCode.
 *
 * @param code - The string to check
 * @returns true if the code is a valid ErrorCode value
 */
export function isErrorCode(code: string): code is ErrorCode {
  return Object.values(ErrorCode).includes(code as ErrorCode);
}

// =============================================================================
// Base Error Class
// =============================================================================

/**
 * Base error class for all EvoDB errors
 *
 * All EvoDB-specific errors extend this class, allowing for:
 * - Catching all EvoDB errors with a single catch block
 * - Programmatic error identification via the `code` property
 * - Proper stack traces and error inheritance
 * - Optional details object for structured debugging info
 * - Helpful suggestions for common error conditions
 *
 * @example
 * ```typescript
 * try {
 *   await doSomething();
 * } catch (error) {
 *   if (error instanceof EvoDBError) {
 *     logger.error(error.message, {
 *       code: error.code,
 *       details: error.details,
 *       suggestion: error.suggestion,
 *     });
 *   }
 * }
 * ```
 */
export class EvoDBError extends Error {
  /**
   * Error code for programmatic identification.
   * Use ErrorCode enum values for consistency.
   */
  public readonly code: string;

  /**
   * Structured details for debugging (operation, target, source, etc.)
   */
  public readonly details?: Record<string, unknown>;

  /**
   * Helpful suggestion for resolving the error (when applicable)
   */
  public readonly suggestion?: string;

  /**
   * Timestamp when the error was created (milliseconds since epoch)
   */
  public readonly timestamp: number;

  /**
   * Create a new EvoDBError
   *
   * @param message - Human-readable error message
   * @param code - Error code for programmatic identification (use ErrorCode enum)
   * @param details - Optional structured details for debugging
   * @param suggestion - Optional helpful suggestion for resolving the error
   */
  constructor(
    message: string,
    code: string = ErrorCode.UNKNOWN,
    details?: Record<string, unknown>,
    suggestion?: string
  ) {
    super(message);
    this.name = 'EvoDBError';
    this.code = code;
    this.details = details;
    this.suggestion = suggestion;
    this.timestamp = Date.now();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    captureStackTrace(this, EvoDBError);
  }

  /**
   * Format error for logging with all context.
   * Returns a structured object suitable for JSON logging.
   */
  toLogContext(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
      ...(this.suggestion && { suggestion: this.suggestion }),
      timestamp: this.timestamp,
    };
  }

  /**
   * Format error as a detailed string for debugging.
   */
  toDetailedString(): string {
    const parts = [`[${this.code}] ${this.message}`];
    if (this.details) {
      const ctx = Object.entries(this.details)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(', ');
      parts.push(`Details: ${ctx}`);
    }
    if (this.suggestion) {
      parts.push(`Suggestion: ${this.suggestion}`);
    }
    return parts.join('\n  ');
  }
}

// =============================================================================
// Query Errors
// =============================================================================

/**
 * Error thrown when a query operation fails
 *
 * Examples:
 * - Invalid query syntax
 * - Query execution failure
 * - Table not found
 * - Unsupported query operation
 *
 * @example
 * ```typescript
 * throw new QueryError('Invalid filter operator: unknown');
 * throw new QueryError('Table not found: users', ErrorCode.TABLE_NOT_FOUND, { table: 'users' });
 * throw QueryError.tableNotFound('users');
 * ```
 */
export class QueryError extends EvoDBError {
  /**
   * Create a new QueryError
   *
   * @param message - Human-readable error message
   * @param code - Error code (default: ErrorCode.QUERY_ERROR)
   * @param details - Optional structured details for debugging
   * @param suggestion - Optional helpful suggestion
   */
  constructor(
    message: string,
    code: string = ErrorCode.QUERY_ERROR,
    details?: Record<string, unknown>,
    suggestion?: string
  ) {
    super(message, code, details, suggestion);
    this.name = 'QueryError';
    captureStackTrace(this, QueryError);
  }

  /**
   * Create a "table not found" error with helpful suggestion
   */
  static tableNotFound(table: string): QueryError {
    return new QueryError(
      `Table "${table}" not found`,
      ErrorCode.TABLE_NOT_FOUND,
      { operation: 'query', target: table },
      `Ensure the table "${table}" exists. Use db.tables() to list available tables.`
    );
  }

  /**
   * Create a "syntax error" with context about the invalid part
   */
  static syntaxError(message: string, context?: { query?: string; position?: number }): QueryError {
    return new QueryError(
      `Query syntax error: ${message}`,
      ErrorCode.QUERY_SYNTAX_ERROR,
      { operation: 'parse', ...context }
    );
  }

  /**
   * Create an "invalid filter" error
   */
  static invalidFilter(operator: string, details?: Record<string, unknown>): QueryError {
    return new QueryError(
      `Invalid filter operator: "${operator}"`,
      ErrorCode.INVALID_FILTER,
      { operation: 'filter', ...details },
      `Valid operators: eq, ne, gt, gte, lt, lte, in, notIn, like, contains, startsWith, endsWith`
    );
  }
}

// =============================================================================
// Timeout Errors
// =============================================================================

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
 * throw new TimeoutError('Connection timed out', ErrorCode.CONNECTION_TIMEOUT);
 * throw TimeoutError.queryTimeout(30000, { table: 'users' });
 * ```
 */
export class TimeoutError extends EvoDBError {
  /**
   * Create a new TimeoutError
   *
   * @param message - Human-readable error message
   * @param code - Error code (default: ErrorCode.TIMEOUT_ERROR)
   * @param details - Optional structured details for debugging
   * @param suggestion - Optional helpful suggestion
   */
  constructor(
    message: string,
    code: string = ErrorCode.TIMEOUT_ERROR,
    details?: Record<string, unknown>,
    suggestion?: string
  ) {
    super(message, code, details, suggestion);
    this.name = 'TimeoutError';
    captureStackTrace(this, TimeoutError);
  }

  /**
   * Create a query timeout error
   */
  static queryTimeout(timeoutMs: number, details?: Record<string, unknown>): TimeoutError {
    return new TimeoutError(
      `Query execution timed out after ${timeoutMs}ms`,
      ErrorCode.QUERY_TIMEOUT,
      { operation: 'query', timeoutMs, ...details },
      `Consider increasing the timeout (current: ${timeoutMs}ms)`
    );
  }

  /**
   * Create a connection timeout error
   */
  static connectionTimeout(timeoutMs: number, target?: string): TimeoutError {
    return new TimeoutError(
      `Connection timed out after ${timeoutMs}ms${target ? ` to ${target}` : ''}`,
      ErrorCode.CONNECTION_TIMEOUT,
      { operation: 'connect', target, timeoutMs },
      `Consider increasing the timeout (current: ${timeoutMs}ms)`
    );
  }

  /**
   * Create an operation timeout error
   */
  static operationTimeout(operation: string, timeoutMs: number, details?: Record<string, unknown>): TimeoutError {
    return new TimeoutError(
      `Operation "${operation}" timed out after ${timeoutMs}ms`,
      ErrorCode.OPERATION_TIMEOUT,
      { operation, timeoutMs, ...details },
      `Consider increasing the timeout (current: ${timeoutMs}ms)`
    );
  }
}

// =============================================================================
// Validation Errors
// =============================================================================

/**
 * Error thrown when data validation fails
 *
 * Examples:
 * - Required field missing
 * - Type mismatch
 * - Schema constraint violation
 * - Format validation failure (email, URL, etc.)
 * - Encoding validation errors (invalid column type, null in non-nullable)
 *
 * @example
 * ```typescript
 * throw new ValidationError("Required field 'email' is missing");
 * throw new ValidationError('Schema mismatch: expected number, got string', ErrorCode.TYPE_MISMATCH);
 * throw ValidationError.typeMismatch('user.age', 'number', 'string');
 * ```
 */
export class ValidationError extends EvoDBError {
  /**
   * Create a new ValidationError
   *
   * @param message - Human-readable error message
   * @param code - Error code (default: ErrorCode.VALIDATION_ERROR)
   * @param details - Optional structured details for debugging
   * @param suggestion - Optional helpful suggestion
   */
  constructor(
    message: string,
    code: string = ErrorCode.VALIDATION_ERROR,
    details?: Record<string, unknown>,
    suggestion?: string
  ) {
    super(message, code, details, suggestion);
    this.name = 'ValidationError';
    captureStackTrace(this, ValidationError);
  }

  /**
   * Create a type mismatch error
   */
  static typeMismatch(
    path: string,
    expectedType: string,
    actualType: string,
    actualValue?: unknown
  ): ValidationError {
    return new ValidationError(
      `Type mismatch at "${path}": expected ${expectedType}, got ${actualType}`,
      ErrorCode.TYPE_MISMATCH,
      { path, expectedType, actualType, actualValue },
      `Ensure the value at "${path}" is of type ${expectedType}`
    );
  }

  /**
   * Create a required field missing error
   */
  static requiredFieldMissing(field: string, details?: Record<string, unknown>): ValidationError {
    return new ValidationError(
      `Required field "${field}" is missing`,
      ErrorCode.REQUIRED_FIELD_MISSING,
      { field, ...details },
      `Provide a value for the required field "${field}"`
    );
  }

  /**
   * Create an invalid format error
   */
  static invalidFormat(field: string, expectedFormat: string, actualValue?: string): ValidationError {
    return new ValidationError(
      `Invalid format for "${field}": expected ${expectedFormat}`,
      ErrorCode.INVALID_FORMAT,
      { field, expectedFormat, actualValue },
      `Provide a value in ${expectedFormat} format`
    );
  }

  /**
   * Create a null not allowed error
   */
  static nullNotAllowed(path: string, details?: Record<string, unknown>): ValidationError {
    return new ValidationError(
      `Null value not allowed at "${path}"`,
      ErrorCode.NULL_NOT_ALLOWED,
      { path, ...details },
      `Provide a non-null value for "${path}"`
    );
  }
}

// =============================================================================
// Storage Errors
// =============================================================================

/**
 * Error codes for storage operations.
 * @deprecated Use ErrorCode enum instead for consistency
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
 * @deprecated Use isErrorCode instead
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
 * - Block corruption (invalid magic, checksum mismatch, etc.)
 *
 * @example
 * ```typescript
 * throw new StorageError('Failed to write block to R2');
 * throw new StorageError('Storage quota exceeded', ErrorCode.QUOTA_EXCEEDED);
 * throw StorageError.notFound('partitions/2024/01/data.parquet');
 * ```
 */
export class StorageError extends EvoDBError {
  /**
   * Create a new StorageError
   *
   * @param message - Human-readable error message
   * @param code - Error code (default: ErrorCode.STORAGE_ERROR)
   * @param details - Optional structured details for debugging
   * @param suggestion - Optional helpful suggestion
   */
  constructor(
    message: string,
    code: string | StorageErrorCode = ErrorCode.STORAGE_ERROR,
    details?: Record<string, unknown>,
    suggestion?: string
  ) {
    super(message, code, details, suggestion);
    this.name = 'StorageError';
    captureStackTrace(this, StorageError);
  }

  /**
   * Create a "not found" error
   */
  static notFound(path: string, details?: Record<string, unknown>): StorageError {
    return new StorageError(
      `Storage object not found: ${path}`,
      ErrorCode.NOT_FOUND,
      { operation: 'read', target: path, ...details },
      'Verify the path exists and check for typos'
    );
  }

  /**
   * Create a "permission denied" error
   */
  static permissionDenied(path: string, operation: string, details?: Record<string, unknown>): StorageError {
    return new StorageError(
      `Permission denied: cannot ${operation} "${path}"`,
      ErrorCode.PERMISSION_DENIED,
      { operation, target: path, ...details },
      'Check bucket permissions and IAM policies'
    );
  }

  /**
   * Create a "quota exceeded" error
   */
  static quotaExceeded(details?: Record<string, unknown>): StorageError {
    return new StorageError(
      'Storage quota exceeded',
      ErrorCode.QUOTA_EXCEEDED,
      details,
      'Delete unused data or increase storage quota'
    );
  }

  /**
   * Create a "concurrent modification" error
   */
  static concurrentModification(path: string, details?: Record<string, unknown>): StorageError {
    return new StorageError(
      `Concurrent modification conflict: ${path}`,
      ErrorCode.CONCURRENT_MODIFICATION,
      { operation: 'write', target: path, ...details },
      'Retry the operation with the latest version'
    );
  }
}

// =============================================================================
// Network Errors
// =============================================================================

/**
 * Error thrown when a network operation fails
 *
 * Examples:
 * - WebSocket connection errors
 * - RPC call failures
 * - Connection refused/closed
 * - Retry exhaustion
 *
 * @example
 * ```typescript
 * throw new NetworkError('WebSocket connection failed');
 * throw new NetworkError('RPC call failed', ErrorCode.RPC_ERROR, { method: 'flush' });
 * throw NetworkError.websocketError('Connection closed unexpectedly', { sourceDoId: 'child-1' });
 * ```
 */
export class NetworkError extends EvoDBError {
  /**
   * Create a new NetworkError
   *
   * @param message - Human-readable error message
   * @param code - Error code (default: ErrorCode.NETWORK_ERROR)
   * @param details - Optional structured details for debugging
   * @param suggestion - Optional helpful suggestion
   */
  constructor(
    message: string,
    code: string = ErrorCode.NETWORK_ERROR,
    details?: Record<string, unknown>,
    suggestion?: string
  ) {
    super(message, code, details, suggestion);
    this.name = 'NetworkError';
    captureStackTrace(this, NetworkError);
  }

  /**
   * Create a WebSocket error
   */
  static websocketError(message: string, details?: Record<string, unknown>): NetworkError {
    return new NetworkError(
      `WebSocket error: ${message}`,
      ErrorCode.WEBSOCKET_ERROR,
      { operation: 'websocket', ...details },
      'Check network connectivity and WebSocket endpoint availability'
    );
  }

  /**
   * Create an RPC error
   */
  static rpcError(method: string, message: string, details?: Record<string, unknown>): NetworkError {
    return new NetworkError(
      `RPC call failed (${method}): ${message}`,
      ErrorCode.RPC_ERROR,
      { operation: 'rpc', method, ...details },
      'Retry the operation or check server health'
    );
  }

  /**
   * Create a connection closed error
   */
  static connectionClosed(target?: string, reason?: string): NetworkError {
    return new NetworkError(
      `Connection closed${target ? ` to ${target}` : ''}${reason ? `: ${reason}` : ''}`,
      ErrorCode.CONNECTION_CLOSED,
      { operation: 'connect', target, reason },
      'Reconnect to the server'
    );
  }

  /**
   * Create a connection refused error
   */
  static connectionRefused(target: string, details?: Record<string, unknown>): NetworkError {
    return new NetworkError(
      `Connection refused to ${target}`,
      ErrorCode.CONNECTION_REFUSED,
      { operation: 'connect', target, ...details },
      'Check if the server is running and accessible'
    );
  }

  /**
   * Create a retry exhausted error
   */
  static retryExhausted(operation: string, attempts: number, lastError?: Error): NetworkError {
    return new NetworkError(
      `Operation "${operation}" failed after ${attempts} attempts${lastError ? `: ${lastError.message}` : ''}`,
      ErrorCode.RETRY_EXHAUSTED,
      { operation, retryCount: attempts, lastError: lastError?.message },
      'Check network connectivity and server health'
    );
  }
}

// =============================================================================
// Encoding Validation Errors
// =============================================================================

/**
 * Details about encoding validation failure for debugging and logging
 */
export interface EncodingValidationDetails {
  /** Column path where the error occurred */
  path?: string;
  /** Index in the values array where the error was found */
  index?: number;
  /** Expected type name (e.g., 'Int32', 'String') */
  expectedType?: string;
  /** Actual type found (e.g., 'string', 'number') */
  actualType?: string;
  /** The actual value that caused the error (truncated for logging) */
  actualValue?: unknown;
  /** Maximum allowed value (for bounds checking) */
  maxAllowed?: number;
  /** Requested count of elements */
  requestedCount?: number;
  /** Required bytes for operation */
  requiredBytes?: number;
  /** Available bytes in buffer */
  availableBytes?: number;
  /** Bytes per element in buffer */
  bytesPerElement?: number;
  /** Minimum expected bytes */
  expectedMinBytes?: number;
  /** Actual bytes received */
  actualBytes?: number;
  /** Encoding type (e.g., 'Dict', 'RLE') */
  encoding?: string;
}

/**
 * Error thrown when encoding validation fails
 *
 * This is a specialized ValidationError for encoding-specific issues.
 *
 * Examples:
 * - Invalid column type enum value
 * - Null value in non-nullable column
 * - Type mismatch (e.g., string in Int32 column)
 * - Array column with non-array value
 *
 * @example
 * ```typescript
 * throw new EncodingValidationError(
 *   'Type mismatch at index 2: expected Int32, got string',
 *   ErrorCode.TYPE_MISMATCH,
 *   { path: 'user.age', index: 2, expectedType: 'Int32', actualType: 'string' }
 * );
 * throw EncodingValidationError.typeMismatch('user.age', 2, 'Int32', 'string');
 * ```
 */
export class EncodingValidationError extends ValidationError {
  /**
   * Create a new EncodingValidationError
   *
   * @param message - Human-readable error message describing the validation failure
   * @param code - Error code (default: ErrorCode.ENCODING_VALIDATION_ERROR)
   * @param details - Additional details about the validation failure
   */
  constructor(
    message: string,
    code: string = ErrorCode.ENCODING_VALIDATION_ERROR,
    details?: EncodingValidationDetails
  ) {
    super(message, code, details as Record<string, unknown>);
    this.name = 'EncodingValidationError';
    captureStackTrace(this, EncodingValidationError);
  }

  /**
   * Create a type mismatch error at a specific index
   */
  static typeMismatchAtIndex(
    path: string,
    index: number,
    expectedType: string,
    actualType: string,
    actualValue?: unknown
  ): EncodingValidationError {
    return new EncodingValidationError(
      `Type mismatch at index ${index} in "${path}": expected ${expectedType}, got ${actualType}`,
      ErrorCode.TYPE_MISMATCH,
      { path, index, expectedType, actualType, actualValue }
    );
  }

  /**
   * Create a null not allowed error at a specific index
   */
  static nullAtIndex(path: string, index: number): EncodingValidationError {
    return new EncodingValidationError(
      `Null value at index ${index} in non-nullable column "${path}"`,
      ErrorCode.NULL_NOT_ALLOWED,
      { path, index }
    );
  }
}

// =============================================================================
// Corrupted Block Errors
// =============================================================================

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
  /** Block path or identifier */
  blockPath?: string;
}

/**
 * Error thrown when block data is corrupted
 *
 * This is a specialized StorageError for block-level corruption issues.
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
 * throw new CorruptedBlockError('Invalid magic number', ErrorCode.INVALID_MAGIC, {
 *   expected: 0x434A4C42,
 *   actual: 0x00000000,
 *   blockPath: 'partitions/2024/01/data.cjlb',
 * });
 * throw CorruptedBlockError.invalidMagic(0x434A4C42, 0x00000000, 'data.cjlb');
 * ```
 */
export class CorruptedBlockError extends StorageError {
  /**
   * Create a new CorruptedBlockError
   *
   * @param message - Human-readable error message describing the corruption
   * @param code - Error code (default: ErrorCode.CORRUPTED_BLOCK)
   * @param details - Additional details about the corruption
   */
  constructor(
    message: string,
    code: string = ErrorCode.CORRUPTED_BLOCK,
    details?: CorruptedBlockDetails
  ) {
    super(
      message,
      code,
      details as Record<string, unknown>,
      'The block data may be corrupted. Try re-fetching or check for data integrity issues.'
    );
    this.name = 'CorruptedBlockError';
    captureStackTrace(this, CorruptedBlockError);
  }

  /**
   * Create an invalid magic number error
   */
  static invalidMagic(expected: number, actual: number, blockPath?: string): CorruptedBlockError {
    return new CorruptedBlockError(
      `Invalid magic number: expected 0x${expected.toString(16).toUpperCase()}, got 0x${actual.toString(16).toUpperCase()}`,
      ErrorCode.INVALID_MAGIC,
      { expected, actual, offset: 0, blockPath }
    );
  }

  /**
   * Create a checksum mismatch error
   */
  static checksumMismatch(expected: number, actual: number, blockPath?: string): CorruptedBlockError {
    return new CorruptedBlockError(
      `Checksum mismatch: expected ${expected}, got ${actual}`,
      ErrorCode.CHECKSUM_MISMATCH,
      { expected, actual, blockPath }
    );
  }

  /**
   * Create a truncated data error
   */
  static truncatedData(actualSize: number, minExpectedSize: number, blockPath?: string): CorruptedBlockError {
    return new CorruptedBlockError(
      `Truncated data: got ${actualSize} bytes, expected at least ${minExpectedSize} bytes`,
      ErrorCode.TRUNCATED_DATA,
      { actualSize, minExpectedSize, blockPath }
    );
  }

  /**
   * Create an unsupported version error
   */
  static unsupportedVersion(version: number, supportedVersions: number[], blockPath?: string): CorruptedBlockError {
    return new CorruptedBlockError(
      `Unsupported block version: ${version}. Supported versions: ${supportedVersions.join(', ')}`,
      ErrorCode.UNSUPPORTED_VERSION,
      { version, supportedVersions, blockPath }
    );
  }
}

// =============================================================================
// Error Factory Utilities
// =============================================================================

/**
 * Wrap an unknown error as an EvoDBError.
 * Useful for converting caught errors to a consistent type.
 *
 * @param error - The error to wrap
 * @param operation - The operation that failed (for context)
 * @returns An EvoDBError (the original if already EvoDBError, otherwise wrapped)
 */
export function wrapError(error: unknown, operation?: string): EvoDBError {
  if (error instanceof EvoDBError) {
    return error;
  }

  if (error instanceof Error) {
    return new EvoDBError(
      error.message,
      ErrorCode.INTERNAL_ERROR,
      { operation, originalError: error.name }
    );
  }

  return new EvoDBError(
    String(error),
    ErrorCode.INTERNAL_ERROR,
    { operation }
  );
}

/**
 * Check if an error is an EvoDBError with a specific code.
 *
 * @param error - The error to check
 * @param code - The error code to match
 * @returns true if the error is an EvoDBError with the specified code
 */
export function hasErrorCode(error: unknown, code: ErrorCode | string): boolean {
  return error instanceof EvoDBError && error.code === code;
}

/**
 * Check if an error is retryable (network errors, timeouts, etc.)
 *
 * @param error - The error to check
 * @returns true if the error is typically retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof EvoDBError)) {
    return false;
  }

  const retryableCodes: string[] = [
    ErrorCode.TIMEOUT_ERROR,
    ErrorCode.QUERY_TIMEOUT,
    ErrorCode.CONNECTION_TIMEOUT,
    ErrorCode.OPERATION_TIMEOUT,
    ErrorCode.NETWORK_ERROR,
    ErrorCode.WEBSOCKET_ERROR,
    ErrorCode.RPC_ERROR,
    ErrorCode.CONNECTION_CLOSED,
    ErrorCode.CONCURRENT_MODIFICATION,
  ];

  return retryableCodes.includes(error.code);
}
