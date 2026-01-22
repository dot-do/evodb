# @evodb/observability

Optional observability package for EvoDB with metrics, tracing, and logging.

## Installation
```bash
npm install @evodb/observability
```

## Metrics (Prometheus)
```typescript
import { createMetricsRegistry } from '@evodb/observability';

const metrics = createMetricsRegistry();
const counter = metrics.createCounter('queries_total', 'Total queries');
counter.inc();

// Export to Prometheus format
const output = metrics.formatPrometheus();
```

## Tracing (OpenTelemetry)
```typescript
import { createTracingContext } from '@evodb/observability';

const tracing = createTracingContext({ serviceName: 'my-service' });
const span = tracing.startSpan('query');
// ... do work
span.end();
```

## Logging
```typescript
import { createLogger } from '@evodb/observability';

const logger = createLogger({ level: 'info' });
logger.info('Query executed', { table: 'users', duration: 10 });
```

## Integration with Cloudflare
- Cloudflare analytics integration
- Workers-compatible logging
