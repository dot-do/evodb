/**
 * EvoDB Multi-Tenant SaaS Example
 *
 * This example demonstrates how to build multi-tenant applications
 * using EvoDB with Cloudflare Durable Objects. Each tenant gets
 * isolated data storage with the Durable Object per tenant pattern.
 *
 * Features demonstrated:
 * - Per-tenant data isolation
 * - Durable Object per tenant pattern
 * - Tenant routing and authentication
 * - Shared schema with tenant-specific data
 * - Cross-tenant analytics (admin only)
 *
 * Architecture:
 * - Each tenant has their own Durable Object instance
 * - Tenant data is stored in R2 with tenant-prefixed paths
 * - Worker routes requests to the appropriate tenant DO
 */

import { EvoDB } from '@evodb/core';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Tenant configuration
 */
interface Tenant {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  settings: TenantSettings;
}

interface TenantSettings {
  maxUsers: number;
  maxStorage: number; // bytes
  features: string[];
}

/**
 * User within a tenant
 */
interface TenantUser {
  _id?: string;
  tenantId: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
}

/**
 * Generic tenant data item
 */
interface TenantData {
  _id?: string;
  tenantId: string;
  [key: string]: unknown;
}

// Cloudflare Worker environment bindings
export interface Env {
  // Durable Object namespace for tenant databases
  TENANT_DB: DurableObjectNamespace;

  // R2 bucket for data persistence
  DATA_BUCKET?: R2Bucket;

  // KV namespace for tenant metadata
  TENANT_META?: KVNamespace;

  // Secret for JWT validation
  JWT_SECRET?: string;
}

// ============================================================================
// Tenant Database Durable Object
// ============================================================================

/**
 * Durable Object that provides isolated database for each tenant
 *
 * Each tenant gets their own instance, ensuring:
 * - Data isolation: No cross-tenant data leakage
 * - Performance isolation: One tenant can't affect another
 * - Easy horizontal scaling: DOs are distributed automatically
 */
export class TenantDatabase implements DurableObject {
  private db: EvoDB;
  private tenantId: string = '';
  private initialized: boolean = false;
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Initialize EvoDB for this tenant
    this.db = new EvoDB({
      mode: 'development',
      // In production, use R2 with tenant-prefixed path:
      // storage: createTenantStorage(env.DATA_BUCKET, tenantId),
    });
  }

  /**
   * Initialize the tenant database
   */
  private async initialize(tenantId: string): Promise<void> {
    if (this.initialized && this.tenantId === tenantId) {
      return;
    }

    this.tenantId = tenantId;
    this.initialized = true;

    // Load tenant-specific configuration
    console.log(`Initialized TenantDatabase for tenant: ${tenantId}`);
  }

  /**
   * Handle incoming requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenantId');

    if (!tenantId) {
      return new Response('Missing tenantId', { status: 400 });
    }

    await this.initialize(tenantId);

    try {
      const path = url.pathname;
      const method = request.method;

      // Route requests to appropriate handlers
      if (path === '/users' && method === 'GET') {
        return this.listUsers();
      }
      if (path === '/users' && method === 'POST') {
        const data = await request.json() as Omit<TenantUser, '_id' | 'tenantId'>;
        return this.createUser(data);
      }
      if (path.startsWith('/users/') && method === 'GET') {
        const userId = path.split('/')[2];
        return this.getUser(userId);
      }
      if (path.startsWith('/users/') && method === 'PUT') {
        const userId = path.split('/')[2];
        const data = await request.json() as Partial<TenantUser>;
        return this.updateUser(userId, data);
      }
      if (path.startsWith('/users/') && method === 'DELETE') {
        const userId = path.split('/')[2];
        return this.deleteUser(userId);
      }

      // Generic data operations
      if (path.startsWith('/data/')) {
        const table = path.split('/')[2];
        if (method === 'GET') {
          return this.listData(table);
        }
        if (method === 'POST') {
          const data = await request.json() as Record<string, unknown>;
          return this.createData(table, data);
        }
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('TenantDatabase error:', error);
      return new Response(`Error: ${error}`, { status: 500 });
    }
  }

  // User management methods
  private async listUsers(): Promise<Response> {
    const users = await this.db.query<TenantUser>('users')
      .where('tenantId', '=', this.tenantId)
      .execute();

    return Response.json({ users, count: users.length });
  }

  private async createUser(data: Omit<TenantUser, '_id' | 'tenantId'>): Promise<Response> {
    const [user] = await this.db.insert<TenantUser>('users', {
      ...data,
      tenantId: this.tenantId,
      createdAt: new Date().toISOString(),
    });

    return Response.json({ user }, { status: 201 });
  }

  private async getUser(userId: string): Promise<Response> {
    const users = await this.db.query<TenantUser>('users')
      .where('_id', '=', userId)
      .where('tenantId', '=', this.tenantId)
      .execute();

    if (users.length === 0) {
      return new Response('User not found', { status: 404 });
    }

    return Response.json({ user: users[0] });
  }

  private async updateUser(userId: string, data: Partial<TenantUser>): Promise<Response> {
    // Ensure we don't update tenantId
    delete data.tenantId;

    const result = await this.db.update<TenantUser>(
      'users',
      { _id: userId, tenantId: this.tenantId },
      data,
      { returnDocuments: true },
    );

    if (result.modifiedCount === 0) {
      return new Response('User not found', { status: 404 });
    }

    return Response.json({ user: result.documents?.[0] });
  }

  private async deleteUser(userId: string): Promise<Response> {
    const result = await this.db.delete<TenantUser>(
      'users',
      { _id: userId, tenantId: this.tenantId },
    );

    if (result.deletedCount === 0) {
      return new Response('User not found', { status: 404 });
    }

    return Response.json({ deleted: true });
  }

  // Generic data operations
  private async listData(table: string): Promise<Response> {
    const items = await this.db.query<TenantData>(table)
      .where('tenantId', '=', this.tenantId)
      .execute();

    return Response.json({ items, count: items.length });
  }

  private async createData(table: string, data: Record<string, unknown>): Promise<Response> {
    const [item] = await this.db.insert<TenantData>(table, {
      ...data,
      tenantId: this.tenantId,
    });

    return Response.json({ item }, { status: 201 });
  }
}

// ============================================================================
// Tenant Router (Worker)
// ============================================================================

/**
 * Extract tenant ID from request
 *
 * Supports multiple strategies:
 * - Subdomain: tenant1.app.example.com
 * - Header: X-Tenant-ID
 * - Path: /api/v1/tenants/{tenantId}/...
 * - Query: ?tenantId=...
 * - JWT claim: from authorization token
 */
function extractTenantId(request: Request): string | null {
  const url = new URL(request.url);

  // Strategy 1: From header
  const headerTenantId = request.headers.get('X-Tenant-ID');
  if (headerTenantId) {
    return headerTenantId;
  }

  // Strategy 2: From subdomain
  const host = request.headers.get('Host') || '';
  const subdomain = host.split('.')[0];
  if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
    return subdomain;
  }

  // Strategy 3: From path (/tenants/{tenantId}/...)
  const pathMatch = url.pathname.match(/^\/tenants\/([^\/]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  // Strategy 4: From query parameter
  const queryTenantId = url.searchParams.get('tenantId');
  if (queryTenantId) {
    return queryTenantId;
  }

  return null;
}

/**
 * Validate tenant access
 *
 * In production, this would:
 * - Validate JWT token
 * - Check tenant membership
 * - Verify plan limits
 */
async function validateTenantAccess(
  request: Request,
  tenantId: string,
  env: Env,
): Promise<{ valid: boolean; error?: string }> {
  // For demo purposes, accept any tenantId
  // In production, validate against JWT claims and tenant membership

  // Check if tenant exists in KV
  if (env.TENANT_META) {
    const tenant = await env.TENANT_META.get(`tenant:${tenantId}`);
    if (!tenant) {
      return { valid: false, error: 'Tenant not found' };
    }
  }

  return { valid: true };
}

/**
 * Route request to tenant's Durable Object
 */
async function routeToTenant(
  request: Request,
  tenantId: string,
  env: Env,
): Promise<Response> {
  // Get tenant's Durable Object stub
  // Using tenant ID as the DO name ensures each tenant gets their own instance
  const doId = env.TENANT_DB.idFromName(tenantId);
  const stub = env.TENANT_DB.get(doId);

  // Forward the request to the tenant's DO
  const url = new URL(request.url);

  // Remove /tenants/{tenantId} prefix if present
  const cleanPath = url.pathname.replace(/^\/tenants\/[^\/]+/, '');
  url.pathname = cleanPath || '/';
  url.searchParams.set('tenantId', tenantId);

  return stub.fetch(new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
  }));
}

// ============================================================================
// API Examples
// ============================================================================

/**
 * Example: Tenant provisioning
 */
async function provisionTenant(tenantId: string, config: Partial<Tenant>, env: Env): Promise<Tenant> {
  const tenant: Tenant = {
    id: tenantId,
    name: config.name || tenantId,
    plan: config.plan || 'free',
    createdAt: new Date().toISOString(),
    settings: {
      maxUsers: config.plan === 'enterprise' ? 1000 : config.plan === 'pro' ? 100 : 5,
      maxStorage: config.plan === 'enterprise' ? 100_000_000_000 : config.plan === 'pro' ? 10_000_000_000 : 1_000_000_000,
      features: config.plan === 'enterprise'
        ? ['sso', 'audit-logs', 'api-access', 'custom-domain']
        : config.plan === 'pro'
          ? ['api-access', 'webhooks']
          : ['basic'],
    },
  };

  // Store tenant metadata in KV
  if (env.TENANT_META) {
    await env.TENANT_META.put(`tenant:${tenantId}`, JSON.stringify(tenant));
  }

  console.log(`Provisioned tenant: ${tenantId} (plan: ${tenant.plan})`);
  return tenant;
}

/**
 * Example: Cross-tenant analytics (admin only)
 */
async function getCrosstenantStats(env: Env): Promise<{
  totalTenants: number;
  planDistribution: Record<string, number>;
}> {
  // In production, this would aggregate data from all tenants
  // Only accessible to platform admins

  return {
    totalTenants: 0, // Would query tenant registry
    planDistribution: {
      free: 0,
      pro: 0,
      enterprise: 0,
    },
  };
}

// ============================================================================
// Demo Endpoint
// ============================================================================

async function runDemo(env: Env): Promise<string> {
  const output: string[] = [
    'EvoDB Multi-Tenant SaaS Example',
    '================================',
    '',
  ];

  // Demo: Provision tenants
  output.push('1. Provisioning tenants...');

  const tenant1 = await provisionTenant('acme-corp', {
    name: 'Acme Corporation',
    plan: 'pro',
  }, env);
  output.push(`   Created: ${tenant1.name} (${tenant1.plan})`);
  output.push(`   Max users: ${tenant1.settings.maxUsers}`);
  output.push(`   Features: ${tenant1.settings.features.join(', ')}`);
  output.push('');

  const tenant2 = await provisionTenant('startup-xyz', {
    name: 'Startup XYZ',
    plan: 'free',
  }, env);
  output.push(`   Created: ${tenant2.name} (${tenant2.plan})`);
  output.push(`   Max users: ${tenant2.settings.maxUsers}`);
  output.push(`   Features: ${tenant2.settings.features.join(', ')}`);
  output.push('');

  // Demo: Explain architecture
  output.push('2. Architecture Overview');
  output.push('   Each tenant gets their own Durable Object instance');
  output.push('   Data is isolated at the storage level');
  output.push('   Requests are routed based on tenant ID extraction');
  output.push('');

  // Demo: Show API usage
  output.push('3. API Usage Examples');
  output.push('');
  output.push('   Create a user:');
  output.push('   POST /tenants/acme-corp/users');
  output.push('   Header: X-Tenant-ID: acme-corp');
  output.push('   Body: { "email": "alice@acme.com", "name": "Alice", "role": "admin" }');
  output.push('');
  output.push('   List users:');
  output.push('   GET /tenants/acme-corp/users');
  output.push('');
  output.push('   Generic data:');
  output.push('   POST /tenants/acme-corp/data/projects');
  output.push('   Body: { "name": "Project Alpha", "status": "active" }');
  output.push('');

  // Demo: Tenant isolation
  output.push('4. Data Isolation');
  output.push('   - Tenant acme-corp cannot see startup-xyz data');
  output.push('   - Each DO instance has separate in-memory state');
  output.push('   - R2 paths are prefixed with tenant ID');
  output.push('   - Cross-tenant queries are only for platform admins');
  output.push('');

  return output.join('\n');
}

// ============================================================================
// Worker Entry Point
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Demo endpoint
    if (url.pathname === '/' && request.method === 'GET') {
      const demo = await runDemo(env);
      return new Response(demo, {
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Tenant provisioning (admin only)
    if (url.pathname === '/admin/tenants' && request.method === 'POST') {
      try {
        const body = await request.json() as { id: string; name?: string; plan?: string };
        const tenant = await provisionTenant(body.id, body as Partial<Tenant>, env);
        return Response.json({ tenant }, { status: 201 });
      } catch (error) {
        return new Response(`Error: ${error}`, { status: 400 });
      }
    }

    // Cross-tenant analytics (admin only)
    if (url.pathname === '/admin/stats' && request.method === 'GET') {
      const stats = await getCrosstenantStats(env);
      return Response.json(stats);
    }

    // Extract tenant ID from request
    const tenantId = extractTenantId(request);

    if (!tenantId) {
      return new Response(
        JSON.stringify({
          error: 'Missing tenant ID',
          hint: 'Provide tenant ID via X-Tenant-ID header, subdomain, or /tenants/{id}/... path',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Validate tenant access
    const validation = await validateTenantAccess(request, tenantId, env);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Route to tenant's Durable Object
    return routeToTenant(request, tenantId, env);
  },
};
