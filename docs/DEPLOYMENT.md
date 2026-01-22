# Cloudflare Workers Deployment Guide

This guide covers deploying EvoDB to Cloudflare Workers with Durable Objects and R2 storage.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Durable Objects Setup](#durable-objects-setup)
4. [R2 Storage Setup](#r2-storage-setup)
5. [Deployment](#deployment)
6. [Monitoring](#monitoring)

---

## Prerequisites

### Cloudflare Account Setup

1. **Create a Cloudflare account** at [dash.cloudflare.com](https://dash.cloudflare.com)

2. **Enable Workers Paid plan** (required for Durable Objects)
   - Navigate to Workers & Pages > Plans
   - Subscribe to the Workers Paid plan ($5/month base)

3. **Verify your account** has access to:
   - Workers (included)
   - Durable Objects (requires paid plan)
   - R2 Storage (included, pay per usage)

### Wrangler CLI Installation

Install Wrangler globally:

```bash
npm install -g wrangler
```

Or use npx for per-project usage:

```bash
npx wrangler --version
```

Authenticate with Cloudflare:

```bash
wrangler login
```

This opens a browser window for OAuth authentication. After successful login, your credentials are stored locally.

### R2 Bucket Creation

Create an R2 bucket via the CLI:

```bash
wrangler r2 bucket create evodb-lakehouse
```

Or via the Cloudflare dashboard:

1. Navigate to R2 > Create bucket
2. Name: `evodb-lakehouse`
3. Location hint: Choose your preferred region (or auto)

Verify the bucket was created:

```bash
wrangler r2 bucket list
```

---

## Project Setup

### wrangler.toml Configuration

Create a `wrangler.toml` file in your project root:

```toml
name = "evodb-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

# Account ID (find in Cloudflare dashboard)
account_id = "your-account-id-here"

# R2 Bucket binding
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "evodb-lakehouse"

# Durable Object bindings
[durable_objects]
bindings = [
  { name = "LAKEHOUSE_PARENT", class_name = "LakehouseParentDO" },
  { name = "USER_DATABASE", class_name = "UserDatabaseDO" }
]

# Durable Object migrations
[[migrations]]
tag = "v1"
new_classes = ["LakehouseParentDO", "UserDatabaseDO"]

# Environment variables (non-sensitive)
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"

# Routes (optional - for custom domains)
# routes = [
#   { pattern = "api.example.com/*", zone_name = "example.com" }
# ]
```

### Environment Variables and Secrets

For sensitive values, use secrets instead of vars:

```bash
# Set secrets via CLI
wrangler secret put DATABASE_ENCRYPTION_KEY
wrangler secret put API_SECRET_KEY

# List secrets
wrangler secret list

# Delete a secret
wrangler secret delete SECRET_NAME
```

Access secrets in your worker:

```typescript
export interface Env {
  R2_BUCKET: R2Bucket;
  LAKEHOUSE_PARENT: DurableObjectNamespace;
  USER_DATABASE: DurableObjectNamespace;

  // Variables from [vars]
  ENVIRONMENT: string;
  LOG_LEVEL: string;

  // Secrets (set via wrangler secret put)
  DATABASE_ENCRYPTION_KEY: string;
  API_SECRET_KEY: string;
}
```

### TypeScript Configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Install required types:

```bash
npm install --save-dev @cloudflare/workers-types typescript
```

---

## Durable Objects Setup

### DO Class Definitions

Create your Durable Object classes in `src/durable-objects/`:

**src/durable-objects/lakehouse-parent.ts**

```typescript
import { LakehouseParentDO as BaseLakehouseParentDO } from '@evodb/writer';
import type { PartitionMode, WriterOptions } from '@evodb/writer';

export interface ParentDOEnv {
  R2_BUCKET: R2Bucket;
}

/**
 * Lakehouse Parent DO - aggregates CDC from child DOs
 * and writes columnar blocks to R2
 */
export class LakehouseParentDO extends BaseLakehouseParentDO {
  protected getTableLocation(): string {
    // Extract table location from DO name or use default
    return 'com/example/api/events';
  }

  protected getPartitionMode(): PartitionMode {
    // Choose partition mode based on your use case:
    // - 'do-sqlite': 2MB blocks, optimized for DO SQLite storage
    // - 'edge-cache': 500MB blocks, optimized for edge caching
    // - 'enterprise': 5GB blocks, for enterprise edge cache
    return 'do-sqlite';
  }

  protected getWriterOptions(): Partial<WriterOptions> {
    return {
      bufferSize: 10000,      // Max entries before auto-flush
      bufferTimeout: 5000,    // Max ms before auto-flush
      minCompactBlocks: 4,    // Min small blocks to trigger compaction
      maxRetries: 3,          // R2 write retry attempts
      retryBackoffMs: 100,    // Retry backoff base
    };
  }

  // Override callbacks for custom behavior
  protected async onFlush(result: FlushResult): Promise<void> {
    console.log(`Flushed ${result.entryCount} entries to ${result.block?.r2Key}`);
  }

  protected async onCompact(result: CompactResult): Promise<void> {
    console.log(`Compacted ${result.blocksMerged} blocks`);
  }
}
```

**src/durable-objects/user-database.ts**

```typescript
import { EvoDB } from '@evodb/core';

export interface UserDBEnv {
  R2_BUCKET: R2Bucket;
  LAKEHOUSE_PARENT: DurableObjectNamespace;
}

/**
 * User Database DO - per-user SQLite database
 * with CDC streaming to parent lakehouse
 */
export class UserDatabaseDO implements DurableObject {
  private state: DurableObjectState;
  private env: UserDBEnv;
  private db: EvoDB;

  constructor(state: DurableObjectState, env: UserDBEnv) {
    this.state = state;
    this.env = env;

    this.db = new EvoDB({
      mode: 'production',
      storage: this.state.storage,
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case '/query':
          return this.handleQuery(request);
        case '/insert':
          return this.handleInsert(request);
        case '/health':
          return Response.json({ status: 'healthy' });
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('DO Error:', error);
      return Response.json(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  }

  private async handleQuery(request: Request): Promise<Response> {
    const { table, filters } = await request.json();
    const results = await this.db.query(table).execute();
    return Response.json(results);
  }

  private async handleInsert(request: Request): Promise<Response> {
    const { table, data } = await request.json();
    const result = await this.db.insert(table, data);
    return Response.json(result, { status: 201 });
  }
}
```

### Bindings Configuration

The `wrangler.toml` bindings connect your Worker to DOs:

```toml
[durable_objects]
bindings = [
  # Parent DO for lakehouse writes
  { name = "LAKEHOUSE_PARENT", class_name = "LakehouseParentDO" },

  # Per-user database DOs
  { name = "USER_DATABASE", class_name = "UserDatabaseDO" }
]
```

Access DOs from your Worker:

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Get or create a user-specific DO
    const userId = url.searchParams.get('userId') ?? 'default';
    const userDbId = env.USER_DATABASE.idFromName(userId);
    const userDb = env.USER_DATABASE.get(userDbId);

    // Forward request to DO
    return userDb.fetch(request);
  }
};
```

### Migrations

Durable Object migrations are required when adding, renaming, or deleting DO classes:

```toml
# Initial deployment - creates new classes
[[migrations]]
tag = "v1"
new_classes = ["LakehouseParentDO", "UserDatabaseDO"]

# Adding a new class later
[[migrations]]
tag = "v2"
new_classes = ["AnalyticsDO"]

# Renaming a class
[[migrations]]
tag = "v3"
renamed_classes = [
  { from = "OldClassName", to = "NewClassName" }
]

# Deleting a class (data is lost!)
[[migrations]]
tag = "v4"
deleted_classes = ["DeprecatedDO"]
```

**Important**: Never remove or reorder existing migrations. Only add new ones.

---

## R2 Storage Setup

### Bucket Creation

Create buckets for different purposes:

```bash
# Main lakehouse storage
wrangler r2 bucket create evodb-lakehouse

# Optional: separate bucket for backups
wrangler r2 bucket create evodb-backups

# Optional: bucket for staging environment
wrangler r2 bucket create evodb-lakehouse-staging
```

### CORS Configuration

Configure CORS if accessing R2 from browsers:

Create `cors-rules.json`:

```json
{
  "cors": [
    {
      "allowedOrigins": ["https://app.example.com"],
      "allowedMethods": ["GET", "HEAD"],
      "allowedHeaders": ["*"],
      "exposeHeaders": ["Content-Length", "ETag"],
      "maxAgeSeconds": 3600
    }
  ]
}
```

Apply CORS rules (via dashboard or API - CLI support pending):

1. Navigate to R2 > Your bucket > Settings
2. Add CORS rules

### Binding to Workers

Multiple bucket bindings in `wrangler.toml`:

```toml
# Primary lakehouse bucket
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "evodb-lakehouse"

# Optional: read-only binding with prefix
[[r2_buckets]]
binding = "R2_ARCHIVE"
bucket_name = "evodb-lakehouse"
# Note: prefix filtering happens in code, not config

# Preview bucket for staging
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "evodb-lakehouse-staging"
preview_bucket_name = "evodb-lakehouse-staging"
```

Use R2 in your Worker:

```typescript
import { R2Storage, createStorage } from '@evodb/core';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Create storage adapter
    const storage = createStorage(env.R2_BUCKET, 'tables/users');

    // Write data
    await storage.write('block-001.evodb', blockData);

    // Read data
    const data = await storage.read('block-001.evodb');

    // List objects
    const { paths } = await storage.list('block-');

    return Response.json({ paths });
  }
};
```

---

## Deployment

### Development Mode (wrangler dev)

Start local development server:

```bash
# Basic local dev
wrangler dev

# With local persistence for DOs
wrangler dev --persist

# Specify a port
wrangler dev --port 8787

# Enable remote mode (uses real Cloudflare network)
wrangler dev --remote
```

Local development features:

- Hot reload on file changes
- Local Durable Object persistence (with `--persist`)
- Simulated R2 (local file storage)
- Access at `http://localhost:8787`

Test your local deployment:

```bash
# Health check
curl http://localhost:8787/health

# Insert data
curl -X POST http://localhost:8787/insert \
  -H "Content-Type: application/json" \
  -d '{"table": "users", "data": {"name": "Alice"}}'

# Query data
curl http://localhost:8787/query?table=users
```

### Production Deployment (wrangler deploy)

Deploy to production:

```bash
# Deploy to production
wrangler deploy

# Deploy with verbose output
wrangler deploy --dry-run  # Preview changes
wrangler deploy            # Actually deploy
```

Verify deployment:

```bash
# Check deployment status
wrangler deployments list

# View deployment details
wrangler deployments view

# Tail production logs
wrangler tail
```

### Environment Management (staging/production)

Configure multiple environments in `wrangler.toml`:

```toml
name = "evodb-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

# Shared Durable Object configuration
[durable_objects]
bindings = [
  { name = "LAKEHOUSE_PARENT", class_name = "LakehouseParentDO" },
  { name = "USER_DATABASE", class_name = "UserDatabaseDO" }
]

[[migrations]]
tag = "v1"
new_classes = ["LakehouseParentDO", "UserDatabaseDO"]

# ============================================
# Production Environment (default)
# ============================================
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "warn"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "evodb-lakehouse"

# ============================================
# Staging Environment
# ============================================
[env.staging]
name = "evodb-worker-staging"

[env.staging.vars]
ENVIRONMENT = "staging"
LOG_LEVEL = "debug"

[[env.staging.r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "evodb-lakehouse-staging"

# ============================================
# Development Environment
# ============================================
[env.dev]
name = "evodb-worker-dev"

[env.dev.vars]
ENVIRONMENT = "development"
LOG_LEVEL = "debug"

[[env.dev.r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "evodb-lakehouse-dev"
```

Deploy to specific environments:

```bash
# Deploy to staging
wrangler deploy --env staging

# Deploy to dev
wrangler deploy --env dev

# Deploy to production (default)
wrangler deploy

# Set secrets per environment
wrangler secret put API_KEY --env staging
wrangler secret put API_KEY --env production
```

---

## Monitoring

### Cloudflare Analytics

Access analytics via the Cloudflare dashboard:

1. Navigate to Workers & Pages > Your Worker > Analytics
2. View metrics:
   - Request count
   - CPU time
   - Duration percentiles
   - Error rates
   - Geographic distribution

### Error Tracking

Implement structured error logging:

```typescript
import type { Logger } from '@evodb/core';

function createLogger(env: Env): Logger {
  return {
    debug: (msg, ctx) => {
      if (env.LOG_LEVEL === 'debug') {
        console.log(JSON.stringify({ level: 'debug', msg, ...ctx }));
      }
    },
    info: (msg, ctx) => console.log(JSON.stringify({ level: 'info', msg, ...ctx })),
    warn: (msg, ctx) => console.warn(JSON.stringify({ level: 'warn', msg, ...ctx })),
    error: (msg, ctx) => console.error(JSON.stringify({ level: 'error', msg, ...ctx })),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const logger = createLogger(env);
    const requestId = crypto.randomUUID();

    logger.info('Request received', {
      requestId,
      method: request.method,
      url: request.url,
    });

    try {
      const response = await handleRequest(request, env, logger);

      logger.info('Request completed', {
        requestId,
        status: response.status,
      });

      return response;
    } catch (error) {
      logger.error('Request failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return Response.json(
        { error: 'Internal Server Error', requestId },
        { status: 500 }
      );
    }
  }
};
```

View logs with wrangler:

```bash
# Tail logs in real-time
wrangler tail

# Filter by status
wrangler tail --status error

# Filter by method
wrangler tail --method POST

# Filter by search term
wrangler tail --search "database"

# Tail staging environment
wrangler tail --env staging
```

### Performance Monitoring

Track performance metrics in your Worker:

```typescript
interface PerformanceMetrics {
  requestId: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  doFetchCount: number;
  r2ReadCount: number;
  r2WriteCount: number;
  cacheHits: number;
  cacheMisses: number;
}

function createMetricsTracker(requestId: string): PerformanceMetrics {
  return {
    requestId,
    startTime: Date.now(),
    doFetchCount: 0,
    r2ReadCount: 0,
    r2WriteCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const metrics = createMetricsTracker(crypto.randomUUID());

    try {
      const response = await handleRequest(request, env, metrics);

      metrics.endTime = Date.now();
      metrics.durationMs = metrics.endTime - metrics.startTime;

      // Log metrics
      console.log(JSON.stringify({
        type: 'metrics',
        ...metrics,
      }));

      // Optionally add metrics to response headers
      const headers = new Headers(response.headers);
      headers.set('X-Request-ID', metrics.requestId);
      headers.set('X-Duration-Ms', String(metrics.durationMs));

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (error) {
      throw error;
    }
  }
};
```

### Health Checks

Implement health check endpoints:

```typescript
async function handleHealth(env: Env): Promise<Response> {
  const checks: Record<string, 'ok' | 'error'> = {};

  // Check R2 connectivity
  try {
    await env.R2_BUCKET.head('health-check');
    checks.r2 = 'ok';
  } catch {
    checks.r2 = 'ok'; // 404 is fine, means bucket is accessible
  }

  // Check DO connectivity
  try {
    const doId = env.LAKEHOUSE_PARENT.idFromName('health-check');
    const stub = env.LAKEHOUSE_PARENT.get(doId);
    const response = await stub.fetch('http://internal/health');
    checks.durableObjects = response.ok ? 'ok' : 'error';
  } catch {
    checks.durableObjects = 'error';
  }

  const allHealthy = Object.values(checks).every(v => v === 'ok');

  return Response.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allHealthy ? 200 : 503 }
  );
}
```

### Alerting

Set up alerts via Cloudflare dashboard or integrate with external services:

```typescript
// Example: Send alerts to external webhook
async function sendAlert(message: string, severity: 'info' | 'warning' | 'critical'): Promise<void> {
  const webhookUrl = 'https://hooks.example.com/alerts';

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      severity,
      timestamp: new Date().toISOString(),
      source: 'evodb-worker',
    }),
  });
}

// Use in error handling
try {
  await riskyOperation();
} catch (error) {
  await sendAlert(`Operation failed: ${error}`, 'critical');
  throw error;
}
```

---

## Troubleshooting

### Common Issues

**DO class not found**

```
Error: Durable Object class 'MyDO' not found
```

Solution: Ensure the class is exported from your main entry point and listed in migrations.

**R2 bucket not found**

```
Error: R2 bucket 'bucket-name' not found
```

Solution: Create the bucket with `wrangler r2 bucket create bucket-name`.

**Migration errors**

```
Error: Migration tag 'v1' already exists
```

Solution: Create a new migration with a new tag (v2, v3, etc.).

### Debug Mode

Enable verbose logging for debugging:

```bash
# Enable debug logging
WRANGLER_LOG=debug wrangler dev

# Or set in wrangler.toml
[vars]
LOG_LEVEL = "debug"
```

### Support Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Documentation](https://developers.cloudflare.com/durable-objects/)
- [R2 Documentation](https://developers.cloudflare.com/r2/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [EvoDB GitHub Issues](https://github.com/dot-do/evodb/issues)
