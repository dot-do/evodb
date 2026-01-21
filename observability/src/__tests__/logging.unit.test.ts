/**
 * Tests for structured logging framework
 *
 * Tests the logging implementation in @evodb/observability.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Logger, LogLevel, LogEntry, LoggerConfig } from '@evodb/core';
import type { LogContext, LogContextValue } from '@evodb/core';
import {
  createLogger,
  createConsoleLogger,
  createNoopLogger,
  createTestLogger,
  withContext,
  LogLevels,
  isLogContext,
  isLogContextValue,
} from '../logging.js';

// =============================================================================
// Logger Interface Tests
// =============================================================================

describe('Logger Interface', () => {
  let testLogger: ReturnType<typeof createTestLogger>;

  beforeEach(() => {
    testLogger = createTestLogger();
  });

  describe('log levels', () => {
    it('should support debug level', () => {
      testLogger.debug('debug message');

      expect(testLogger.getLogs()).toHaveLength(1);
      expect(testLogger.getLogs()[0]).toMatchObject({
        level: 'debug',
        message: 'debug message',
      });
    });

    it('should support info level', () => {
      testLogger.info('info message');

      expect(testLogger.getLogs()).toHaveLength(1);
      expect(testLogger.getLogs()[0]).toMatchObject({
        level: 'info',
        message: 'info message',
      });
    });

    it('should support warn level', () => {
      testLogger.warn('warn message');

      expect(testLogger.getLogs()).toHaveLength(1);
      expect(testLogger.getLogs()[0]).toMatchObject({
        level: 'warn',
        message: 'warn message',
      });
    });

    it('should support error level', () => {
      testLogger.error('error message');

      expect(testLogger.getLogs()).toHaveLength(1);
      expect(testLogger.getLogs()[0]).toMatchObject({
        level: 'error',
        message: 'error message',
      });
    });
  });

  describe('structured context', () => {
    it('should include context in log entries', () => {
      testLogger.info('user logged in', { userId: 'user-123', ip: '192.168.1.1' });

      const log = testLogger.getLogs()[0];
      expect(log.context).toEqual({ userId: 'user-123', ip: '192.168.1.1' });
    });

    it('should handle nested context objects', () => {
      testLogger.info('query executed', {
        query: { table: 'users', predicates: 3 },
        stats: { duration: 150, rowsScanned: 1000 },
      });

      const log = testLogger.getLogs()[0];
      expect(log.context).toEqual({
        query: { table: 'users', predicates: 3 },
        stats: { duration: 150, rowsScanned: 1000 },
      });
    });

    it('should handle numeric values in context', () => {
      testLogger.debug('block read', { blockId: 42, bytes: 1024 });

      const log = testLogger.getLogs()[0];
      expect(log.context?.blockId).toBe(42);
      expect(log.context?.bytes).toBe(1024);
    });

    it('should handle array values in context', () => {
      testLogger.info('batch operation', { ids: ['a', 'b', 'c'] });

      const log = testLogger.getLogs()[0];
      expect(log.context?.ids).toEqual(['a', 'b', 'c']);
    });
  });

  describe('error logging', () => {
    it('should include error object in log entry', () => {
      const error = new Error('Something went wrong');
      testLogger.error('operation failed', error);

      const log = testLogger.getLogs()[0];
      expect(log.error).toBe(error);
    });

    it('should include both error and context', () => {
      const error = new Error('Query timeout');
      testLogger.error('query failed', error, { table: 'users', timeout: 5000 });

      const log = testLogger.getLogs()[0];
      expect(log.error).toBe(error);
      expect(log.context).toEqual({ table: 'users', timeout: 5000 });
    });

    it('should handle error without context', () => {
      const error = new Error('Connection lost');
      testLogger.error('connection error', error);

      const log = testLogger.getLogs()[0];
      expect(log.error).toBe(error);
      expect(log.context).toBeUndefined();
    });
  });

  describe('timestamp', () => {
    it('should include timestamp in log entries', () => {
      const before = Date.now();
      testLogger.info('test message');
      const after = Date.now();

      const log = testLogger.getLogs()[0];
      expect(log.timestamp).toBeGreaterThanOrEqual(before);
      expect(log.timestamp).toBeLessThanOrEqual(after);
    });
  });
});

// =============================================================================
// Logger Factories Tests
// =============================================================================

describe('Logger Factories', () => {
  describe('createLogger', () => {
    it('should create a logger with default config', () => {
      const logger = createLogger();

      // Should not throw
      expect(() => {
        logger.debug('debug');
        logger.info('info');
        logger.warn('warn');
        logger.error('error');
      }).not.toThrow();
    });

    it('should respect minimum log level', () => {
      const testLogger = createTestLogger({ minLevel: 'warn' });

      testLogger.debug('debug message');
      testLogger.info('info message');
      testLogger.warn('warn message');
      testLogger.error('error message');

      const logs = testLogger.getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].level).toBe('warn');
      expect(logs[1].level).toBe('error');
    });

    it('should support custom output function', () => {
      const output = vi.fn();
      const logger = createLogger({ output });

      logger.info('test message', { key: 'value' });

      expect(output).toHaveBeenCalledTimes(1);
      expect(output).toHaveBeenCalledWith(expect.objectContaining({
        level: 'info',
        message: 'test message',
        context: { key: 'value' },
      }));
    });
  });

  describe('createConsoleLogger', () => {
    it('should create a logger that outputs to console', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = createConsoleLogger();
      logger.info('test message');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should format log entries as JSON by default', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = createConsoleLogger({ format: 'json' });
      logger.info('test message', { userId: '123' });

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('test message');
      expect(parsed.context.userId).toBe('123');

      consoleSpy.mockRestore();
    });

    it('should support pretty format for development', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const logger = createConsoleLogger({ format: 'pretty' });
      logger.info('test message');

      // Pretty format should not be valid JSON
      const output = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe('createNoopLogger', () => {
    it('should create a logger that does nothing', () => {
      const logger = createNoopLogger();

      // Should not throw
      expect(() => {
        logger.debug('debug');
        logger.info('info');
        logger.warn('warn');
        logger.error('error', new Error('test'));
      }).not.toThrow();
    });
  });

  describe('createTestLogger', () => {
    it('should create a logger that captures logs for testing', () => {
      const logger = createTestLogger();

      logger.info('message 1');
      logger.warn('message 2');

      expect(logger.getLogs()).toHaveLength(2);
    });

    it('should allow clearing captured logs', () => {
      const logger = createTestLogger();

      logger.info('message 1');
      expect(logger.getLogs()).toHaveLength(1);

      logger.clear();
      expect(logger.getLogs()).toHaveLength(0);
    });

    it('should provide filtered access by level', () => {
      const logger = createTestLogger();

      logger.debug('debug 1');
      logger.info('info 1');
      logger.info('info 2');
      logger.warn('warn 1');
      logger.error('error 1');

      expect(logger.getLogsByLevel('info')).toHaveLength(2);
      expect(logger.getLogsByLevel('error')).toHaveLength(1);
    });
  });
});

// =============================================================================
// Child Loggers and Context Tests
// =============================================================================

describe('Child Loggers', () => {
  it('should create child logger with additional context', () => {
    const parentLogger = createTestLogger();
    const childLogger = withContext(parentLogger, { requestId: 'req-123' });

    childLogger.info('processing request');

    // Access parent logs through the child's underlying logger
    const logs = parentLogger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].context).toMatchObject({ requestId: 'req-123' });
  });

  it('should merge parent and local context', () => {
    const parentLogger = createTestLogger();
    const childLogger = withContext(parentLogger, { requestId: 'req-123' });

    childLogger.info('user action', { userId: 'user-456' });

    const logs = parentLogger.getLogs();
    expect(logs[0].context).toMatchObject({
      requestId: 'req-123',
      userId: 'user-456',
    });
  });

  it('should allow nested child loggers', () => {
    const rootLogger = createTestLogger();
    const serviceLogger = withContext(rootLogger, { service: 'query-engine' });
    const requestLogger = withContext(serviceLogger, { requestId: 'req-123' });

    requestLogger.info('executing query', { table: 'users' });

    const logs = rootLogger.getLogs();
    expect(logs[0].context).toMatchObject({
      service: 'query-engine',
      requestId: 'req-123',
      table: 'users',
    });
  });

  it('should preserve parent log level', () => {
    const parentLogger = createTestLogger({ minLevel: 'warn' });
    const childLogger = withContext(parentLogger, { requestId: 'req-123' });

    childLogger.debug('debug message'); // Should be filtered
    childLogger.info('info message'); // Should be filtered
    childLogger.warn('warn message'); // Should be logged

    const logs = parentLogger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('warn');
  });
});

// =============================================================================
// Log Level Utilities Tests
// =============================================================================

describe('LogLevels', () => {
  it('should export log level constants', () => {
    expect(LogLevels.DEBUG).toBe('debug');
    expect(LogLevels.INFO).toBe('info');
    expect(LogLevels.WARN).toBe('warn');
    expect(LogLevels.ERROR).toBe('error');
  });

  it('should define correct log level order', () => {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const order = levels.map(l => LogLevels.order(l));

    expect(order[0]).toBeLessThan(order[1]); // debug < info
    expect(order[1]).toBeLessThan(order[2]); // info < warn
    expect(order[2]).toBeLessThan(order[3]); // warn < error
  });

  it('should compare log levels correctly', () => {
    expect(LogLevels.isAtLeast('warn', 'debug')).toBe(true);
    expect(LogLevels.isAtLeast('warn', 'warn')).toBe(true);
    expect(LogLevels.isAtLeast('warn', 'error')).toBe(false);
  });
});

// =============================================================================
// Type Safety Tests
// =============================================================================

describe('Type Safety', () => {
  it('should enforce Logger interface', () => {
    const logger: Logger = createTestLogger();

    // Type checking - these should compile
    logger.debug('message');
    logger.debug('message', { key: 'value' });
    logger.info('message');
    logger.info('message', { key: 'value' });
    logger.warn('message');
    logger.warn('message', { key: 'value' });
    logger.error('message');
    logger.error('message', new Error());
    logger.error('message', new Error(), { key: 'value' });
  });

  it('should enforce LogEntry structure', () => {
    const testLogger = createTestLogger();
    testLogger.info('test', { key: 'value' });

    const entry: LogEntry = testLogger.getLogs()[0];

    // Type checking - these fields should exist
    const _level: LogLevel = entry.level;
    const _message: string = entry.message;
    const _timestamp: number = entry.timestamp;
    const _context: Record<string, unknown> | undefined = entry.context;
    const _error: Error | undefined = entry.error;

    expect(_level).toBe('info');
    expect(_message).toBe('test');
  });
});

// =============================================================================
// LogContext Type Guard Tests
// =============================================================================

describe('LogContext', () => {
  describe('isLogContextValue', () => {
    it('returns true for null', () => {
      expect(isLogContextValue(null)).toBe(true);
    });

    it('returns true for string', () => {
      expect(isLogContextValue('hello')).toBe(true);
      expect(isLogContextValue('')).toBe(true);
    });

    it('returns true for number', () => {
      expect(isLogContextValue(42)).toBe(true);
      expect(isLogContextValue(0)).toBe(true);
      expect(isLogContextValue(-1.5)).toBe(true);
      expect(isLogContextValue(Infinity)).toBe(true);
      expect(isLogContextValue(NaN)).toBe(true);
    });

    it('returns true for boolean', () => {
      expect(isLogContextValue(true)).toBe(true);
      expect(isLogContextValue(false)).toBe(true);
    });

    it('returns true for arrays of valid values', () => {
      expect(isLogContextValue(['a', 'b', 'c'])).toBe(true);
      expect(isLogContextValue([1, 2, 3])).toBe(true);
      expect(isLogContextValue([true, false])).toBe(true);
      expect(isLogContextValue([null, 'mixed', 123])).toBe(true);
      expect(isLogContextValue([])).toBe(true);
    });

    it('returns true for nested arrays', () => {
      expect(isLogContextValue([[1, 2], [3, 4]])).toBe(true);
      expect(isLogContextValue([['a', 'b'], ['c', 'd']])).toBe(true);
    });

    it('returns true for objects with valid values', () => {
      expect(isLogContextValue({ key: 'value' })).toBe(true);
      expect(isLogContextValue({ count: 42 })).toBe(true);
      expect(isLogContextValue({ active: true })).toBe(true);
      expect(isLogContextValue({ nothing: null })).toBe(true);
      expect(isLogContextValue({})).toBe(true);
    });

    it('returns true for nested objects', () => {
      const nested: LogContextValue = {
        level1: {
          level2: {
            level3: 'deep',
          },
        },
      };
      expect(isLogContextValue(nested)).toBe(true);
    });

    it('returns false for undefined', () => {
      expect(isLogContextValue(undefined)).toBe(false);
    });

    it('returns false for functions', () => {
      expect(isLogContextValue(() => {})).toBe(false);
      expect(isLogContextValue(function() {})).toBe(false);
    });

    it('returns false for symbols', () => {
      expect(isLogContextValue(Symbol('test'))).toBe(false);
    });

    it('returns false for arrays containing invalid values', () => {
      expect(isLogContextValue([undefined])).toBe(false);
      expect(isLogContextValue([() => {}])).toBe(false);
      expect(isLogContextValue(['valid', undefined])).toBe(false);
    });

    it('returns false for objects containing invalid values', () => {
      expect(isLogContextValue({ fn: () => {} })).toBe(false);
      expect(isLogContextValue({ undef: undefined })).toBe(false);
    });
  });

  describe('isLogContext', () => {
    it('returns true for empty object', () => {
      expect(isLogContext({})).toBe(true);
    });

    it('returns true for context with known fields', () => {
      const context: LogContext = {
        requestId: 'req-123',
        userId: 'user-456',
        service: 'query-engine',
        operation: 'scan',
        table: 'events',
        durationMs: 42.5,
        rowsProcessed: 1000,
        bytesProcessed: 8192,
        errorCode: 'ERR_TIMEOUT',
      };
      expect(isLogContext(context)).toBe(true);
    });

    it('returns true for context with undefined values', () => {
      const context = {
        requestId: 'req-123',
        userId: undefined, // undefined values are allowed
      };
      expect(isLogContext(context)).toBe(true);
    });

    it('returns true for context with custom fields', () => {
      const context: LogContext = {
        requestId: 'req-123',
        customField: 'custom-value',
        customNumber: 42,
        customArray: ['a', 'b'],
        customObject: { nested: true },
      };
      expect(isLogContext(context)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isLogContext(null)).toBe(false);
    });

    it('returns false for array', () => {
      expect(isLogContext([])).toBe(false);
      expect(isLogContext([{ requestId: 'req-123' }])).toBe(false);
    });

    it('returns false for primitive types', () => {
      expect(isLogContext('string')).toBe(false);
      expect(isLogContext(123)).toBe(false);
      expect(isLogContext(true)).toBe(false);
    });

    it('returns false for context with invalid values', () => {
      const invalidContext = {
        requestId: 'req-123',
        invalidFn: () => {}, // functions not allowed
      };
      expect(isLogContext(invalidContext)).toBe(false);
    });

    it('returns false for context with Symbol values', () => {
      const invalidContext = {
        requestId: 'req-123',
        symbol: Symbol('test'),
      };
      expect(isLogContext(invalidContext)).toBe(false);
    });
  });
});
