/**
 * Structured Logging Framework for EvoDB
 *
 * Provides a lightweight, structured logging interface optimized for:
 * - Cloudflare Workers (minimal overhead)
 * - Edge environments (structured JSON output)
 * - Testing (injectable loggers)
 * - Observability (rich context)
 *
 * @example
 * ```typescript
 * import { createLogger, createConsoleLogger, withContext } from '@evodb/core';
 *
 * // Create a console logger
 * const logger = createConsoleLogger({ format: 'json' });
 *
 * // Log with structured context
 * logger.info('Query executed', {
 *   table: 'users',
 *   rowsReturned: 42,
 *   durationMs: 15
 * });
 *
 * // Create a child logger with additional context
 * const requestLogger = withContext(logger, { requestId: 'req-123' });
 * requestLogger.info('Processing request'); // Includes requestId in context
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Log level types
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Allowed value types in log context.
 *
 * Log context values are serialized to JSON, so only JSON-compatible
 * types are allowed. This provides type safety while still allowing
 * flexible structured logging.
 */
export type LogContextValue =
  | string
  | number
  | boolean
  | null
  | LogContextValue[]
  | { [key: string]: LogContextValue };

/**
 * Structured context data attached to log entries.
 *
 * LogContext provides type-safe structured logging with common fields
 * used for observability and debugging. All values must be JSON-serializable.
 *
 * @example
 * ```typescript
 * const context: LogContext = {
 *   requestId: 'req-123',
 *   userId: 'user-456',
 *   table: 'events',
 *   rowsProcessed: 1000,
 *   durationMs: 42.5,
 *   metadata: { region: 'us-east-1' },
 * };
 *
 * logger.info('Query completed', context);
 * ```
 */
export interface LogContext {
  /** Request or correlation ID for tracing */
  requestId?: string;
  /** User identifier */
  userId?: string;
  /** Session identifier */
  sessionId?: string;
  /** Service or component name */
  service?: string;
  /** Operation being performed */
  operation?: string;
  /** Table or resource name */
  table?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Number of rows processed/returned */
  rowsProcessed?: number;
  /** Number of bytes processed */
  bytesProcessed?: number;
  /** Error code for error logs */
  errorCode?: string;
  /** Additional custom fields */
  [key: string]: LogContextValue | undefined;
}

/**
 * Type guard to check if a value is a valid LogContextValue.
 *
 * @param value - The value to check
 * @returns True if value is JSON-serializable
 */
export function isLogContextValue(value: unknown): value is LogContextValue {
  if (value === null) return true;
  if (typeof value === 'string') return true;
  if (typeof value === 'number') return true;
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) {
    return value.every(isLogContextValue);
  }
  if (typeof value === 'object') {
    return Object.values(value as LogContext).every(isLogContextValue);
  }
  return false;
}

/**
 * Type guard to check if a value is a valid LogContext.
 *
 * @param value - The value to check
 * @returns True if value is a valid LogContext object
 */
export function isLogContext(value: unknown): value is LogContext {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value as LogContext).every(
    v => v === undefined || isLogContextValue(v)
  );
}

/**
 * A single log entry with all metadata
 */
export interface LogEntry {
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Structured context data */
  context?: LogContext;
  /** Error object (for error level logs) */
  error?: Error;
}

/**
 * Logger interface - the core abstraction for logging
 */
export interface Logger {
  /**
   * Log a debug message (lowest priority, typically filtered in production)
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Log an info message (general information)
   */
  info(message: string, context?: LogContext): void;

  /**
   * Log a warning message (potential issues)
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Log an error message (errors and exceptions)
   * @param message - Error description
   * @param error - Optional Error object
   * @param context - Optional structured context
   */
  error(message: string, error?: Error, context?: LogContext): void;
}

/**
 * Configuration options for creating a logger
 */
export interface LoggerConfig {
  /** Minimum log level to emit (default: 'debug') */
  minLevel?: LogLevel;
  /** Custom output function for log entries */
  output?: (entry: LogEntry) => void;
}

/**
 * Configuration options for console logger
 */
export interface ConsoleLoggerConfig extends LoggerConfig {
  /** Output format: 'json' for structured logs, 'pretty' for human-readable */
  format?: 'json' | 'pretty';
}

/**
 * Test logger with additional methods for assertions
 */
export interface TestLogger extends Logger {
  /** Get all captured log entries */
  getLogs(): LogEntry[];
  /** Get log entries filtered by level */
  getLogsByLevel(level: LogLevel): LogEntry[];
  /** Clear all captured logs */
  clear(): void;
}

// =============================================================================
// Log Level Utilities
// =============================================================================

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Log level constants and utilities
 */
export const LogLevels = {
  DEBUG: 'debug' as const,
  INFO: 'info' as const,
  WARN: 'warn' as const,
  ERROR: 'error' as const,

  /**
   * Get the numeric order of a log level
   */
  order(level: LogLevel): number {
    return LOG_LEVEL_ORDER[level];
  },

  /**
   * Check if a level is at least as high as a minimum level
   */
  isAtLeast(level: LogLevel, minLevel: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minLevel];
  },
};

// =============================================================================
// Logger Factory Functions
// =============================================================================

/**
 * Create a logger with custom configuration
 *
 * @param config - Logger configuration options
 * @returns A Logger instance
 *
 * @example
 * ```typescript
 * const logger = createLogger({
 *   minLevel: 'info',
 *   output: (entry) => sendToLoggingService(entry)
 * });
 * ```
 */
export function createLogger(config: LoggerConfig = {}): Logger {
  const minLevel = config.minLevel ?? 'debug';
  const output = config.output ?? (() => {});

  const shouldLog = (level: LogLevel): boolean => {
    return LogLevels.isAtLeast(level, minLevel);
  };

  const log = (level: LogLevel, message: string, context?: LogContext, error?: Error): void => {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
    };

    if (context !== undefined) {
      entry.context = context;
    }

    if (error !== undefined) {
      entry.error = error;
    }

    output(entry);
  };

  return {
    debug(message: string, context?: LogContext): void {
      log('debug', message, context);
    },
    info(message: string, context?: LogContext): void {
      log('info', message, context);
    },
    warn(message: string, context?: LogContext): void {
      log('warn', message, context);
    },
    error(message: string, error?: Error, context?: LogContext): void {
      log('error', message, context, error);
    },
  };
}

/**
 * Create a logger that outputs to the console
 *
 * @param config - Console logger configuration
 * @returns A Logger instance that outputs to console
 *
 * @example
 * ```typescript
 * // JSON format for production (structured logs)
 * const prodLogger = createConsoleLogger({ format: 'json' });
 *
 * // Pretty format for development
 * const devLogger = createConsoleLogger({ format: 'pretty' });
 * ```
 */
export function createConsoleLogger(config: ConsoleLoggerConfig = {}): Logger {
  const format = config.format ?? 'json';

  const formatEntry = (entry: LogEntry): string => {
    if (format === 'json') {
      return JSON.stringify({
        level: entry.level,
        message: entry.message,
        timestamp: entry.timestamp,
        ...(entry.context && { context: entry.context }),
        ...(entry.error && {
          error: {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack,
          },
        }),
      });
    }

    // Pretty format
    const time = new Date(entry.timestamp).toISOString();
    const levelUpper = entry.level.toUpperCase().padEnd(5);
    let output = `[${time}] ${levelUpper} ${entry.message}`;

    if (entry.context) {
      output += ` ${JSON.stringify(entry.context)}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  ${entry.error.stack}`;
      }
    }

    return output;
  };

  return createLogger({
    ...config,
    output: (entry) => {
      console.log(formatEntry(entry));
    },
  });
}

/**
 * Create a no-op logger that discards all log messages
 *
 * Useful for:
 * - Disabling logging in production for performance
 * - Testing code paths without log noise
 *
 * @returns A Logger that does nothing
 */
export function createNoopLogger(): Logger {
  return {
    debug(): void {},
    info(): void {},
    warn(): void {},
    error(): void {},
  };
}

/**
 * Create a test logger that captures log entries for assertions
 *
 * @param config - Logger configuration
 * @returns A TestLogger with methods to access captured logs
 *
 * @example
 * ```typescript
 * const testLogger = createTestLogger();
 *
 * // Code under test
 * myFunction(testLogger);
 *
 * // Assertions
 * expect(testLogger.getLogs()).toHaveLength(1);
 * expect(testLogger.getLogs()[0].level).toBe('info');
 * ```
 */
export function createTestLogger(config: LoggerConfig = {}): TestLogger {
  const logs: LogEntry[] = [];
  const minLevel = config.minLevel ?? 'debug';

  const shouldLog = (level: LogLevel): boolean => {
    return LogLevels.isAtLeast(level, minLevel);
  };

  const log = (level: LogLevel, message: string, context?: LogContext, error?: Error): void => {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
    };

    if (context !== undefined) {
      entry.context = context;
    }

    if (error !== undefined) {
      entry.error = error;
    }

    logs.push(entry);
  };

  return {
    debug(message: string, context?: LogContext): void {
      log('debug', message, context);
    },
    info(message: string, context?: LogContext): void {
      log('info', message, context);
    },
    warn(message: string, context?: LogContext): void {
      log('warn', message, context);
    },
    error(message: string, error?: Error, context?: LogContext): void {
      log('error', message, context, error);
    },
    getLogs(): LogEntry[] {
      return [...logs];
    },
    getLogsByLevel(level: LogLevel): LogEntry[] {
      return logs.filter(entry => entry.level === level);
    },
    clear(): void {
      logs.length = 0;
    },
  };
}

// =============================================================================
// Child Logger / Context
// =============================================================================

/**
 * Create a child logger with additional context
 *
 * The child logger will include the parent's context in all log entries,
 * merged with any local context provided at log time.
 *
 * @param logger - Parent logger
 * @param context - Context to add to all log entries
 * @returns A new Logger with the combined context
 *
 * @example
 * ```typescript
 * const serviceLogger = withContext(rootLogger, { service: 'query-engine' });
 * const requestLogger = withContext(serviceLogger, { requestId: 'req-123' });
 *
 * // This log will include both service and requestId
 * requestLogger.info('Processing query');
 * ```
 */
export function withContext(logger: Logger, context: LogContext): Logger {
  const mergeContext = (localContext?: LogContext): LogContext => {
    if (localContext === undefined) {
      return context;
    }
    return { ...context, ...localContext };
  };

  return {
    debug(message: string, localContext?: LogContext): void {
      logger.debug(message, mergeContext(localContext));
    },
    info(message: string, localContext?: LogContext): void {
      logger.info(message, mergeContext(localContext));
    },
    warn(message: string, localContext?: LogContext): void {
      logger.warn(message, mergeContext(localContext));
    },
    error(message: string, error?: Error, localContext?: LogContext): void {
      logger.error(message, error, mergeContext(localContext));
    },
  };
}
