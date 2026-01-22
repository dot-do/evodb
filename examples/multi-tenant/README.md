# EvoDB Multi-Tenant SaaS Example

This example demonstrates how to build multi-tenant SaaS applications using EvoDB with Cloudflare Durable Objects. Each tenant gets isolated data storage with the "Durable Object per tenant" pattern.

## Overview

Multi-tenancy is a software architecture where a single instance serves multiple customers (tenants). This example shows how to implement secure, scalable multi-tenancy with:

- **Data Isolation**: Each tenant's data is completely separate
- **Performance Isolation**: One tenant cannot affect another's performance
- **Automatic Scaling**: Durable Objects scale horizontally
- **Edge Deployment**: Data lives close to users globally

## Architecture

```
                    ┌─────────────────────────────────┐
                    │         Edge Worker             │
                    │    (Tenant Router/Auth)         │
                    └──────────────┬──────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │  TenantDatabase │  │  TenantDatabase │  │  TenantDatabase │
    │   (Tenant A)    │  │   (Tenant B)    │  │   (Tenant C)    │
    │                 │  │                 │  │                 │
    │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │
    │  │  EvoDB    │  │  │  │  EvoDB    │  │  │  │  EvoDB    │  │
    │  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │
    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
             │                    │                    │
             ▼                    ▼                    ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    R2 Storage                               │
    │  /tenant-a/...     /tenant-b/...     /tenant-c/...         │
    └─────────────────────────────────────────────────────────────┘
```

## Features

- **Per-Tenant Durable Objects**: Each tenant gets their own DO instance
- **Tenant ID Extraction**: Multiple strategies (subdomain, header, path, JWT)
- **Plan-Based Limits**: Different features for free/pro/enterprise plans
- **Cross-Tenant Analytics**: Admin-only aggregated insights

## Project Structure

```
multi-tenant/
├── src/
│   └── index.ts    # Worker, DO, and routing logic
├── package.json    # Dependencies and scripts
├── tsconfig.json   # TypeScript configuration
├── wrangler.toml   # Cloudflare Workers configuration
└── README.md       # This file
```

## Setup

1. Install dependencies:

```bash
cd examples/multi-tenant
pnpm install
```

2. Run locally:

```bash
pnpm dev
```

3. Visit http://localhost:8787 to see the demo output

## API Reference

### Tenant Routing

Requests are routed to tenant-specific Durable Objects based on:

```
# Via header
curl -H "X-Tenant-ID: acme-corp" https://api.example.com/users

# Via path
curl https://api.example.com/tenants/acme-corp/users

# Via subdomain
curl https://acme-corp.example.com/users

# Via query parameter
curl https://api.example.com/users?tenantId=acme-corp
```

### User Management

```bash
# Create user
curl -X POST https://api.example.com/tenants/acme-corp/users \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@acme.com", "name": "Alice", "role": "admin"}'

# List users
curl https://api.example.com/tenants/acme-corp/users

# Get user
curl https://api.example.com/tenants/acme-corp/users/{userId}

# Update user
curl -X PUT https://api.example.com/tenants/acme-corp/users/{userId} \
  -H "Content-Type: application/json" \
  -d '{"role": "member"}'

# Delete user
curl -X DELETE https://api.example.com/tenants/acme-corp/users/{userId}
```

### Generic Data Operations

```bash
# Create data in any table
curl -X POST https://api.example.com/tenants/acme-corp/data/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Project Alpha", "status": "active"}'

# List data from a table
curl https://api.example.com/tenants/acme-corp/data/projects
```

### Admin Operations

```bash
# Provision new tenant
curl -X POST https://api.example.com/admin/tenants \
  -H "Content-Type: application/json" \
  -d '{"id": "new-tenant", "name": "New Tenant Inc", "plan": "pro"}'

# Get cross-tenant stats
curl https://api.example.com/admin/stats
```

## Code Examples

### Tenant Database Durable Object

```typescript
export class TenantDatabase implements DurableObject {
  private db: EvoDB;
  private tenantId: string = '';

  constructor(state: DurableObjectState, env: Env) {
    this.db = new EvoDB({ mode: 'development' });
  }

  async fetch(request: Request): Promise<Response> {
    // All operations are automatically scoped to this tenant
    const users = await this.db.query('users')
      .where('tenantId', '=', this.tenantId)
      .execute();

    return Response.json({ users });
  }
}
```

### Routing to Tenant

```typescript
async function routeToTenant(request: Request, tenantId: string, env: Env) {
  // Get tenant's DO - using tenantId as name ensures isolation
  const doId = env.TENANT_DB.idFromName(tenantId);
  const stub = env.TENANT_DB.get(doId);

  return stub.fetch(request);
}
```

### Tenant Provisioning

```typescript
async function provisionTenant(tenantId: string, plan: string, env: Env) {
  const tenant = {
    id: tenantId,
    plan,
    settings: getPlanLimits(plan),
    createdAt: new Date().toISOString(),
  };

  // Store in KV for fast lookups
  await env.TENANT_META.put(`tenant:${tenantId}`, JSON.stringify(tenant));

  return tenant;
}
```

## Plan Configurations

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Max Users | 5 | 100 | 1000 |
| Storage | 1 GB | 10 GB | 100 GB |
| API Access | - | Yes | Yes |
| SSO | - | - | Yes |
| Audit Logs | - | - | Yes |
| Custom Domain | - | - | Yes |

## Security Considerations

### Authentication

```typescript
// Validate JWT token
const token = request.headers.get('Authorization')?.replace('Bearer ', '');
const payload = await verifyJWT(token, env.JWT_SECRET);

// Check tenant membership
if (payload.tenantId !== requestedTenantId) {
  return new Response('Forbidden', { status: 403 });
}
```

### Data Isolation

1. **DO-level isolation**: Each tenant has separate DO instance
2. **Query-level filtering**: All queries include `tenantId` filter
3. **Storage-level prefixing**: R2 paths include tenant ID
4. **Validation**: Never trust client-provided tenant ID without auth

### Plan Enforcement

```typescript
async function checkPlanLimits(tenantId: string, action: string, env: Env) {
  const tenant = await getTenant(tenantId, env);

  if (action === 'create_user') {
    const userCount = await getUserCount(tenantId);
    if (userCount >= tenant.settings.maxUsers) {
      throw new Error(`User limit reached (${tenant.plan} plan)`);
    }
  }
}
```

## Production Deployment

1. **Create KV namespace**:

```bash
wrangler kv:namespace create TENANT_META
```

2. **Create R2 bucket**:

```bash
wrangler r2 bucket create evodb-tenant-data
```

3. **Set secrets**:

```bash
wrangler secret put JWT_SECRET
```

4. **Update wrangler.toml** with namespace/bucket IDs

5. **Deploy**:

```bash
pnpm deploy
```

## Scaling Considerations

### When to Use This Pattern

- Tenants have isolated data
- Each tenant has moderate data size
- Strong isolation requirements
- Global user base

### When to Consider Alternatives

- Very small tenants (use shared database with row-level security)
- Very large tenants (use dedicated infrastructure)
- Complex cross-tenant queries needed frequently

### Performance Tips

1. **Cache tenant metadata** in KV for fast lookups
2. **Use DO alarms** for background processing
3. **Implement request coalescing** for batch operations
4. **Monitor DO hibernation** to optimize costs

## Learn More

- [EvoDB Documentation](https://github.com/dot-do/evodb)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)
- [Multi-tenant SaaS Patterns](https://docs.microsoft.com/en-us/azure/sql-database/saas-tenancy-app-design-patterns)
- [Cloudflare Workers KV](https://developers.cloudflare.com/workers/runtime-apis/kv/)
