/**
 * Tests for cache error handling with proper logging and metrics
 *
 * Verifies that:
 * - Cache get() errors are logged with context
 * - Cache put() errors are logged with context
 * - Cache delete() errors are logged with context
 * - Error metrics are incremented (cache_errors counter)
 * - Errors include operation type and key in log
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  warmPartition,
  checkCacheStatus,
  invalidatePartition,
  invalidateTable,
  setFetchFunction,
  resetFetchFunction,
  clearCacheStatusMap,
} from '../prefetch.js';
import {
  getCacheErrorMetrics,
  resetCacheErrorMetrics,
  type CacheErrorLog,
} from '../prefetch.js';

describe('Cache Error Handling', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let capturedErrors: CacheErrorLog[] = [];

  beforeEach(() => {
    // Reset state
    clearCacheStatusMap();
    resetCacheErrorMetrics();
    capturedErrors = [];

    // Spy on console.error to verify logging
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      // Capture structured error logs
      if (args[0] && typeof args[0] === 'object' && 'operation' in args[0]) {
        capturedErrors.push(args[0] as CacheErrorLog);
      }
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    resetFetchFunction();
    resetCacheErrorMetrics();
  });

  describe('cache get() errors (checkCacheStatus)', () => {
    it('should log errors with context when checkCacheStatus fails', async () => {
      const testError = new Error('Network timeout');
      setFetchFunction(() => Promise.reject(testError));

      await checkCacheStatus('data/users/year=2024/data.parquet');

      // Verify error was logged with structured format
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorLog = capturedErrors.find(log => log.operation === 'get');
      expect(errorLog).toBeDefined();
      expect(errorLog?.key).toBe('data/users/year=2024/data.parquet');
      expect(errorLog?.error).toBe('Network timeout');
    });

    it('should increment cache_errors counter on get failure', async () => {
      setFetchFunction(() => Promise.reject(new Error('Connection refused')));

      await checkCacheStatus('data/orders/month=01/data.parquet');

      const metrics = getCacheErrorMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorsByOperation.get).toBe(1);
    });

    it('should include timestamp in error log', async () => {
      const before = Date.now();
      setFetchFunction(() => Promise.reject(new Error('Timeout')));

      await checkCacheStatus('data/test/key.parquet');
      const after = Date.now();

      const errorLog = capturedErrors.find(log => log.operation === 'get');
      expect(errorLog?.timestamp).toBeGreaterThanOrEqual(before);
      expect(errorLog?.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('cache put() errors (warmPartition)', () => {
    it('should log errors with context when warmPartition fails', async () => {
      const testError = new Error('Storage quota exceeded');
      setFetchFunction(() => Promise.reject(testError));

      await warmPartition('data/users/year=2024/block.parquet');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorLog = capturedErrors.find(log => log.operation === 'put');
      expect(errorLog).toBeDefined();
      expect(errorLog?.key).toBe('data/users/year=2024/block.parquet');
      expect(errorLog?.error).toBe('Storage quota exceeded');
    });

    it('should increment cache_errors counter on put failure', async () => {
      setFetchFunction(() => Promise.reject(new Error('Write failed')));

      await warmPartition('data/events/day=2024-01-01/data.parquet');

      const metrics = getCacheErrorMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorsByOperation.put).toBe(1);
    });

    it('should log error when warmPartition returns non-ok response', async () => {
      setFetchFunction(() =>
        Promise.resolve(
          new Response(null, { status: 500, statusText: 'Internal Server Error' })
        )
      );

      await warmPartition('data/users/block.parquet');

      const errorLog = capturedErrors.find(log => log.operation === 'put');
      expect(errorLog).toBeDefined();
      expect(errorLog?.key).toBe('data/users/block.parquet');
    });
  });

  describe('cache delete() errors (invalidatePartition)', () => {
    it('should log errors with context when invalidatePartition fails', async () => {
      const testError = new Error('PURGE method not allowed');
      setFetchFunction(() => Promise.reject(testError));

      await invalidatePartition('data/users/year=2024/data.parquet');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorLog = capturedErrors.find(log => log.operation === 'delete');
      expect(errorLog).toBeDefined();
      expect(errorLog?.key).toBe('data/users/year=2024/data.parquet');
      expect(errorLog?.error).toBe('PURGE method not allowed');
    });

    it('should increment cache_errors counter on delete failure', async () => {
      setFetchFunction(() => Promise.reject(new Error('Permission denied')));

      await invalidatePartition('data/orders/old-data.parquet');

      const metrics = getCacheErrorMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorsByOperation.delete).toBe(1);
    });

    it('should log error when invalidatePartition returns non-ok response', async () => {
      setFetchFunction(() =>
        Promise.resolve(new Response(null, { status: 403, statusText: 'Forbidden' }))
      );

      await invalidatePartition('data/users/block.parquet');

      const errorLog = capturedErrors.find(log => log.operation === 'delete');
      expect(errorLog).toBeDefined();
    });
  });

  describe('invalidateTable errors', () => {
    it('should log errors with context when invalidateTable fails', async () => {
      const testError = new Error('Bulk purge failed');
      setFetchFunction(() => Promise.reject(testError));

      await invalidateTable('users');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorLog = capturedErrors.find(log => log.operation === 'delete');
      expect(errorLog).toBeDefined();
      expect(errorLog?.key).toBe('table:users');
      expect(errorLog?.error).toBe('Bulk purge failed');
    });

    it('should increment cache_errors counter on table invalidation failure', async () => {
      setFetchFunction(() => Promise.reject(new Error('Service unavailable')));

      await invalidateTable('events');

      const metrics = getCacheErrorMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorsByOperation.delete).toBe(1);
    });
  });

  describe('error metrics aggregation', () => {
    it('should track total errors across all operations', async () => {
      setFetchFunction(() => Promise.reject(new Error('Error')));

      await checkCacheStatus('key1');
      await warmPartition('key2');
      await invalidatePartition('key3');

      const metrics = getCacheErrorMetrics();
      expect(metrics.totalErrors).toBe(3);
    });

    it('should track errors by operation type', async () => {
      setFetchFunction(() => Promise.reject(new Error('Error')));

      await checkCacheStatus('key1');
      await checkCacheStatus('key2');
      await warmPartition('key3');
      await invalidatePartition('key4');
      await invalidatePartition('key5');
      await invalidatePartition('key6');

      const metrics = getCacheErrorMetrics();
      expect(metrics.errorsByOperation.get).toBe(2);
      expect(metrics.errorsByOperation.put).toBe(1);
      expect(metrics.errorsByOperation.delete).toBe(3);
    });

    it('should reset metrics correctly', async () => {
      setFetchFunction(() => Promise.reject(new Error('Error')));

      await checkCacheStatus('key1');
      await warmPartition('key2');

      resetCacheErrorMetrics();

      const metrics = getCacheErrorMetrics();
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.errorsByOperation.get).toBe(0);
      expect(metrics.errorsByOperation.put).toBe(0);
      expect(metrics.errorsByOperation.delete).toBe(0);
    });
  });

  describe('error log format', () => {
    it('should include all required fields in error log', async () => {
      setFetchFunction(() => Promise.reject(new Error('Test error')));

      await checkCacheStatus('data/users/block.parquet');

      const errorLog = capturedErrors[0];
      expect(errorLog).toMatchObject({
        operation: expect.stringMatching(/^(get|put|delete)$/),
        key: expect.any(String),
        error: expect.any(String),
        timestamp: expect.any(Number),
      });
    });

    it('should handle non-Error objects in catch blocks', async () => {
      setFetchFunction(() => Promise.reject('String error message'));

      await checkCacheStatus('data/test/key.parquet');

      const errorLog = capturedErrors.find(log => log.operation === 'get');
      expect(errorLog).toBeDefined();
      expect(errorLog?.error).toBe('String error message');
    });

    it('should handle undefined/null errors gracefully', async () => {
      setFetchFunction(() => Promise.reject(undefined));

      await checkCacheStatus('data/test/key.parquet');

      const errorLog = capturedErrors.find(log => log.operation === 'get');
      expect(errorLog).toBeDefined();
      expect(errorLog?.error).toBe('Unknown error');
    });
  });
});
