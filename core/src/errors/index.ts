/**
 * @evodb/core/errors - Error classes
 *
 * This submodule exports typed exception classes for consistent
 * error handling across the codebase.
 *
 * @module errors
 */

export {
  EvoDBError,
  QueryError,
  TimeoutError,
  ValidationError,
  StorageError,
  StorageErrorCode,
  isStorageErrorCode,
  CorruptedBlockError,
  EncodingValidationError,
  type CorruptedBlockDetails,
  type EncodingValidationDetails,
} from '../errors.js';

// Stack trace utilities
export { captureStackTrace } from '../stack-trace.js';
