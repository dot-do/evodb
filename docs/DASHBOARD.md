# EvoDB Dashboard Architecture

This document describes the architecture and API specification for the EvoDB Admin Dashboard, providing real-time monitoring and management capabilities for EvoDB deployments.

## Overview

The EvoDB Dashboard is a web-based administration interface that provides:

- **Real-time Metrics**: Query latency, cache hit rates, buffer utilization
- **System Monitoring**: Connection status, CDC lag, compaction progress
- **Data Exploration**: Browse tables, run ad-hoc queries, view time-travel snapshots
- **Schema Management**: Visual schema diff, migration preview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EvoDB Admin Dashboard                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │   Query Metrics     │  │   Cache Stats       │  │   System Health     │ │
│  │                     │  │                     │  │                     │ │
│  │  p50: 2.5ms         │  │  Block Cache: 94%   │  │  Status: Healthy    │ │
│  │  p99: 45ms          │  │  Query Cache: 87%   │  │  Connections: 12    │ │
│  │  Total: 1.2M        │  │  Misses: 1.2K       │  │  CDC Lag: 150ms     │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      Query Latency Over Time                             ││
│  │  50ms │    ╭─╮                                                          ││
│  │       │   ╱  ╲    ╭───╮                                                 ││
│  │  25ms │──╱────╲──╱─────╲─────────────────────                          ││
│  │       │                                                                 ││
│  │   0ms └─────────────────────────────────────────────────────────────── ││
│  │         12:00    12:15    12:30    12:45    13:00                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture

### Component Overview

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Dashboard     │──────│  EvoDB Server   │──────│   R2/Storage    │
│   (Browser)     │ HTTP │  (Cloudflare    │      │                 │
│                 │ WS   │   Workers)      │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                        │
        │                        │
        ▼                        ▼
  ┌───────────┐          ┌───────────────┐
  │  Charts   │          │  @evodb/      │
  │  (D3.js)  │          │  observability│
  └───────────┘          └───────────────┘
```

### Data Flow

1. **Metrics Collection**: `@evodb/observability` collects metrics from EvoDB operations
2. **Prometheus Export**: Metrics exposed via `/metrics` endpoint in Prometheus format
3. **REST API**: Dashboard fetches metrics via `/api/dashboard/*` endpoints
4. **WebSocket**: Real-time updates via WebSocket connection for live metrics

## Metrics Specification

### Query Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `evodb_query_duration_seconds` | Histogram | `table` | Query execution time in seconds |
| `evodb_blocks_scanned_total` | Counter | `table` | Total blocks scanned during queries |
| `evodb_queries_total` | Counter | `table`, `status` | Total queries executed |
| `evodb_query_rows_returned` | Histogram | `table` | Number of rows returned per query |

### Cache Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `evodb_cache_hits_total` | Counter | `cache_type` | Total cache hits |
| `evodb_cache_misses_total` | Counter | `cache_type` | Total cache misses |
| `evodb_cache_size_bytes` | Gauge | `cache_type` | Current cache size in bytes |
| `evodb_cache_evictions_total` | Counter | `cache_type` | Total cache evictions |

### Storage Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `evodb_buffer_size_bytes` | Gauge | `buffer_name` | Current buffer size |
| `evodb_blocks_total` | Gauge | `table` | Total blocks per table |
| `evodb_compaction_duration_seconds` | Histogram | `table` | Compaction duration |
| `evodb_storage_bytes` | Gauge | `table` | Total storage used per table |

### CDC Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `evodb_cdc_entries_processed_total` | Counter | `operation` | CDC entries processed |
| `evodb_cdc_lag_seconds` | Gauge | `shard` | CDC replication lag |
| `evodb_cdc_batches_total` | Counter | `status` | CDC batches sent/received |

### Connection Metrics

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `evodb_connections_active` | Gauge | `type` | Active connections |
| `evodb_connections_total` | Counter | `type`, `status` | Total connection attempts |
| `evodb_websocket_messages_total` | Counter | `direction` | WebSocket messages |

## REST API Endpoints

### Dashboard Data Endpoints

All endpoints return JSON and support CORS for browser access.

#### `GET /api/dashboard/overview`

Returns aggregated dashboard overview data.

**Response:**
```json
{
  "timestamp": 1705847200000,
  "status": "healthy",
  "metrics": {
    "queries": {
      "total": 1250000,
      "qps": 150.5,
      "latency": {
        "p50": 0.0025,
        "p95": 0.015,
        "p99": 0.045
      }
    },
    "cache": {
      "hitRate": 0.94,
      "size": 134217728,
      "evictions": 1250
    },
    "storage": {
      "totalBytes": 10737418240,
      "blockCount": 1500,
      "tablesCount": 12
    },
    "cdc": {
      "lag": 0.15,
      "entriesProcessed": 5000000,
      "connectedShards": 8
    }
  }
}
```

#### `GET /api/dashboard/metrics`

Returns current metrics in JSON format (alternative to Prometheus format).

**Query Parameters:**
- `metrics` (optional): Comma-separated list of metric names to include
- `labels` (optional): Label filter (e.g., `table=users`)

**Response:**
```json
{
  "timestamp": 1705847200000,
  "metrics": [
    {
      "name": "evodb_query_duration_seconds",
      "type": "histogram",
      "help": "Duration of query execution in seconds",
      "values": [
        {
          "labels": { "table": "users" },
          "count": 10000,
          "sum": 25.5,
          "buckets": {
            "0.005": 5000,
            "0.01": 7500,
            "0.025": 9000,
            "0.05": 9500,
            "0.1": 9800,
            "+Inf": 10000
          }
        }
      ]
    }
  ]
}
```

#### `GET /api/dashboard/tables`

Returns list of tables with statistics.

**Response:**
```json
{
  "tables": [
    {
      "name": "users",
      "rowCount": 1500000,
      "storageBytes": 536870912,
      "blockCount": 150,
      "lastModified": 1705847000000,
      "schema": {
        "columns": [
          { "name": "id", "type": "string" },
          { "name": "name", "type": "string" },
          { "name": "email", "type": "string" },
          { "name": "created_at", "type": "timestamp" }
        ]
      }
    }
  ]
}
```

#### `GET /api/dashboard/health`

Returns system health status.

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "storage": { "status": "ok", "latency": 5 },
    "cache": { "status": "ok", "utilization": 0.75 },
    "cdc": { "status": "ok", "lag": 0.15 }
  },
  "uptime": 86400,
  "version": "1.0.0"
}
```

#### `POST /api/dashboard/query`

Execute an ad-hoc query (for Data Explorer).

**Request:**
```json
{
  "table": "users",
  "filter": { "status": "active" },
  "select": ["id", "name", "email"],
  "limit": 100,
  "offset": 0,
  "orderBy": [{ "column": "created_at", "direction": "desc" }]
}
```

**Response:**
```json
{
  "rows": [...],
  "total": 1500,
  "executionTime": 0.025,
  "blocksScanned": 5
}
```

#### `GET /api/dashboard/cdc/status`

Returns CDC pipeline status.

**Response:**
```json
{
  "state": "receiving",
  "shards": [
    {
      "id": "shard-1",
      "name": "us-east-1",
      "status": "connected",
      "lag": 0.1,
      "entriesProcessed": 500000,
      "lastActivity": 1705847200000
    }
  ],
  "buffer": {
    "batchCount": 15,
    "entryCount": 5000,
    "utilization": 0.25
  },
  "lastFlush": 1705847100000,
  "nextFlush": 1705847160000
}
```

### Prometheus Endpoint

#### `GET /metrics`

Returns metrics in Prometheus text format for scraping.

**Response (text/plain):**
```
# HELP evodb_query_duration_seconds Duration of query execution in seconds
# TYPE evodb_query_duration_seconds histogram
evodb_query_duration_seconds_bucket{table="users",le="0.005"} 5000
evodb_query_duration_seconds_bucket{table="users",le="0.01"} 7500
evodb_query_duration_seconds_bucket{table="users",le="0.025"} 9000
evodb_query_duration_seconds_bucket{table="users",le="+Inf"} 10000
evodb_query_duration_seconds_sum{table="users"} 25.5
evodb_query_duration_seconds_count{table="users"} 10000

# HELP evodb_cache_hits_total Total number of cache hits
# TYPE evodb_cache_hits_total counter
evodb_cache_hits_total{cache_type="block"} 94000
evodb_cache_hits_total{cache_type="query"} 87000
```

### WebSocket Real-time Updates

#### `WS /api/dashboard/live`

WebSocket endpoint for real-time metric updates.

**Subscribe Message:**
```json
{
  "type": "subscribe",
  "metrics": ["evodb_query_duration_seconds", "evodb_cache_hits_total"],
  "interval": 1000
}
```

**Update Message (Server -> Client):**
```json
{
  "type": "metrics",
  "timestamp": 1705847200000,
  "data": {
    "evodb_query_duration_seconds": {
      "labels": { "table": "users" },
      "p50": 0.0025,
      "p99": 0.045,
      "count": 150
    },
    "evodb_cache_hits_total": {
      "labels": { "cache_type": "block" },
      "value": 94150
    }
  }
}
```

## Implementation Guide

### Server-Side Setup

1. **Install observability package:**
```bash
npm install @evodb/observability
```

2. **Create metrics registry:**
```typescript
import { EvoDBMetrics, formatPrometheus } from '@evodb/observability';

// Create metrics collection
const metrics = EvoDBMetrics.create();

// Track query duration
const end = metrics.queryDurationSeconds.labels({ table: 'users' }).startTimer();
await executeQuery();
end();

// Track cache hits
metrics.cacheHitsTotal.labels({ cache_type: 'block' }).inc();
```

3. **Expose endpoints:**
```typescript
// Prometheus metrics endpoint
app.get('/metrics', (req, res) => {
  const body = formatPrometheus(metrics.registry);
  res.setHeader('Content-Type', metrics.registry.contentType);
  res.send(body);
});

// Dashboard API endpoint
app.get('/api/dashboard/overview', (req, res) => {
  res.json(buildOverviewData(metrics));
});
```

### Dashboard Client

See the `examples/dashboard/` directory for a complete HTML/JS implementation that:

- Fetches metrics from the REST API
- Displays real-time charts using Chart.js
- Updates via WebSocket connection
- Provides system health monitoring

## Security Considerations

### Authentication

- Dashboard endpoints should be protected with authentication
- Use Cloudflare Access or custom JWT validation
- WebSocket connections require authentication token

### Rate Limiting

- Limit API requests to prevent abuse
- WebSocket updates throttled to configured interval
- Query execution limited by user role

### CORS Configuration

```typescript
// Configure CORS for dashboard origin
const corsOptions = {
  origin: ['https://dashboard.evodb.io', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true,
};
```

## Deployment Options

### Self-Hosted

Deploy the dashboard as a Cloudflare Pages site or any static hosting:

```bash
cd examples/dashboard
npm run build
wrangler pages deploy dist
```

### Embedded

Include dashboard routes in your existing EvoDB worker:

```typescript
import { handleDashboardRequest } from '@evodb/dashboard';

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/dashboard')) {
      return handleDashboardRequest(request, env);
    }

    // ... rest of your worker
  }
};
```

## Future Enhancements

- [ ] Grafana integration with pre-built dashboards
- [ ] Alert configuration UI
- [ ] Query plan visualization
- [ ] Schema migration wizard
- [ ] Multi-cluster dashboard view
- [ ] Custom metric definitions
- [ ] Historical data export
