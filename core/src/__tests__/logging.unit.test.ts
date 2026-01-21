/**
 * Tests for EvoDB Logging Integration
 *
 * These tests verify that EvoDB correctly integrates with the Logger interface.
 * The logging implementation tests are in @evodb/observability.
 */

import { describe, it, expect } from 'vitest';
import type { Logger, LogEntry } from '../logging-types.js';
import { EvoDB } from '../evodb.js';

// Minimal test logger for integration tests
function createTestLogger(): Logger & { getLogs(): LogEntry[]; clear(): void } {
  const logs: LogEntry[] = [];

  return {
    debug(message: string, context?: Record<string, unknown>): void {
      logs.push({ level: 'debug', message, timestamp: Date.now(), context });
    },
    info(message: string, context?: Record<string, unknown>): void {
      logs.push({ level: 'info', message, timestamp: Date.now(), context });
    },
    warn(message: string, context?: Record<string, unknown>): void {
      logs.push({ level: 'warn', message, timestamp: Date.now(), context });
    },
    error(message: string, error?: Error, context?: Record<string, unknown>): void {
      logs.push({ level: 'error', message, timestamp: Date.now(), context, error });
    },
    getLogs(): LogEntry[] {
      return [...logs];
    },
    clear(): void {
      logs.length = 0;
    },
  };
}

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

  it('should filter logs by minLevel when using filtered logger', async () => {
    // Create a logger that filters debug logs
    const logs: LogEntry[] = [];
    const logger: Logger = {
      debug(): void {}, // No-op for debug
      info(message: string, context?: Record<string, unknown>): void {
        logs.push({ level: 'info', message, timestamp: Date.now(), context });
      },
      warn(message: string, context?: Record<string, unknown>): void {
        logs.push({ level: 'warn', message, timestamp: Date.now(), context });
      },
      error(message: string, error?: Error, context?: Record<string, unknown>): void {
        logs.push({ level: 'error', message, timestamp: Date.now(), context, error });
      },
    };

    const db = new EvoDB({ mode: 'development', logger });

    await db.insert('users', { name: 'Alice' });

    // Debug logs should be filtered out (initialization + insert started)
    const debugLogs = logs.filter(l => l.level === 'debug');
    expect(debugLogs).toHaveLength(0);

    // Info logs should be present (insert completed)
    const infoLogs = logs.filter(l => l.level === 'info');
    expect(infoLogs.length).toBeGreaterThan(0);
  });
});
