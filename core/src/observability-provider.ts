/**
 * Observability Provider for EvoDB
 *
 * This module defines the ObservabilityProvider interface for optionally
 * injecting logging, tracing, and metrics into EvoDB components.
 *
 * DECOUPLING PATTERN:
 * - ObservabilityProvider is a unified interface for all observability concerns
 * - All fields are optional - components work without any observability
 * - Implementations are provided by @evodb/observability
 *
 * @example Type-only usage (minimal bundle):
 * ```typescript
 * import type { ObservabilityProvider } from '@evodb/core';
 *
 * function processRequest(observability?: ObservabilityProvider): void {
 *   // Check availability before use
 *   if (observability?.logger) {
 *     observability.logger.info('Processing request');
 *   }
 * }
 * ```
 *
 * @example With @evodb/observability:
 * ```typescript
 * import { createObservabilityProvider } from '@evodb/observability';
 *
 * const observability = createObservabilityProvider({
 *   serviceName: 'my-service',
 *   logLevel: 'info',
 *   enableMetrics: true,
 * });
 *
 * const db = new EvoDB({
 *   mode: 'production',
 *   observability,
 * });
 * ```
 */

import type { Logger } from './logging-types.js';
import type { TracingContext } from './tracing-types.js';
import type { MetricsRegistry } from './metrics-types.js';

// =============================================================================
// ObservabilityProvider Interface
// =============================================================================

/**
 * Unified interface for injecting observability into EvoDB components.
 *
 * All fields are optional - components should gracefully handle missing
 * observability by using no-op defaults or skipping observability operations.
 *
 * This pattern allows:
 * - Zero-overhead when observability is not needed
 * - Gradual adoption (add logging first, then tracing, then metrics)
 * - Testing with mock implementations
 * - Full observability in production
 */
export interface ObservabilityProvider {
  /**
   * Optional structured logger.
   * If not provided, logging calls are no-ops.
   */
  logger?: Logger;

  /**
   * Optional distributed tracing context.
   * If not provided, tracing calls are no-ops.
   */
  tracer?: TracingContext;

  /**
   * Optional metrics registry.
   * If not provided, metrics are not collected.
   */
  metrics?: MetricsRegistry;
}

// =============================================================================
// No-op Observability Provider
// =============================================================================

/**
 * Create a no-op logger that discards all log messages.
 *
 * Useful for:
 * - Default when no logger is provided
 * - Testing without log noise
 * - Production environments that don't need logging
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
 * Internal no-op logger instance for use by core components.
 * This avoids creating new objects for each component.
 */
export const noopLogger: Logger = createNoopLogger();

/**
 * Get a logger, falling back to no-op if not provided.
 *
 * @param logger - Optional logger instance
 * @returns The provided logger or a no-op logger
 *
 * @example
 * ```typescript
 * class MyComponent {
 *   private logger: Logger;
 *
 *   constructor(config: { logger?: Logger }) {
 *     this.logger = getLoggerOrNoop(config.logger);
 *   }
 *
 *   process(): void {
 *     // Safe to call - either logs or does nothing
 *     this.logger.info('Processing');
 *   }
 * }
 * ```
 */
export function getLoggerOrNoop(logger?: Logger): Logger {
  return logger ?? noopLogger;
}

// =============================================================================
// ObservabilityProvider Helpers
// =============================================================================

/**
 * Check if a provider has logging enabled.
 */
export function hasLogger(provider?: ObservabilityProvider): provider is ObservabilityProvider & { logger: Logger } {
  return provider?.logger !== undefined;
}

/**
 * Check if a provider has tracing enabled.
 */
export function hasTracer(provider?: ObservabilityProvider): provider is ObservabilityProvider & { tracer: TracingContext } {
  return provider?.tracer !== undefined;
}

/**
 * Check if a provider has metrics enabled.
 */
export function hasMetrics(provider?: ObservabilityProvider): provider is ObservabilityProvider & { metrics: MetricsRegistry } {
  return provider?.metrics !== undefined;
}

/**
 * Get logger from provider or fall back to no-op.
 */
export function getLogger(provider?: ObservabilityProvider): Logger {
  return provider?.logger ?? noopLogger;
}
