# EvoDB Dashboard Example

A real-time monitoring dashboard for EvoDB deployments. This example demonstrates how to visualize metrics from the `@evodb/observability` package.

## Features

- **Real-time Metrics**: Query latency (p50/p95/p99), cache hit rates, throughput
- **Storage Monitoring**: Block counts, buffer utilization, table statistics
- **CDC Pipeline Status**: Replication lag, connected shards, flush timing
- **Health Checks**: Component status, latency monitoring
- **Interactive Charts**: Query latency and cache hit rate over time

## Quick Start

### Demo Mode

Simply open `index.html` in a browser to see the dashboard with simulated data:

```bash
cd examples/dashboard
open index.html
```

The dashboard runs in demo mode by default when no server is connected, displaying realistic simulated metrics.

### With EvoDB Server

1. Start your EvoDB server with observability enabled:

```typescript
import { EvoDBMetrics, formatPrometheus } from '@evodb/observability';

const metrics = EvoDBMetrics.create();

// Add dashboard API endpoint to your worker
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // Dashboard API
    if (url.pathname === '/api/dashboard/overview') {
      return new Response(JSON.stringify(buildOverviewData(metrics)), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Prometheus metrics endpoint
    if (url.pathname === '/metrics') {
      return new Response(formatPrometheus(metrics.registry), {
        headers: { 'Content-Type': metrics.registry.contentType },
      });
    }

    // ... rest of your worker
  },
};
```

2. Open `index.html` and enter your server URL (e.g., `http://localhost:8787`)

3. Click "Connect" to start fetching real metrics

## Files

```
dashboard/
├── index.html      # Main dashboard HTML with inline styles
├── dashboard.js    # Dashboard JavaScript with Chart.js integration
└── README.md       # This file
```

## API Endpoints Required

The dashboard expects these endpoints on your EvoDB server:

| Endpoint | Description |
|----------|-------------|
| `GET /api/dashboard/overview` | Aggregated metrics overview |
| `GET /api/dashboard/health` | System health checks |
| `GET /api/dashboard/tables` | Table statistics |
| `GET /api/dashboard/cdc/status` | CDC pipeline status |

See [DASHBOARD.md](../../docs/DASHBOARD.md) for complete API specification.

## Customization

### Refresh Rate

Modify `CONFIG.refreshInterval` in `dashboard.js`:

```javascript
const CONFIG = {
  refreshInterval: 2000, // milliseconds
  // ...
};
```

### Chart History

Adjust how many data points to show in charts:

```javascript
const CONFIG = {
  chartHistorySize: 30, // number of points
  // ...
};
```

### Disable Demo Mode

To require a real server connection:

```javascript
const CONFIG = {
  demoMode: false,
  // ...
};
```

## Metrics Displayed

### Query Performance
- Queries per second (QPS)
- p50, p95, p99 latency
- Query latency history chart

### Cache Statistics
- Overall hit rate
- Block cache hits
- Query cache hits
- Total misses
- Cache hit rate history chart

### Storage
- Total storage used
- Block count
- Table count
- Buffer size

### CDC Pipeline
- Pipeline state (idle/receiving/flushing)
- Connected shards
- Replication lag
- Buffer utilization
- Entries processed
- Flush timing

### Health Checks
- Storage (R2) status
- Cache status
- CDC pipeline status

## Dependencies

- [Chart.js](https://www.chartjs.org/) v4.4.1 (loaded from CDN)

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13.1+
- Edge 80+

## Learn More

- [Dashboard Architecture](../../docs/DASHBOARD.md) - Full API specification
- [@evodb/observability](../../observability/README.md) - Metrics package documentation
- [EvoDB Documentation](../../README.md) - Main project documentation
