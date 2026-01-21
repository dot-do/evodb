/**
 * Tests for structured logging framework
 *
 * TDD RED Phase: These tests define the expected behavior of the logging framework.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  type Logger,
  type LogLevel,
  type LogEntry,
  type LoggerConfig,
  createLogger,
  createConsoleLogger,
  createNoopLogger,
  createTestLogger,
  withContext,
  LogLevels,
} from '../logging.js';
import { EvoDB } from '../evodb.js';

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
// EvoDB Logging Integration Tests
// =============================================================================

describe('EvoDB Logging Integration', () => {
  it('should log on initialization', () => {
    const logger = createTestLogger();

    new EvoDB({ mode: 'development', logger });

    const logs = logger.getLogs();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].level).toBe('debug');
    expect(logs[0].message).toBe('EvoDB initialized');
    expect(logs[0].context).toMatchObject({
      mode: 'development',
      hasStorage: false,
    });
  });

  it('should log insert operations', async () => {
    const logger = createTestLogger();
    const db = new EvoDB({ mode: 'development', logger });
    logger.clear(); // Clear initialization log

    await db.insert('users', { name: 'Alice' });

    const logs = logger.getLogs();

    // Should have debug (started) and info (completed) logs
    expect(logs.length).toBe(2);

    const startLog = logs.find(l => l.message === 'insert started');
    expect(startLog).toBeDefined();
    expect(startLog!.level).toBe('debug');
    expect(startLog!.context).toMatchObject({ table: 'users', documentCount: 1 });

    const completeLog = logs.find(l => l.message === 'insert completed');
    expect(completeLog).toBeDefined();
    expect(completeLog!.level).toBe('info');
    expect(completeLog!.context).toMatchObject({
      table: 'users',
      documentCount: 1,
    });
    expect(completeLog!.context!.durationMs).toBeDefined();
  });

  it('should log query operations', async () => {
    const logger = createTestLogger();
    const db = new EvoDB({ mode: 'development', logger });

    await db.insert('users', [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    logger.clear();

    await db.query('users').where('age', '>', 26).execute();

    const logs = logger.getLogs();

    const startLog = logs.find(l => l.message === 'query started');
    expect(startLog).toBeDefined();
    expect(startLog!.context).toMatchObject({
      table: 'users',
      predicateCount: 1,
    });

    const completeLog = logs.find(l => l.message === 'query completed');
    expect(completeLog).toBeDefined();
    expect(completeLog!.context).toMatchObject({
      table: 'users',
      rowsScanned: 2,
      returnedCount: 1,
    });
  });

  it('should log update operations', async () => {
    const logger = createTestLogger();
    const db = new EvoDB({ mode: 'development', logger });

    await db.insert('users', { _id: 'user-1', name: 'Alice' });
    logger.clear();

    await db.update('users', { _id: 'user-1' }, { name: 'Alice Updated' });

    const logs = logger.getLogs();

    const startLog = logs.find(l => l.message === 'update started');
    expect(startLog).toBeDefined();

    const completeLog = logs.find(l => l.message === 'update completed');
    expect(completeLog).toBeDefined();
    expect(completeLog!.context).toMatchObject({
      table: 'users',
      matchedCount: 1,
      modifiedCount: 1,
    });
  });

  it('should log delete operations', async () => {
    const logger = createTestLogger();
    const db = new EvoDB({ mode: 'development', logger });

    await db.insert('users', [
      { _id: 'user-1', name: 'Alice' },
      { _id: 'user-2', name: 'Bob' },
    ]);
    logger.clear();

    await db.delete('users', { _id: 'user-1' });

    const logs = logger.getLogs();

    const startLog = logs.find(l => l.message === 'delete started');
    expect(startLog).toBeDefined();

    const completeLog = logs.find(l => l.message === 'delete completed');
    expect(completeLog).toBeDefined();
    expect(completeLog!.context).toMatchObject({
      table: 'users',
      deletedCount: 1,
      remainingCount: 1,
    });
  });

  it('should work without logger (noop)', async () => {
    // Default behavior - no logger provided
    const db = new EvoDB({ mode: 'development' });

    // Should not throw
    await db.insert('users', { name: 'Alice' });
    await db.query('users').execute();
    await db.update('users', {}, { name: 'Bob' });
    await db.delete('users', {});
  });

  it('should filter logs by minLevel', async () => {
    const logger = createTestLogger({ minLevel: 'info' });
    const db = new EvoDB({ mode: 'development', logger });

    await db.insert('users', { name: 'Alice' });

    const logs = logger.getLogs();

    // Debug logs should be filtered out
    const debugLogs = logs.filter(l => l.level === 'debug');
    expect(debugLogs).toHaveLength(0);

    // Info logs should be present
    const infoLogs = logs.filter(l => l.level === 'info');
    expect(infoLogs.length).toBeGreaterThan(0);
  });
});
