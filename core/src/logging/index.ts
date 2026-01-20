/**
 * @evodb/core/logging - Structured logging
 *
 * This submodule exports structured logging utilities including:
 * - Logger interface
 * - Console logger
 * - Test logger (captures logs for assertions)
 * - No-op logger (for production)
 *
 * @module logging
 */

export {
  // Types
  type Logger,
  type LogLevel,
  type LogEntry,
  type LoggerConfig,
  type ConsoleLoggerConfig,
  type TestLogger,
  // Factory functions
  createLogger,
  createConsoleLogger,
  createNoopLogger,
  createTestLogger,
  // Context helpers
  withContext,
  // Constants and utilities
  LogLevels,
} from '../logging.js';
