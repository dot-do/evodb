/**
 * @evodb/core/errors - Error classes
 *
 * This submodule exports typed exception classes for consistent
 * error handling across the codebase.
 *
 * All EvoDB packages use a consistent error hierarchy:
 * - EvoDBError: Base error class for all EvoDB errors
 *   - QueryError: Query-related issues
 *   - ValidationError: Input/schema validation failures
 *   - TimeoutError: Operation timeouts
 *   - StorageError: Storage operation failures
 *   - NetworkError: Network-related failures
 *
 * Use error codes for programmatic error handling:
 * @example
 * ```typescript
 * import { EvoDBError, ErrorCode } from '@evodb/core/errors';
 *
 * try {
 *   await db.query('users');
 * } catch (error) {
 *   if (error instanceof EvoDBError) {
 *     switch (error.code) {
 *       case ErrorCode.TABLE_NOT_FOUND:
 *         // Handle missing table
 *         break;
 *       case ErrorCode.QUERY_TIMEOUT:
 *         // Handle timeout
 *         break;
 *       default:
 *         // Handle other errors
 *     }
 *   }
 * }
 * ```
 *
 * @module errors
 */

export {
  // Error codes
  ErrorCode,
  isErrorCode,

  // Base error
  EvoDBError,

  // Core error types (from errors.ts)
  QueryError,
  TimeoutError,
  ValidationError,
  StorageError,
  NetworkError,
  EncodingValidationError,
  CorruptedBlockError,

  // Legacy storage error codes (deprecated - use ErrorCode instead)
  StorageErrorCode,
  isStorageErrorCode,

  // Types
  type CorruptedBlockDetails,
  type EncodingValidationDetails,

  // Utility functions
  wrapError,
  hasErrorCode,
  isRetryableError,
} from '../errors.js';

// Stack trace utilities
export { captureStackTrace } from '../stack-trace.js';

// Streaming errors
export { StreamingCancelledError, BackpressureTimeoutError } from '../streaming.js';

// Validation errors (JSON parsing)
export { JSONParseError, JSONValidationError } from '../validation.js';
