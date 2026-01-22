/**
 * Tests for ObservabilityProvider
 *
 * These tests verify the ObservabilityProvider pattern for optional
 * injection of observability concerns.
 *
 * Issue: evodb-g03
 */

import { describe, it, expect } from 'vitest';
import type { Logger } from '../logging-types.js';
import type { TracingContext, Span } from '../tracing-types.js';
import type { MetricsRegistry, Metric } from '../metrics-types.js';
import {
  type ObservabilityProvider,
  createNoopLogger,
  noopLogger,
  getLoggerOrNoop,
  hasLogger,
  hasTracer,
  hasMetrics,
  getLogger,
} from '../observability-provider.js';

// =============================================================================
// Test: createNoopLogger
// =============================================================================

describe('createNoopLogger', () => {
  it('should create a logger with all methods', () => {
    const logger = createNoopLogger();

    expect(logger.debug).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.error).toBeDefined();
  });

  it('should not throw when calling logger methods', () => {
    const logger = createNoopLogger();

    expect(() => logger.debug('test')).not.toThrow();
    expect(() => logger.info('test', { key: 'value' })).not.toThrow();
    expect(() => logger.warn('test')).not.toThrow();
    expect(() => logger.error('test', new Error('test'))).not.toThrow();
  });

  it('should create a new instance each time', () => {
    const logger1 = createNoopLogger();
    const logger2 = createNoopLogger();

    expect(logger1).not.toBe(logger2);
  });
});

// =============================================================================
// Test: noopLogger singleton
// =============================================================================

describe('noopLogger', () => {
  it('should be a Logger instance', () => {
    expect(noopLogger.debug).toBeDefined();
    expect(noopLogger.info).toBeDefined();
    expect(noopLogger.warn).toBeDefined();
    expect(noopLogger.error).toBeDefined();
  });

  it('should be the same instance across imports', async () => {
    // Import again to verify singleton
    const { noopLogger: imported } = await import('../observability-provider.js');
    expect(noopLogger).toBe(imported);
  });
});

// =============================================================================
// Test: getLoggerOrNoop
// =============================================================================

describe('getLoggerOrNoop', () => {
  it('should return provided logger when given', () => {
    const customLogger: Logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const result = getLoggerOrNoop(customLogger);
    expect(result).toBe(customLogger);
  });

  it('should return noop logger when undefined', () => {
    const result = getLoggerOrNoop(undefined);
    expect(result).toBe(noopLogger);
  });

  it('should return noop logger when not provided', () => {
    const result = getLoggerOrNoop();
    expect(result).toBe(noopLogger);
  });
});

// =============================================================================
// Test: hasLogger type guard
// =============================================================================

describe('hasLogger', () => {
  it('should return true when logger is provided', () => {
    const provider: ObservabilityProvider = {
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };

    expect(hasLogger(provider)).toBe(true);

    // Type narrowing should work
    if (hasLogger(provider)) {
      expect(provider.logger).toBeDefined();
    }
  });

  it('should return false when logger is undefined', () => {
    const provider: ObservabilityProvider = {};
    expect(hasLogger(provider)).toBe(false);
  });

  it('should return false when provider is undefined', () => {
    expect(hasLogger(undefined)).toBe(false);
  });
});

// =============================================================================
// Test: hasTracer type guard
// =============================================================================

describe('hasTracer', () => {
  it('should return true when tracer is provided', () => {
    const mockTracer: TracingContext = {
      startSpan: () => ({
        traceId: '0'.repeat(32),
        spanId: '0'.repeat(16),
        name: 'test',
        startTime: Date.now(),
        kind: 'internal',
        status: { code: 0 },
        attributes: {},
        events: [],
        isRecording: true,
        setAttribute: () => {},
        setAttributes: () => {},
        addEvent: () => {},
        recordException: () => {},
      }),
      endSpan: () => {},
      extractContext: (span: Span) => ({
        traceId: span.traceId,
        spanId: span.spanId,
        traceFlags: 0,
      }),
      injectContext: () => {},
      flush: async () => {},
    };

    const provider: ObservabilityProvider = { tracer: mockTracer };

    expect(hasTracer(provider)).toBe(true);
  });

  it('should return false when tracer is undefined', () => {
    const provider: ObservabilityProvider = {};
    expect(hasTracer(provider)).toBe(false);
  });
});

// =============================================================================
// Test: hasMetrics type guard
// =============================================================================

describe('hasMetrics', () => {
  it('should return true when metrics is provided', () => {
    const mockRegistry: MetricsRegistry = {
      getMetrics: () => [],
      getMetric: () => undefined,
      clear: () => {},
      resetAll: () => {},
      contentType: 'text/plain',
      _register: () => {},
    };

    const provider: ObservabilityProvider = { metrics: mockRegistry };

    expect(hasMetrics(provider)).toBe(true);
  });

  it('should return false when metrics is undefined', () => {
    const provider: ObservabilityProvider = {};
    expect(hasMetrics(provider)).toBe(false);
  });
});

// =============================================================================
// Test: getLogger
// =============================================================================

describe('getLogger', () => {
  it('should return logger from provider when available', () => {
    const customLogger: Logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const provider: ObservabilityProvider = { logger: customLogger };
    const result = getLogger(provider);

    expect(result).toBe(customLogger);
  });

  it('should return noop logger when provider has no logger', () => {
    const provider: ObservabilityProvider = {};
    const result = getLogger(provider);

    expect(result).toBe(noopLogger);
  });

  it('should return noop logger when provider is undefined', () => {
    const result = getLogger(undefined);
    expect(result).toBe(noopLogger);
  });
});

// =============================================================================
// Test: ObservabilityProvider usage patterns
// =============================================================================

describe('ObservabilityProvider usage patterns', () => {
  it('should allow empty provider', () => {
    const provider: ObservabilityProvider = {};

    expect(provider.logger).toBeUndefined();
    expect(provider.tracer).toBeUndefined();
    expect(provider.metrics).toBeUndefined();
  });

  it('should allow partial provider with just logger', () => {
    const logs: string[] = [];

    const provider: ObservabilityProvider = {
      logger: {
        debug: (msg) => logs.push(`DEBUG: ${msg}`),
        info: (msg) => logs.push(`INFO: ${msg}`),
        warn: (msg) => logs.push(`WARN: ${msg}`),
        error: (msg) => logs.push(`ERROR: ${msg}`),
      },
    };

    provider.logger!.info('test');
    expect(logs).toContain('INFO: test');
  });

  it('should allow full provider', () => {
    const provider: ObservabilityProvider = {
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      tracer: {
        startSpan: (name) => ({
          traceId: '0'.repeat(32),
          spanId: '0'.repeat(16),
          name,
          startTime: Date.now(),
          kind: 'internal',
          status: { code: 0 },
          attributes: {},
          events: [],
          isRecording: true,
          setAttribute: () => {},
          setAttributes: () => {},
          addEvent: () => {},
          recordException: () => {},
        }),
        endSpan: () => {},
        extractContext: (span: Span) => ({
          traceId: span.traceId,
          spanId: span.spanId,
          traceFlags: 0,
        }),
        injectContext: () => {},
        flush: async () => {},
      },
      metrics: {
        getMetrics: () => [],
        getMetric: () => undefined,
        clear: () => {},
        resetAll: () => {},
        contentType: 'text/plain',
        _register: () => {},
      },
    };

    expect(hasLogger(provider)).toBe(true);
    expect(hasTracer(provider)).toBe(true);
    expect(hasMetrics(provider)).toBe(true);
  });

  it('should work with conditional observability usage', () => {
    function processRequest(provider?: ObservabilityProvider): { logged: boolean; traced: boolean } {
      let logged = false;
      let traced = false;

      // Conditional logging
      if (hasLogger(provider)) {
        provider.logger.info('Processing');
        logged = true;
      }

      // Conditional tracing
      if (hasTracer(provider)) {
        const span = provider.tracer.startSpan('process');
        provider.tracer.endSpan(span);
        traced = true;
      }

      return { logged, traced };
    }

    // Without provider
    expect(processRequest()).toEqual({ logged: false, traced: false });

    // With logger only
    expect(processRequest({
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    })).toEqual({ logged: true, traced: false });

    // With full provider
    const fullProvider: ObservabilityProvider = {
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      tracer: {
        startSpan: (name) => ({
          traceId: '0'.repeat(32),
          spanId: '0'.repeat(16),
          name,
          startTime: Date.now(),
          kind: 'internal',
          status: { code: 0 },
          attributes: {},
          events: [],
          isRecording: true,
          setAttribute: () => {},
          setAttributes: () => {},
          addEvent: () => {},
          recordException: () => {},
        }),
        endSpan: () => {},
        extractContext: (span: Span) => ({
          traceId: span.traceId,
          spanId: span.spanId,
          traceFlags: 0,
        }),
        injectContext: () => {},
        flush: async () => {},
      },
    };
    expect(processRequest(fullProvider)).toEqual({ logged: true, traced: true });
  });
});
