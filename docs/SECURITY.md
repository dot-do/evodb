# Security Model

This document describes the security model, best practices, and guidelines for EvoDB.

## Input Validation

### Column Name Validation (SQL Injection Prevention)

EvoDB validates all column names to prevent SQL injection attacks:

```typescript
// Column names must match: ^[a-zA-Z_][a-zA-Z0-9_]*$
// This prevents injection of SQL keywords or special characters
const VALID_COLUMN_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateColumnName(name: string): boolean {
  return VALID_COLUMN_NAME.test(name) && name.length <= 64;
}
```

**Protected Against:**
- SQL injection via column names
- Unicode normalization attacks
- Null byte injection
- Command injection through identifiers

### Path Validation (Traversal Prevention)

All file and object paths are validated to prevent directory traversal:

```typescript
// Paths are normalized and checked for traversal attempts
function validatePath(path: string): boolean {
  const normalized = path.normalize();
  return !normalized.includes('..') &&
         !normalized.startsWith('/') &&
         !path.includes('\0');
}
```

**Protected Against:**
- Directory traversal (`../../../etc/passwd`)
- Null byte path truncation
- Absolute path injection
- Symbolic link attacks

### Type Coercion and Sanitization

All input values are strictly typed and sanitized:

- **Strings**: Validated for length limits, trimmed of control characters
- **Numbers**: Parsed with bounds checking, NaN/Infinity handling
- **Booleans**: Strict true/false coercion
- **Dates**: ISO 8601 format validation
- **JSON**: Schema validation where applicable

## Access Control

### Row-Level Security Patterns (Future)

EvoDB is designed to support row-level security (RLS) in future versions:

```typescript
// Planned RLS API
interface RowSecurityPolicy {
  table: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  check: (row: Record<string, unknown>, context: SecurityContext) => boolean;
}

// Example policy: users can only access their own data
const userDataPolicy: RowSecurityPolicy = {
  table: 'user_data',
  operation: 'SELECT',
  check: (row, ctx) => row.user_id === ctx.userId
};
```

### Durable Object Isolation Model

Each EvoDB instance runs in an isolated Durable Object:

- **Memory Isolation**: Each DO has its own memory space
- **Storage Isolation**: SQLite storage is per-DO
- **Execution Isolation**: No shared state between DOs
- **Crash Isolation**: Failures don't propagate across DOs

```
┌─────────────────────────────────────────────────────┐
│                  Cloudflare Edge                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │    DO 1     │  │    DO 2     │  │    DO 3     │  │
│  │  ┌───────┐  │  │  ┌───────┐  │  │  ┌───────┐  │  │
│  │  │SQLite │  │  │  │SQLite │  │  │  │SQLite │  │  │
│  │  └───────┘  │  │  └───────┘  │  │  └───────┘  │  │
│  │  Isolated   │  │  Isolated   │  │  Isolated   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Multi-Tenant Security Boundaries

For multi-tenant deployments, EvoDB provides strong isolation:

1. **Namespace Isolation**: Each tenant gets a unique DO namespace
2. **Data Isolation**: No cross-tenant data access possible
3. **Resource Isolation**: CPU/memory limits per DO
4. **Network Isolation**: No direct DO-to-DO communication

```typescript
// Tenant isolation pattern
function getTenantDB(tenantId: string): DurableObjectStub {
  // Each tenant gets a unique, deterministic DO ID
  const id = env.EVODB.idFromName(`tenant:${tenantId}`);
  return env.EVODB.get(id);
}
```

## Data Protection

### Encryption at Rest (R2 Server-Side Encryption)

All data stored in R2 is encrypted at rest:

- **Algorithm**: AES-256-GCM
- **Key Management**: Cloudflare-managed keys (default) or customer-managed keys
- **Scope**: All objects in R2 buckets

```typescript
// R2 encryption is automatic and transparent
await r2.put('backup/snapshot.db', data);
// Data is encrypted before being written to disk
```

### Encryption in Transit (HTTPS/TLS)

All network communication is encrypted:

- **External Traffic**: TLS 1.3 for all HTTPS connections
- **Internal Traffic**: Encrypted communication between Cloudflare services
- **Certificate Management**: Automatic certificate provisioning and renewal

### Sensitive Data Handling

Guidelines for handling sensitive data in EvoDB:

```typescript
// DON'T: Store sensitive data in plain text
await db.insert('users', { password: 'plaintext' }); // Bad!

// DO: Hash sensitive data before storage
import { hash } from 'crypto';
await db.insert('users', {
  password_hash: await hash('sha256', password + salt)
});

// DO: Use column-level encryption for PII
await db.insert('users', {
  email_encrypted: await encrypt(email, encryptionKey)
});
```

**Recommendations:**
- Never store plaintext passwords
- Encrypt PII at the application level
- Use separate encryption keys per tenant
- Implement key rotation procedures

## Security Best Practices

### Environment Variable Management

```typescript
// Access secrets through environment bindings
export default {
  async fetch(request: Request, env: Env) {
    // Good: Access secrets from env
    const apiKey = env.API_KEY;

    // Bad: Hardcoded secrets
    const apiKey = 'sk-1234567890'; // Never do this!
  }
};
```

**Guidelines:**
- Store secrets in Cloudflare Workers secrets
- Never commit secrets to version control
- Use different secrets for dev/staging/production
- Audit secret access regularly

### Secret Rotation

Implement regular secret rotation:

```typescript
// Support multiple API keys during rotation
const VALID_API_KEYS = [
  env.API_KEY_CURRENT,
  env.API_KEY_PREVIOUS  // Still valid during rotation window
];

function validateApiKey(key: string): boolean {
  return VALID_API_KEYS.includes(key);
}
```

**Rotation Schedule:**
- API keys: Quarterly or after suspected compromise
- Encryption keys: Annually with re-encryption
- Database credentials: Monthly

### Audit Logging Patterns

Implement comprehensive audit logging:

```typescript
interface AuditLog {
  timestamp: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  table: string;
  rowId: string;
  userId: string;
  ipAddress: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
}

async function logAuditEvent(db: EvoDB, event: AuditLog): Promise<void> {
  await db.insert('_audit_log', {
    ...event,
    timestamp: new Date().toISOString()
  });
}

// Usage
await logAuditEvent(db, {
  timestamp: new Date().toISOString(),
  action: 'UPDATE',
  table: 'users',
  rowId: '123',
  userId: ctx.userId,
  ipAddress: request.headers.get('CF-Connecting-IP') || 'unknown',
  changes: {
    email: { old: 'old@example.com', new: 'new@example.com' }
  }
});
```

**What to Log:**
- All data modifications (INSERT, UPDATE, DELETE)
- Authentication attempts (success and failure)
- Authorization failures
- Configuration changes
- Admin actions

## Vulnerability Reporting

### How to Report Security Issues

If you discover a security vulnerability in EvoDB, please report it responsibly:

1. **Email**: Send details to security@evodb.dev (or the maintainer's security contact)
2. **Subject**: Use "[SECURITY] Brief description of issue"
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Any suggested fixes (optional)

**Do NOT:**
- Open public GitHub issues for security vulnerabilities
- Disclose vulnerabilities publicly before they're fixed
- Test vulnerabilities on production systems you don't own

### Response Timeline

We are committed to addressing security issues promptly:

| Severity | Initial Response | Fix Target |
|----------|-----------------|------------|
| Critical | 24 hours | 48 hours |
| High | 48 hours | 7 days |
| Medium | 7 days | 30 days |
| Low | 14 days | 90 days |

### Disclosure Policy

We follow a coordinated disclosure process:

1. **Report Received**: Acknowledge receipt within the response timeline
2. **Triage**: Assess severity and assign resources
3. **Fix Development**: Develop and test the fix
4. **Release**: Deploy fix to all affected versions
5. **Disclosure**: Public disclosure after fix is available (typically 90 days max)

**Credit**: Security researchers who report valid vulnerabilities will be credited in our security advisories (unless they prefer to remain anonymous).

---

## Security Checklist

Before deploying EvoDB to production, verify:

- [ ] All secrets are stored in environment variables, not code
- [ ] HTTPS is enforced for all endpoints
- [ ] Input validation is enabled for all user inputs
- [ ] Audit logging is configured and monitored
- [ ] Backup encryption is enabled
- [ ] Access controls are properly configured
- [ ] Rate limiting is in place
- [ ] Error messages don't leak sensitive information
- [ ] Dependencies are up to date and vulnerability-free
