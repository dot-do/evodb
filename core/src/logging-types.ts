/**
 * Logging Type Definitions for EvoDB
 *
 * Minimal interfaces for the Logger abstraction.
 * Full implementation available in @evodb/observability.
 *
 * DECOUPLING PATTERN:
 * - Core exports only TYPE DEFINITIONS (interfaces, type aliases)
 * - Implementations are in @evodb/observability
 * - This allows core to work without observability being installed
 *
 * For type-only usage (no runtime dependency on observability):
 * ```typescript
 * import type { Logger, LogLevel, LogEntry } from '@evodb/core';
 *
 * // Accept logger interface but don't require @evodb/observability
 * function processRequest(logger?: Logger): void {
 *   if (logger) {
 *     logger.info('Processing request');
 *   }
 * }
 *
 * // Create minimal noop logger inline
 * const noopLogger: Logger = {
 *   debug: () => {},
 *   info: () => {},
 *   warn: () => {},
 *   error: () => {},
 * };
 * ```
 *
 * For full implementation:
 * ```typescript
 * import { createConsoleLogger, createTestLogger, withContext } from '@evodb/observability';
 *
 * const logger = createConsoleLogger({ format: 'json' });
 * logger.info('Query executed', { table: 'users', rowsReturned: 42 });
 * ```
 */

/**
 * Log level types
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Allowed value types in log context (JSON-serializable)
 */
export type LogContextValue =
  | string
  | number
  | boolean
  | null
  | LogContextValue[]
  | { [key: string]: LogContextValue };

/**
 * Structured context data attached to log entries
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  service?: string;
  operation?: string;
  table?: string;
  durationMs?: number;
  rowsProcessed?: number;
  bytesProcessed?: number;
  errorCode?: string;
  [key: string]: LogContextValue | undefined;
}

/**
 * A single log entry with all metadata
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: LogContext;
  error?: Error;
}

/**
 * Logger interface - the core abstraction for logging
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
}

/**
 * Configuration options for creating a logger
 */
export interface LoggerConfig {
  minLevel?: LogLevel;
  output?: (entry: LogEntry) => void;
}

/**
 * Configuration options for console logger
 */
export interface ConsoleLoggerConfig extends LoggerConfig {
  format?: 'json' | 'pretty';
}

/**
 * Test logger with additional methods for assertions
 */
export interface TestLogger extends Logger {
  getLogs(): LogEntry[];
  getLogsByLevel(level: LogLevel): LogEntry[];
  clear(): void;
}
