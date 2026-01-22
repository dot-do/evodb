/**
 * Error types for @evodb/writer
 *
 * All errors extend EvoDBError for consistent error handling across packages.
 */

import { EvoDBError, ErrorCode, captureStackTrace } from '@evodb/core';

/**
 * Base error class for writer-related errors.
 * Extends EvoDBError for consistent error hierarchy.
 *
 * @example
 * ```typescript
 * import { EvoDBError, ErrorCode } from '@evodb/core';
 *
 * try {
 *   await writer.write(data);
 * } catch (e) {
 *   if (e instanceof WriterError) {
 *     console.log(`Writer error: ${e.message}`);
 *   }
 *   // Or catch all EvoDB errors
 *   if (e instanceof EvoDBError) {
 *     console.log(`Error code: ${e.code}`);
 *   }
 * }
 * ```
 */
export class WriterError extends EvoDBError {
  constructor(
    message: string,
    code: string = ErrorCode.WRITER_ERROR,
    details?: Record<string, unknown>,
    suggestion?: string
  ) {
    super(message, code, details, suggestion);
    this.name = 'WriterError';
    captureStackTrace(this, WriterError);
  }
}

/**
 * Error thrown when the block index exceeds its configured maximum size
 * and eviction policy is set to 'none'.
 * Extends WriterError for consistent error hierarchy.
 */
export class BlockIndexLimitError extends WriterError {
  /** Current number of entries in the block index */
  readonly currentSize: number;

  /** Configured maximum size limit */
  readonly limit: number;

  constructor(currentSize: number, limit: number) {
    super(
      `Block index limit exceeded: current size ${currentSize} exceeds limit ${limit}. ` +
      `Consider increasing maxBlockIndexSize or enabling LRU eviction with blockIndexEvictionPolicy: 'lru'.`,
      ErrorCode.BLOCK_INDEX_LIMIT,
      { currentSize, limit },
      `Consider increasing maxBlockIndexSize or enabling LRU eviction with blockIndexEvictionPolicy: 'lru'.`
    );
    this.name = 'BlockIndexLimitError';
    this.currentSize = currentSize;
    this.limit = limit;
    captureStackTrace(this, BlockIndexLimitError);
  }
}
