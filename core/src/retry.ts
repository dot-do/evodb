/**
 * Retry Logic with Exponential Backoff
 * Issues: evodb-obil, evodb-5ra5 - Consistent retry logic with exponential backoff
 *
 * Provides automatic retry functionality for transient failures with:
 * - Exponential backoff to reduce load on failing services
 * - Configurable max retries and delays
 * - Jitter to prevent thundering herd problem
 * - Selective retry based on error type
 *
 * @example
 * ```typescript
 * import { withRetry, isRetryableError } from '@evodb/core';
 *
 * // Basic usage - retries on transient errors with defaults
 * const result = await withRetry(() => fetchFromR2(key));
 *
 * // Custom options
 * const result = await withRetry(
 *   () => riskyOperation(),
 *   {
 *     maxRetries: 5,
 *     baseDelay: 200,
 *     maxDelay: 5000,
 *     jitter: true,
 *     retryIf: (error) => error.code === 'NETWORK_ERROR',
 *   }
 * );
 * ```
 *
 * @module retry
 */

import { EvoDBError, StorageError, StorageErrorCode, TimeoutError, ValidationError, QueryError } from './errors.js';
import { captureStackTrace } from './stack-trace.js';

/**
 * Configuration options for retry behavior
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts after initial failure.
   * Set to 0 for no retries (only initial attempt).
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds between retries.
   * Actual delay doubles with each retry (exponential backoff).
   * @default 100
   */
  baseDelay?: number;

  /**
   * Maximum delay in milliseconds between retries.
   * Caps the exponential growth to prevent very long waits.
   * @default 10000 (10 seconds)
   */
  maxDelay?: number;

  /**
   * Whether to add random jitter to delays.
   * Jitter helps prevent thundering herd when many clients retry simultaneously.
   * When enabled, actual delay is: delay * (0.5 + Math.random() * 0.5)
   * @default true
   */
  jitter?: boolean;

  /**
   * Custom predicate to determine if an error should trigger a retry.
   * When provided, overrides the default isRetryableError logic.
   * Return true to retry, false to fail immediately.
   *
   * @example
   * ```typescript
   * retryIf: (error) => error instanceof NetworkError
   * ```
   */
  retryIf?: (error: Error) => boolean;
}

/**
 * Error thrown when all retry attempts have been exhausted
 *
 * Contains the original error that caused the final failure and
 * the total number of attempts made.
 *
 * @example
 * ```typescript
 * try {
 *   await withRetry(riskyOperation, { maxRetries: 3 });
 * } catch (error) {
 *   if (error instanceof RetryError) {
 *     console.log(`Failed after ${error.attempts} attempts`);
 *     console.log(`Original error: ${error.cause.message}`);
 *   }
 * }
 * ```
 */
export class RetryError extends EvoDBError {
  /**
   * The original error that caused the final failure
   */
  public readonly cause: Error;

  /**
   * Total number of attempts made (initial + retries)
   */
  public readonly attempts: number;

  /**
   * Create a new RetryError
   *
   * @param message - Human-readable error message
   * @param cause - The original error that caused the failure
   * @param attempts - Total number of attempts made
   */
  constructor(message: string, cause: Error, attempts: number) {
    super(message, 'RETRY_EXHAUSTED', { attempts, originalError: cause.message });
    this.name = 'RetryError';
    this.cause = cause;
    this.attempts = attempts;
    captureStackTrace(this, RetryError);
  }
}

/**
 * Network error message patterns that indicate transient failures
 */
const RETRYABLE_ERROR_PATTERNS = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
  'socket hang up',
  'Connection reset',
  'connection refused',
  'network timeout',
];

/**
 * Storage error codes that indicate transient failures
 */
const RETRYABLE_STORAGE_CODES = new Set<string>([
  StorageErrorCode.NETWORK_ERROR,
  StorageErrorCode.TIMEOUT,
]);

/**
 * Determines if an error should be retried based on its type and content.
 *
 * Errors that ARE retryable (transient failures):
 * - StorageError with NETWORK_ERROR or TIMEOUT codes
 * - TimeoutError
 * - Generic errors with network-related messages (ECONNRESET, etc.)
 *
 * Errors that are NOT retryable (permanent failures):
 * - ValidationError (input validation failure)
 * - QueryError (invalid query syntax)
 * - StorageError with NOT_FOUND, PERMISSION_DENIED, CORRUPTED_DATA codes
 * - Any error without clear transient indicators
 *
 * @param error - The error to evaluate
 * @returns true if the error indicates a transient failure that may succeed on retry
 *
 * @example
 * ```typescript
 * try {
 *   await storage.read(key);
 * } catch (error) {
 *   if (isRetryableError(error)) {
 *     // Safe to retry - likely a temporary network issue
 *     await retry();
 *   } else {
 *     // Don't retry - permanent failure like file not found
 *     throw error;
 *   }
 * }
 * ```
 */
export function isRetryableError(error: Error): boolean {
  // ValidationError and QueryError are never retryable (bad input)
  if (error instanceof ValidationError || error instanceof QueryError) {
    return false;
  }

  // TimeoutError is always retryable
  if (error instanceof TimeoutError) {
    return true;
  }

  // StorageError - check the error code
  if (error instanceof StorageError) {
    return RETRYABLE_STORAGE_CODES.has(error.code);
  }

  // Check for network error patterns in message
  const message = error.message.toLowerCase();
  for (const pattern of RETRYABLE_ERROR_PATTERNS) {
    if (message.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'retryIf'>> = {
  maxRetries: 3,
  baseDelay: 100,
  maxDelay: 10000,
  jitter: true,
};

/**
 * Calculates the delay before the next retry attempt.
 *
 * Uses exponential backoff: delay = baseDelay * 2^attempt
 * With optional jitter: delay * (0.5 + random * 0.5)
 *
 * @param attempt - Current retry attempt number (0-indexed)
 * @param options - Retry configuration
 * @returns Delay in milliseconds
 */
function calculateDelay(
  attempt: number,
  options: Required<Omit<RetryOptions, 'retryIf'>>
): number {
  // Exponential backoff: 100, 200, 400, 800, ...
  const exponentialDelay = options.baseDelay * Math.pow(2, attempt);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay);

  // Add jitter if enabled: delay * (0.5 + random * 0.5) gives [0.5*delay, delay]
  if (options.jitter) {
    return Math.floor(cappedDelay * (0.5 + Math.random() * 0.5));
  }

  return cappedDelay;
}

/**
 * Sleeps for the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a function with automatic retry on transient failures.
 *
 * Features:
 * - Automatic retry on network errors and timeouts
 * - Exponential backoff to reduce load on failing services
 * - Jitter to prevent thundering herd
 * - Configurable retry limits and delays
 * - Custom retry predicate for fine-grained control
 *
 * @typeParam T - Return type of the function
 * @param fn - Async function to execute (will be retried on failure)
 * @param options - Retry configuration options
 * @returns Promise resolving to the function's result
 * @throws RetryError when all retry attempts are exhausted
 * @throws Original error when it's not retryable
 *
 * @example
 * ```typescript
 * // Basic usage with defaults (3 retries, 100ms base delay)
 * const data = await withRetry(() => storage.read(key));
 *
 * // Custom configuration
 * const data = await withRetry(
 *   () => externalApi.fetch(params),
 *   {
 *     maxRetries: 5,
 *     baseDelay: 500,
 *     maxDelay: 30000,
 *     jitter: true,
 *   }
 * );
 *
 * // Custom retry predicate
 * const data = await withRetry(
 *   () => customOperation(),
 *   {
 *     retryIf: (error) => error.code === 'RATE_LIMITED',
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const shouldRetry = opts.retryIf ?? isRetryableError;
  let lastError: Error | undefined;
  let attempts = 0;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    attempts++;

    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (!shouldRetry(lastError)) {
        // Not retryable - throw immediately
        throw lastError;
      }

      // Check if we have retries left
      if (attempt >= opts.maxRetries) {
        // No more retries
        break;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, opts);
      await sleep(delay);
    }
  }

  // All retries exhausted
  throw new RetryError(
    `All ${attempts} retry attempts failed: ${lastError?.message}`,
    lastError!,
    attempts
  );
}
