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
  CorruptedBlockError,
  type CorruptedBlockDetails,
} from '../errors.js';
