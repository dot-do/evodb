/**
 * @evodb/core/logging - Logging Type Definitions
 *
 * This submodule exports only type definitions for logging.
 * Full implementation is available in @evodb/observability.
 *
 * DECOUPLING: This module exports types only, no runtime code.
 * For implementations, import from @evodb/observability.
 *
 * @example
 * ```typescript
 * // Type-only usage (core):
 * import type { Logger, LogLevel } from '@evodb/core/logging';
 *
 * // Full implementation (observability):
 * import { createConsoleLogger, withContext } from '@evodb/observability';
 * ```
 *
 * @module logging
 */

export type {
  Logger,
  LogLevel,
  LogEntry,
  LoggerConfig,
  ConsoleLoggerConfig,
  TestLogger,
  LogContext,
  LogContextValue,
} from '../logging-types.js';
