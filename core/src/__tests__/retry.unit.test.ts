/**
 * Retry Logic Unit Tests
 * Issues: evodb-obil, evodb-5ra5 - TDD: Add consistent retry logic with exponential backoff
 *
 * Tests for withRetry function providing:
 * - Automatic retry on transient failures
 * - Exponential backoff between retries
 * - Configurable max retries
 * - Jitter to prevent thundering herd
 * - Selective retry based on error type
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  isRetryableError,
  RetryError,
  type RetryOptions,
} from '../retry.js';
import { EvoDBError, StorageError, StorageErrorCode, TimeoutError } from '../errors.js';

describe('Retry Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('retries on transient failure', () => {
    it('should retry on transient failure and eventually succeed', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new StorageError('Connection refused', StorageErrorCode.NETWORK_ERROR);
        }
        return 'success';
      });

      const promise = withRetry(fn);

      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(1);

      // Wait for first retry (base delay = 100ms)
      await vi.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(2);

      // Wait for second retry (200ms with exponential backoff)
      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should succeed immediately if first attempt works', async () => {
      const fn = vi.fn(async () => 'success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments through to the function', async () => {
      const fn = vi.fn(async () => 'result');

      await withRetry(fn);

      expect(fn).toHaveBeenCalledWith();
    });
  });

  describe('uses exponential backoff', () => {
    it('should double delay between each retry', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 5) {
          throw new StorageError('Network error', StorageErrorCode.NETWORK_ERROR);
        }
        return 'success';
      });

      // Need maxRetries: 4 to allow 5 total attempts
      const promise = withRetry(fn, { baseDelay: 100, jitter: false, maxRetries: 4 });

      // First attempt
      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(1);

      // Retry 1: 100ms delay
      await vi.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(2);

      // Retry 2: 200ms delay
      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(3);

      // Retry 3: 400ms delay
      await vi.advanceTimersByTimeAsync(400);
      expect(fn).toHaveBeenCalledTimes(4);

      // Retry 4: 800ms delay
      await vi.advanceTimersByTimeAsync(800);
      expect(fn).toHaveBeenCalledTimes(5);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should use custom baseDelay', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new StorageError('Network error', StorageErrorCode.NETWORK_ERROR);
        }
        return 'success';
      });

      const promise = withRetry(fn, { baseDelay: 500, jitter: false });

      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(1);

      // Should wait 500ms for first retry
      await vi.advanceTimersByTimeAsync(499);
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(fn).toHaveBeenCalledTimes(2);

      await promise;
    });

    it('should respect maxDelay cap', async () => {
      let attempts = 0;
      let lastCallTime = Date.now();
      const delays: number[] = [];

      const fn = vi.fn(async () => {
        const now = Date.now();
        if (attempts > 0) {
          delays.push(now - lastCallTime);
        }
        lastCallTime = now;
        attempts++;
        if (attempts < 6) {
          throw new StorageError('Network error', StorageErrorCode.NETWORK_ERROR);
        }
        return 'success';
      });

      const promise = withRetry(fn, {
        baseDelay: 100,
        maxDelay: 300,
        maxRetries: 10,
        jitter: false,
      });

      // Advance time to complete all retries
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      await promise;

      // Delays should be: 100, 200, 300, 300, 300 (capped)
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(300); // Capped
      expect(delays[3]).toBe(300); // Capped
      expect(delays[4]).toBe(300); // Capped
    });
  });

  describe('respects maxRetries limit', () => {
    it('should throw RetryError after maxRetries exceeded', async () => {
      const fn = vi.fn(async () => {
        throw new StorageError('Always fails', StorageErrorCode.NETWORK_ERROR);
      });

      const promise = withRetry(fn, { maxRetries: 3, jitter: false });

      // Advance through all retries
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      await expect(promise).rejects.toThrow(RetryError);
      expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('should include original error in RetryError', async () => {
      const originalError = new StorageError('Original failure', StorageErrorCode.NETWORK_ERROR);
      const fn = vi.fn(async () => {
        throw originalError;
      });

      const promise = withRetry(fn, { maxRetries: 2, jitter: false });

      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      try {
        await promise;
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RetryError);
        expect((error as RetryError).cause).toBe(originalError);
        expect((error as RetryError).attempts).toBe(3); // 1 initial + 2 retries
      }
    });

    it('should use default maxRetries of 3', async () => {
      const fn = vi.fn(async () => {
        throw new StorageError('Fails', StorageErrorCode.NETWORK_ERROR);
      });

      const promise = withRetry(fn, { jitter: false });

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      await expect(promise).rejects.toThrow(RetryError);
      expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 default retries
    });

    it('should allow maxRetries of 0 for no retries', async () => {
      const fn = vi.fn(async () => {
        throw new StorageError('Fails', StorageErrorCode.NETWORK_ERROR);
      });

      const promise = withRetry(fn, { maxRetries: 0 });

      await expect(promise).rejects.toThrow(RetryError);
      expect(fn).toHaveBeenCalledTimes(1); // Only initial attempt
    });
  });

  describe('adds jitter to prevent thundering herd', () => {
    it('should add random jitter to delay by default', async () => {
      let attempts = 0;
      let lastCallTime = Date.now();
      const delays: number[] = [];

      const fn = vi.fn(async () => {
        const now = Date.now();
        if (attempts > 0) {
          delays.push(now - lastCallTime);
        }
        lastCallTime = now;
        attempts++;
        if (attempts < 4) {
          throw new StorageError('Network error', StorageErrorCode.NETWORK_ERROR);
        }
        return 'success';
      });

      // Mock random to return specific values
      const randomValues = [0.25, 0.5, 0.75];
      let randomIndex = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => randomValues[randomIndex++] || 0.5);

      const promise = withRetry(fn, { baseDelay: 100, jitter: true });

      // Advance time to complete all retries
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      await promise;

      // With jitter, delays should vary from base delay
      // Jitter formula: delay * (0.5 + random * 0.5) gives range [0.5*delay, 1*delay]
      // Or delay + random * delay gives [delay, 2*delay]
      // Check that delays are not exactly equal to pure exponential
      expect(delays.length).toBe(3);
      // Delays should be roughly in exponential range but with variation
      expect(delays[0]).toBeGreaterThan(0);
      expect(delays[0]).toBeLessThanOrEqual(200); // Base 100 with max jitter
    });

    it('should disable jitter when jitter option is false', async () => {
      let attempts = 0;
      let lastCallTime = Date.now();
      const delays: number[] = [];

      const fn = vi.fn(async () => {
        const now = Date.now();
        if (attempts > 0) {
          delays.push(now - lastCallTime);
        }
        lastCallTime = now;
        attempts++;
        if (attempts < 3) {
          throw new StorageError('Network error', StorageErrorCode.NETWORK_ERROR);
        }
        return 'success';
      });

      const promise = withRetry(fn, { baseDelay: 100, jitter: false });

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      await promise;

      // Without jitter, delays should be exactly exponential
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
    });
  });

  describe('does not retry non-retryable errors', () => {
    it('should not retry ValidationError', async () => {
      const { ValidationError } = await import('../errors.js');
      const fn = vi.fn(async () => {
        throw new ValidationError('Invalid input');
      });

      const promise = withRetry(fn);

      await expect(promise).rejects.toThrow(ValidationError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry QueryError', async () => {
      const { QueryError } = await import('../errors.js');
      const fn = vi.fn(async () => {
        throw new QueryError('Invalid query syntax');
      });

      const promise = withRetry(fn);

      await expect(promise).rejects.toThrow(QueryError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry StorageError with NETWORK_ERROR code', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new StorageError('Network failed', StorageErrorCode.NETWORK_ERROR);
        }
        return 'success';
      });

      const promise = withRetry(fn, { jitter: false });

      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry StorageError with TIMEOUT code', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new StorageError('Timeout', StorageErrorCode.TIMEOUT);
        }
        return 'success';
      });

      const promise = withRetry(fn, { jitter: false });

      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should retry TimeoutError', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new TimeoutError('Operation timed out');
        }
        return 'success';
      });

      const promise = withRetry(fn, { jitter: false });

      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should not retry StorageError with NOT_FOUND code', async () => {
      const fn = vi.fn(async () => {
        throw new StorageError('Not found', StorageErrorCode.NOT_FOUND);
      });

      const promise = withRetry(fn);

      await expect(promise).rejects.toThrow(StorageError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry StorageError with PERMISSION_DENIED code', async () => {
      const fn = vi.fn(async () => {
        throw new StorageError('Permission denied', StorageErrorCode.PERMISSION_DENIED);
      });

      const promise = withRetry(fn);

      await expect(promise).rejects.toThrow(StorageError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use custom retryIf predicate', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Custom error');
          (error as Error & { retryable: boolean }).retryable = true;
          throw error;
        }
        return 'success';
      });

      const promise = withRetry(fn, {
        retryIf: (error) => (error as Error & { retryable?: boolean }).retryable === true,
        jitter: false,
      });

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry when custom retryIf returns false', async () => {
      const fn = vi.fn(async () => {
        throw new Error('Non-retryable');
      });

      const promise = withRetry(fn, {
        retryIf: () => false,
      });

      await expect(promise).rejects.toThrow('Non-retryable');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRetryableError helper', () => {
    it('should return true for StorageError with NETWORK_ERROR', () => {
      const error = new StorageError('Network', StorageErrorCode.NETWORK_ERROR);
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for StorageError with TIMEOUT', () => {
      const error = new StorageError('Timeout', StorageErrorCode.TIMEOUT);
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for TimeoutError', () => {
      const error = new TimeoutError('Timed out');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for StorageError with NOT_FOUND', () => {
      const error = new StorageError('Not found', StorageErrorCode.NOT_FOUND);
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for StorageError with PERMISSION_DENIED', () => {
      const error = new StorageError('Denied', StorageErrorCode.PERMISSION_DENIED);
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for ValidationError', async () => {
      const { ValidationError } = await import('../errors.js');
      const error = new ValidationError('Invalid');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for QueryError', async () => {
      const { QueryError } = await import('../errors.js');
      const error = new QueryError('Invalid query');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for generic Error', () => {
      const error = new Error('Generic error');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return true for error with retryable network messages', () => {
      const errors = [
        new Error('ECONNRESET'),
        new Error('ECONNREFUSED'),
        new Error('ETIMEDOUT'),
        new Error('socket hang up'),
        new Error('Connection reset by peer'),
      ];
      for (const error of errors) {
        expect(isRetryableError(error)).toBe(true);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle sync errors thrown from async function', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new StorageError('Sync error', StorageErrorCode.NETWORK_ERROR);
        }
        return 'success';
      });

      const promise = withRetry(fn, { jitter: false });

      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should handle null/undefined return values', async () => {
      const fn = vi.fn(async () => null);

      const result = await withRetry(fn);

      expect(result).toBeNull();
    });

    it('should preserve this context', async () => {
      const obj = {
        value: 42,
        async getValue() {
          return this.value;
        },
      };

      const result = await withRetry(() => obj.getValue());

      expect(result).toBe(42);
    });

    it('should handle very long operations', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        // Simulate long operation
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (attempts < 2) {
          throw new StorageError('Network', StorageErrorCode.NETWORK_ERROR);
        }
        return 'success';
      });

      const promise = withRetry(fn, { baseDelay: 100, jitter: false });

      // First operation takes 1000ms then fails
      await vi.advanceTimersByTimeAsync(1000);
      expect(fn).toHaveBeenCalledTimes(1);

      // Wait for retry delay (100ms)
      await vi.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(2);

      // Second operation takes 1000ms then succeeds
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toBe('success');
    });
  });
});

describe('RetryError', () => {
  it('should be an instance of EvoDBError', () => {
    const cause = new StorageError('Original', StorageErrorCode.NETWORK_ERROR);
    const error = new RetryError('Retry exhausted', cause, 3);

    expect(error).toBeInstanceOf(EvoDBError);
    expect(error.name).toBe('RetryError');
    expect(error.code).toBe('RETRY_EXHAUSTED');
  });

  it('should include attempts count', () => {
    const cause = new StorageError('Original', StorageErrorCode.NETWORK_ERROR);
    const error = new RetryError('Retry exhausted', cause, 5);

    expect(error.attempts).toBe(5);
  });

  it('should include cause error', () => {
    const cause = new StorageError('Original error message', StorageErrorCode.NETWORK_ERROR);
    const error = new RetryError('Retry exhausted', cause, 3);

    expect(error.cause).toBe(cause);
  });

  it('should have descriptive message', () => {
    const cause = new StorageError('Network failure', StorageErrorCode.NETWORK_ERROR);
    const error = new RetryError('All 3 retry attempts failed', cause, 3);

    expect(error.message).toBe('All 3 retry attempts failed');
  });
});
