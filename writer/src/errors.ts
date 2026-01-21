/**
 * Error types for @evodb/writer
 */

/**
 * Base error class for writer-related errors
 */
export class WriterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WriterError';
  }
}

/**
 * Error thrown when the block index exceeds its configured maximum size
 * and eviction policy is set to 'none'.
 */
export class BlockIndexLimitError extends WriterError {
  /** Current number of entries in the block index */
  readonly currentSize: number;

  /** Configured maximum size limit */
  readonly limit: number;

  constructor(currentSize: number, limit: number) {
    super(
      `Block index limit exceeded: current size ${currentSize} exceeds limit ${limit}. ` +
      `Consider increasing maxBlockIndexSize or enabling LRU eviction with blockIndexEvictionPolicy: 'lru'.`
    );
    this.name = 'BlockIndexLimitError';
    this.currentSize = currentSize;
    this.limit = limit;
  }
}
