# @evodb/observability

Optional observability package for EvoDB with metrics, tracing, and logging.

## Installation

```bash
npm install @evodb/observability
```

## Architecture: Decoupled Observability

EvoDB follows a decoupled observability pattern:

- **@evodb/core**: Exports type definitions only (interfaces, type aliases)
- **@evodb/observability**: Provides implementations (factory functions, constants)

This allows:
- Zero-overhead when observability is not needed
- Smaller bundle sizes for edge deployments
- Gradual adoption (add logging first, then tracing, then metrics)
- Testing with mock implementations

### Type-only Usage (Minimal Bundle)

```typescript
// Import only types from core - no runtime code
import type { Logger, TracingContext, MetricsRegistry } from '@evodb/core';

// Create your own minimal implementations
const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
```

### Full Implementation

```typescript
import {
  // Logging
  createConsoleLogger,
  createTestLogger,
  withContext,

  // Tracing
  createTracingContext,
  SpanStatusCode,
  SpanKinds,

  // Metrics
  createMetricsRegistry,
  createCounter,
  createGauge,
  createHistogram,
  formatPrometheus,
} from '@evodb/observability';
```

## Logging

### Console Logger

```typescript
import { createConsoleLogger } from '@evodb/observability';

// JSON format for production (structured logs)
const logger = createConsoleLogger({ format: 'json' });

// Pretty format for development
const devLogger = createConsoleLogger({ format: 'pretty' });

logger.info('Query executed', {
  table: 'users',
  rowsReturned: 42,
  durationMs: 15
});
```

### Test Logger

```typescript
import { createTestLogger } from '@evodb/observability';

const logger = createTestLogger();

// Code under test
myFunction(logger);

// Assertions
expect(logger.getLogs()).toHaveLength(1);
expect(logger.getLogs()[0].level).toBe('info');
```

### Context-enriched Logging

```typescript
import { createConsoleLogger, withContext } from '@evodb/observability';

const baseLogger = createConsoleLogger({ format: 'json' });
const requestLogger = withContext(baseLogger, { requestId: 'req-123' });

// All logs include requestId automatically
requestLogger.info('Processing request');
// Output: {"level":"info","message":"Processing request","context":{"requestId":"req-123"},...}
```

## Tracing (OpenTelemetry Compatible)

### Basic Tracing

```typescript
import { createTracingContext, SpanStatusCode, SpanKinds } from '@evodb/observability';

const tracer = createTracingContext({ serviceName: 'my-service' });

const span = tracer.startSpan('handle-request', {
  kind: SpanKinds.SERVER,
  attributes: { 'http.method': 'GET' },
});

try {
  // Do work...
  span.setAttribute('rows_returned', 42);
  tracer.endSpan(span, { code: SpanStatusCode.OK });
} catch (error) {
  span.recordException(error as Error);
  tracer.endSpan(span, { code: SpanStatusCode.ERROR, message: 'Request failed' });
  throw error;
}
```

### W3C Trace Context Propagation

```typescript
import { parseW3CTraceParent, createW3CTraceParent } from '@evodb/observability';

// Parse incoming traceparent header
const parentContext = parseW3CTraceParent(request.headers.get('traceparent') ?? '');

// Create child span with parent context
const span = tracer.startSpan('child-operation', {
  parentContext,
});

// Propagate to downstream services
const outgoingHeaders = new Headers();
tracer.injectContext(span, outgoingHeaders);
```

### OTEL Export

```typescript
import { formatOTEL } from '@evodb/observability';

// Get spans in OTEL format for export
const otelSpans = formatOTEL(spans);
await fetch('https://otel-collector.example.com/v1/traces', {
  method: 'POST',
  body: JSON.stringify({ resourceSpans: [{ spans: otelSpans }] }),
});
```

## Metrics (Prometheus)

### Counter

```typescript
import { createMetricsRegistry, createCounter } from '@evodb/observability';

const registry = createMetricsRegistry();
const requestCounter = createCounter(registry, {
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'status'],
});

requestCounter.labels({ method: 'GET', status: '200' }).inc();
requestCounter.labels({ method: 'POST', status: '201' }).inc();
```

### Gauge

```typescript
import { createMetricsRegistry, createGauge } from '@evodb/observability';

const registry = createMetricsRegistry();
const connections = createGauge(registry, {
  name: 'active_connections',
  help: 'Active connections',
});

connections.inc();  // +1
connections.dec();  // -1
connections.set(5); // Set to 5
```

### Histogram

```typescript
import { createMetricsRegistry, createHistogram } from '@evodb/observability';

const registry = createMetricsRegistry();
const latency = createHistogram(registry, {
  name: 'query_duration_seconds',
  help: 'Query duration in seconds',
  labelNames: ['table'],
  buckets: [0.001, 0.01, 0.1, 1, 10],
});

// Direct observation
latency.labels({ table: 'users' }).observe(0.05);

// Timer helper
const end = latency.labels({ table: 'orders' }).startTimer();
await executeQuery();
end(); // Records duration
```

### Prometheus Export

```typescript
import { formatPrometheus } from '@evodb/observability';

export default {
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/metrics') {
      const body = formatPrometheus(registry);
      return new Response(body, {
        headers: { 'Content-Type': registry.contentType },
      });
    }
    // ... handle other requests
  },
};
```

## Pre-defined EvoDB Metrics

```typescript
import { EvoDBMetrics, formatPrometheus } from '@evodb/observability';

const metrics = EvoDBMetrics.create();

// Track query performance
const end = metrics.queryDurationSeconds.labels({ table: 'users' }).startTimer();
await executeQuery();
end();

// Track cache hits/misses
metrics.cacheHitsTotal.labels({ cache_type: 'block' }).inc();
metrics.cacheMissesTotal.labels({ cache_type: 'block' }).inc();

// Track blocks scanned
metrics.blocksScannedTotal.labels({ table: 'users' }).inc(5);

// Export all metrics
const body = formatPrometheus(metrics.registry);
```

## ObservabilityProvider Pattern

For unified observability injection:

```typescript
import type { ObservabilityProvider } from '@evodb/core';
import {
  createConsoleLogger,
  createTracingContext,
  createMetricsRegistry
} from '@evodb/observability';

// Create full observability stack
const observability: ObservabilityProvider = {
  logger: createConsoleLogger({ format: 'json' }),
  tracer: createTracingContext({ serviceName: 'my-app' }),
  metrics: createMetricsRegistry(),
};

// Or partial (just logging)
const loggingOnly: ObservabilityProvider = {
  logger: createConsoleLogger(),
};

// Pass to EvoDB
const db = new EvoDB({
  mode: 'production',
  logger: observability.logger,
});
```

## Integration with Cloudflare

### Workers Analytics

```typescript
import { EvoDBMetrics } from '@evodb/observability';

const metrics = EvoDBMetrics.create();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const end = metrics.queryDurationSeconds.labels({ table: 'default' }).startTimer();

    try {
      // Handle request...
      return new Response('OK');
    } finally {
      end();

      // Report to Cloudflare Analytics Engine
      env.ANALYTICS?.writeDataPoint({
        doubles: [metrics.queryDurationSeconds.get().sum],
        blobs: ['query_duration'],
      });
    }
  },
};
```

### Durable Object Tracing

```typescript
import { createTracingContext, SpanKinds, SpanStatusCode } from '@evodb/observability';

export class MyDO {
  private tracer = createTracingContext({ serviceName: 'my-do' });

  async fetch(request: Request): Promise<Response> {
    const span = this.tracer.startSpan('handle-request', {
      kind: SpanKinds.SERVER,
      attributes: { 'http.url': request.url },
    });

    try {
      const result = await this.processRequest(request, span);
      this.tracer.endSpan(span, { code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      this.tracer.endSpan(span, { code: SpanStatusCode.ERROR });
      throw error;
    }
  }

  private async processRequest(request: Request, parentSpan: Span): Promise<Response> {
    // Create child spans for internal operations
    const dbSpan = this.tracer.startSpan('database-query', { parent: parentSpan });
    // ...
    this.tracer.endSpan(dbSpan);

    return new Response('OK');
  }
}
```
