/**
 * Tests for EvoDB facade class
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EvoDB,
  EvoDBError,
  QueryBuilder,
  type EvoDBConfig,
  type SchemaDefinition,
  type EvoDBStorageBucket,
} from '../evodb.js';

// =============================================================================
// Mock Storage
// =============================================================================

function createMockStorage(): EvoDBStorageBucket {
  const storage = new Map<string, { data: string; metadata?: Record<string, string> }>();

  return {
    async get(key: string) {
      const item = storage.get(key);
      if (!item) return null;
      return {
        key,
        size: item.data.length,
        etag: 'mock-etag',
        async arrayBuffer() {
          return new TextEncoder().encode(item.data).buffer;
        },
      };
    },
    async put(key: string, data: ArrayBuffer | Uint8Array | string, options?: { customMetadata?: Record<string, string> }) {
      const strData = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
      storage.set(key, { data: strData, metadata: options?.customMetadata });
      return {
        key,
        size: strData.length,
        etag: 'mock-etag',
        async arrayBuffer() {
          return new TextEncoder().encode(strData).buffer;
        },
      };
    },
    async delete(key: string | string[]) {
      const keys = Array.isArray(key) ? key : [key];
      for (const k of keys) {
        storage.delete(k);
      }
    },
    async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
      const prefix = options?.prefix ?? '';
      const objects = Array.from(storage.entries())
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => ({
          key: k,
          size: v.data.length,
          etag: 'mock-etag',
          async arrayBuffer() {
            return new TextEncoder().encode(v.data).buffer;
          },
        }));
      return {
        objects,
        truncated: false,
        cursor: undefined,
      };
    },
  };
}

// =============================================================================
// Basic Operations Tests
// =============================================================================

describe('EvoDB', () => {
  let db: EvoDB;

  beforeEach(() => {
    db = new EvoDB({ mode: 'development' });
  });

  describe('constructor', () => {
    it('should create instance with development mode', () => {
      const devDb = new EvoDB({ mode: 'development' });
      expect(devDb.getMode()).toBe('development');
    });

    it('should create instance with production mode', () => {
      const prodDb = new EvoDB({ mode: 'production' });
      expect(prodDb.getMode()).toBe('production');
    });

    it('should create instance with storage', () => {
      const storage = createMockStorage();
      const dbWithStorage = new EvoDB({ mode: 'development', storage });
      expect(dbWithStorage.getMode()).toBe('development');
    });
  });

  describe('insert', () => {
    it('should insert a single document', async () => {
      const result = await db.insert('users', { name: 'Alice', email: 'alice@example.com' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice');
      expect(result[0].email).toBe('alice@example.com');
      expect(result[0]._id).toBeDefined();
    });

    it('should insert multiple documents', async () => {
      const result = await db.insert('users', [
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob', email: 'bob@example.com' },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Bob');
    });

    it('should preserve existing _id', async () => {
      const result = await db.insert('users', { _id: 'custom-id', name: 'Alice' });

      expect(result[0]._id).toBe('custom-id');
    });

    it('should handle nested objects', async () => {
      const result = await db.insert('users', {
        name: 'Alice',
        address: { city: 'NYC', zip: '10001' },
      });

      expect(result[0].address).toEqual({ city: 'NYC', zip: '10001' });
    });

    it('should handle arrays', async () => {
      const result = await db.insert('posts', {
        title: 'Hello',
        tags: ['intro', 'welcome'],
      });

      expect(result[0].tags).toEqual(['intro', 'welcome']);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await db.insert('users', [
        { name: 'Alice', age: 30, role: 'admin' },
        { name: 'Bob', age: 25, role: 'user' },
        { name: 'Charlie', age: 35, role: 'user' },
        { name: 'Diana', age: 28, role: 'admin' },
      ]);
    });

    it('should return all documents without filters', async () => {
      const results = await db.query('users');

      expect(results).toHaveLength(4);
    });

    it('should filter with where clause', async () => {
      const results = await db.query('users').where('role', '=', 'admin');

      expect(results).toHaveLength(2);
      expect(results.every(r => r.role === 'admin')).toBe(true);
    });

    it('should filter with multiple where clauses', async () => {
      const results = await db
        .query('users')
        .where('role', '=', 'user')
        .where('age', '>', 26);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Charlie');
    });

    it('should select specific columns', async () => {
      const results = await db.query('users').select(['name', 'role']);

      expect(results).toHaveLength(4);
      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('role');
      expect(results[0]).not.toHaveProperty('age');
    });

    it('should sort results ascending', async () => {
      const results = await db.query<{ name: string; age: number }>('users').orderBy('age', 'asc');

      expect(results[0].name).toBe('Bob');
      expect(results[3].name).toBe('Charlie');
    });

    it('should sort results descending', async () => {
      const results = await db.query<{ name: string; age: number }>('users').orderBy('age', 'desc');

      expect(results[0].name).toBe('Charlie');
      expect(results[3].name).toBe('Bob');
    });

    it('should limit results', async () => {
      const results = await db.query('users').limit(2);

      expect(results).toHaveLength(2);
    });

    it('should offset results', async () => {
      const results = await db.query('users').orderBy('age', 'asc').offset(1).limit(2);

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Diana'); // age 28
      expect(results[1].name).toBe('Alice'); // age 30
    });

    it('should support greater than operator', async () => {
      const results = await db.query('users').where('age', '>', 28);

      expect(results).toHaveLength(2);
    });

    it('should support less than operator', async () => {
      const results = await db.query('users').where('age', '<', 28);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Bob');
    });

    it('should support not equal operator', async () => {
      const results = await db.query('users').where('role', '!=', 'admin');

      expect(results).toHaveLength(2);
    });

    it('should support in operator', async () => {
      const results = await db.query('users').where('name', 'in', ['Alice', 'Bob']);

      expect(results).toHaveLength(2);
    });

    it('should support like operator', async () => {
      const results = await db.query('users').where('name', 'like', 'A%');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alice');
    });

    it('should execute with metadata', async () => {
      const result = await db.query('users').limit(2).executeWithMeta();

      expect(result.rows).toHaveLength(2);
      expect(result.totalCount).toBe(4);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('aggregations', () => {
    beforeEach(async () => {
      await db.insert('orders', [
        { product: 'Widget', quantity: 10, price: 100 },
        { product: 'Widget', quantity: 5, price: 100 },
        { product: 'Gadget', quantity: 3, price: 200 },
        { product: 'Gadget', quantity: 7, price: 200 },
      ]);
    });

    it('should count rows', async () => {
      const results = await db
        .query('orders')
        .aggregate('count', null, 'total')
        .execute();

      expect(results).toHaveLength(1);
      expect(results[0].total).toBe(4);
    });

    it('should sum values', async () => {
      const results = await db
        .query('orders')
        .aggregate('sum', 'quantity', 'totalQty')
        .execute();

      expect(results).toHaveLength(1);
      expect(results[0].totalQty).toBe(25);
    });

    it('should calculate average', async () => {
      const results = await db
        .query('orders')
        .aggregate('avg', 'quantity', 'avgQty')
        .execute();

      expect(results).toHaveLength(1);
      expect(results[0].avgQty).toBeCloseTo(6.25);
    });

    it('should find min and max', async () => {
      const results = await db
        .query('orders')
        .aggregate('min', 'quantity', 'minQty')
        .aggregate('max', 'quantity', 'maxQty')
        .execute();

      expect(results).toHaveLength(1);
      expect(results[0].minQty).toBe(3);
      expect(results[0].maxQty).toBe(10);
    });

    it('should group by column', async () => {
      const results = await db
        .query('orders')
        .aggregate('sum', 'quantity', 'totalQty')
        .groupBy(['product'])
        .execute();

      expect(results).toHaveLength(2);
      const widget = results.find(r => r.product === 'Widget');
      const gadget = results.find(r => r.product === 'Gadget');
      expect(widget?.totalQty).toBe(15);
      expect(gadget?.totalQty).toBe(10);
    });
  });
});

// =============================================================================
// Schema Manager Tests
// =============================================================================

describe('SchemaManager', () => {
  let db: EvoDB;

  beforeEach(() => {
    db = new EvoDB({ mode: 'production' });
  });

  describe('lock', () => {
    it('should lock a schema', async () => {
      const schema: SchemaDefinition = {
        name: { type: 'string', required: true },
        email: { type: 'string', format: 'email', required: true },
      };

      await db.schema.lock('users', schema);

      expect(db.schema.isLocked('users')).toBe(true);
      expect(db.schema.getLockedSchema('users')).toEqual(schema);
    });

    it('should validate documents against locked schema', async () => {
      await db.schema.lock('users', {
        name: { type: 'string', required: true },
        email: { type: 'string', required: true },
      });

      // Should succeed
      await expect(
        db.insert('users', { name: 'Alice', email: 'alice@example.com' })
      ).resolves.toBeDefined();

      // Should fail - missing required field
      await expect(
        db.insert('users', { name: 'Bob' })
      ).rejects.toThrow(EvoDBError);
    });
  });

  describe('relate', () => {
    it('should define a relationship', async () => {
      await db.schema.relate('posts.author', 'users', {
        type: 'one-to-many',
        foreignKey: 'author.id',
        onDelete: 'cascade',
      });

      const relationships = db.schema.getRelationships('posts.author');
      expect(relationships?.get('users')).toEqual({
        type: 'one-to-many',
        foreignKey: 'author.id',
        onDelete: 'cascade',
        onUpdate: 'cascade',
      });
    });

    it('should use default relationship options', async () => {
      await db.schema.relate('posts.author', 'users');

      const relationships = db.schema.getRelationships('posts.author');
      expect(relationships?.get('users')?.type).toBe('one-to-many');
      expect(relationships?.get('users')?.onDelete).toBe('restrict');
    });
  });

  describe('enforce', () => {
    it('should enforce constraints on specific fields', async () => {
      await db.schema.enforce('posts', {
        title: { type: 'string', required: true, maxLength: 200 },
      });

      const enforcement = db.schema.getEnforcement('posts');
      expect(enforcement).toBeDefined();
      expect(db.schema.isLocked('posts')).toBe(true);
    });

    it('should merge with existing schema', async () => {
      await db.schema.lock('posts', {
        title: { type: 'string', required: true },
      });

      await db.schema.enforce('posts', {
        body: { type: 'string', required: false },
      });

      const schema = db.schema.getLockedSchema('posts');
      expect(schema).toHaveProperty('title');
      expect(schema).toHaveProperty('body');
    });
  });

  describe('infer', () => {
    it('should infer schema from data', async () => {
      const devDb = new EvoDB({ mode: 'development' });

      await devDb.insert('users', [
        { name: 'Alice', age: 30, active: true },
        { name: 'Bob', age: 25, active: false },
      ]);

      const inferred = await devDb.schema.infer('users');

      expect(inferred._id).toBe('string');
      expect(inferred.name).toBe('string');
      expect(inferred.age).toMatch(/number/);
      expect(inferred.active).toMatch(/boolean/);
    });
  });
});

// =============================================================================
// Validation Tests
// =============================================================================

describe('Schema Validation', () => {
  let db: EvoDB;

  beforeEach(async () => {
    db = new EvoDB({ mode: 'production' });
  });

  it('should validate string type', async () => {
    await db.schema.lock('users', {
      name: { type: 'string', required: true },
    });

    await expect(
      db.insert('users', { name: 123 })
    ).rejects.toThrow(/expected type 'string'/);
  });

  it('should validate number type', async () => {
    await db.schema.lock('products', {
      price: { type: 'number', required: true },
    });

    await expect(
      db.insert('products', { price: 'not-a-number' })
    ).rejects.toThrow(/expected type 'number'/);
  });

  it('should validate boolean type', async () => {
    await db.schema.lock('settings', {
      enabled: { type: 'boolean', required: true },
    });

    await expect(
      db.insert('settings', { enabled: 'yes' })
    ).rejects.toThrow(/expected type 'boolean'/);
  });

  it('should validate email format', async () => {
    await db.schema.lock('users', {
      email: { type: 'string', format: 'email', required: true },
    });

    await expect(
      db.insert('users', { email: 'not-an-email' })
    ).rejects.toThrow(/not a valid email/);

    await expect(
      db.insert('users', { email: 'valid@example.com' })
    ).resolves.toBeDefined();
  });

  it('should validate URL format', async () => {
    await db.schema.lock('links', {
      url: { type: 'string', format: 'url', required: true },
    });

    await expect(
      db.insert('links', { url: 'not-a-url' })
    ).rejects.toThrow(/not a valid URL/);

    await expect(
      db.insert('links', { url: 'https://example.com' })
    ).resolves.toBeDefined();
  });

  it('should validate UUID format', async () => {
    await db.schema.lock('entities', {
      id: { type: 'string', format: 'uuid', required: true },
    });

    await expect(
      db.insert('entities', { id: 'not-a-uuid' })
    ).rejects.toThrow(/not a valid UUID/);

    await expect(
      db.insert('entities', { id: '550e8400-e29b-41d4-a716-446655440000' })
    ).resolves.toBeDefined();
  });

  it('should validate enum values', async () => {
    await db.schema.lock('users', {
      role: { type: 'string', enum: ['admin', 'user', 'guest'], required: true },
    });

    await expect(
      db.insert('users', { role: 'superuser' })
    ).rejects.toThrow(/not in allowed values/);

    await expect(
      db.insert('users', { role: 'admin' })
    ).resolves.toBeDefined();
  });

  it('should validate minLength', async () => {
    await db.schema.lock('users', {
      password: { type: 'string', minLength: 8, required: true },
    });

    await expect(
      db.insert('users', { password: 'short' })
    ).rejects.toThrow(/at least 8 characters/);

    await expect(
      db.insert('users', { password: 'longenough' })
    ).resolves.toBeDefined();
  });

  it('should validate maxLength', async () => {
    await db.schema.lock('posts', {
      title: { type: 'string', maxLength: 10, required: true },
    });

    await expect(
      db.insert('posts', { title: 'This title is way too long' })
    ).rejects.toThrow(/at most 10 characters/);

    await expect(
      db.insert('posts', { title: 'Short' })
    ).resolves.toBeDefined();
  });

  it('should validate min number', async () => {
    await db.schema.lock('products', {
      price: { type: 'number', min: 0, required: true },
    });

    await expect(
      db.insert('products', { price: -5 })
    ).rejects.toThrow(/at least 0/);

    await expect(
      db.insert('products', { price: 100 })
    ).resolves.toBeDefined();
  });

  it('should validate max number', async () => {
    await db.schema.lock('ratings', {
      score: { type: 'number', max: 5, required: true },
    });

    await expect(
      db.insert('ratings', { score: 10 })
    ).rejects.toThrow(/at most 5/);

    await expect(
      db.insert('ratings', { score: 4 })
    ).resolves.toBeDefined();
  });

  it('should reject unknown fields in strict mode', async () => {
    const strictDb = new EvoDB({
      mode: 'production',
      rejectUnknownFields: true,
    });

    await strictDb.schema.lock('users', {
      name: { type: 'string', required: true },
    });

    await expect(
      strictDb.insert('users', { name: 'Alice', extraField: 'not allowed' })
    ).rejects.toThrow(/Unknown field/);
  });

  it('should allow unknown fields in non-strict mode', async () => {
    await db.schema.lock('users', {
      name: { type: 'string', required: true },
    });

    await expect(
      db.insert('users', { name: 'Alice', extraField: 'allowed' })
    ).resolves.toBeDefined();
  });
});

// =============================================================================
// Storage Integration Tests
// =============================================================================

describe('Storage Integration', () => {
  it('should persist data to storage', async () => {
    const storage = createMockStorage();
    const db = new EvoDB({ mode: 'development', storage });

    await db.insert('users', { name: 'Alice' });

    const storedData = await storage.get('data/users/data.json');
    expect(storedData).not.toBeNull();

    const content = await storedData!.arrayBuffer();
    const parsed = JSON.parse(new TextDecoder().decode(content));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Alice');
  });

  it('should persist schema to storage', async () => {
    const storage = createMockStorage();
    const db = new EvoDB({ mode: 'production', storage });

    await db.schema.lock('users', {
      name: { type: 'string', required: true },
    });

    const storedSchema = await storage.get('_meta/schemas/users.json');
    expect(storedSchema).not.toBeNull();

    const content = await storedSchema!.arrayBuffer();
    const parsed = JSON.parse(new TextDecoder().decode(content));
    expect(parsed.name.type).toBe('string');
  });

  it('should persist relationships to storage', async () => {
    const storage = createMockStorage();
    const db = new EvoDB({ mode: 'production', storage });

    await db.schema.relate('posts.author', 'users', {
      type: 'one-to-many',
      onDelete: 'cascade',
    });

    const storedRel = await storage.get('_meta/relationships/posts.author__users.json');
    expect(storedRel).not.toBeNull();

    const content = await storedRel!.arrayBuffer();
    const parsed = JSON.parse(new TextDecoder().decode(content));
    expect(parsed.type).toBe('one-to-many');
    expect(parsed.onDelete).toBe('cascade');
  });
});

// =============================================================================
// Edge Cases Tests
// =============================================================================

describe('Edge Cases', () => {
  let db: EvoDB;

  beforeEach(() => {
    db = new EvoDB({ mode: 'development' });
  });

  it('should handle empty table query', async () => {
    const results = await db.query('nonexistent');
    expect(results).toEqual([]);
  });

  it('should handle null values', async () => {
    await db.insert('data', { value: null });
    const results = await db.query('data');
    expect(results[0].value).toBeNull();
  });

  it('should handle deeply nested objects', async () => {
    await db.insert('config', {
      settings: {
        theme: {
          colors: {
            primary: '#000',
          },
        },
      },
    });

    const results = await db.query('config');
    expect(results[0].settings.theme.colors.primary).toBe('#000');
  });

  it('should handle special characters in strings', async () => {
    await db.insert('posts', {
      title: 'Hello "World"',
      body: "It's a test\nwith newlines",
    });

    const results = await db.query('posts');
    expect(results[0].title).toBe('Hello "World"');
    expect(results[0].body).toBe("It's a test\nwith newlines");
  });

  it('should handle schema evolution in development mode', async () => {
    // First insert
    await db.insert('users', { name: 'Alice' });

    // Second insert with new field
    await db.insert('users', { name: 'Bob', role: 'admin' });

    const results = await db.query('users');
    expect(results).toHaveLength(2);
    expect(results[1].role).toBe('admin');
  });

  it('should handle mixed types gracefully', async () => {
    // EvoDB should handle type evolution
    await db.insert('scores', { id: 1, score: '95' });
    await db.insert('scores', { id: 2, score: 87 });
    await db.insert('scores', { id: 3, score: 92.5 });

    const results = await db.query('scores').orderBy('id', 'asc');
    expect(results).toHaveLength(3);
  });

  it('should generate unique IDs', async () => {
    const results = await db.insert('items', [
      { name: 'Item 1' },
      { name: 'Item 2' },
      { name: 'Item 3' },
    ]);

    const ids = results.map(r => r._id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });
});

// =============================================================================
// QueryBuilder Tests
// =============================================================================

describe('QueryBuilder', () => {
  it('should be thenable for await support', async () => {
    const db = new EvoDB({ mode: 'development' });
    await db.insert('users', { name: 'Alice' });

    // Direct await should work
    const results = await db.query('users');
    expect(results).toHaveLength(1);
  });

  it('should chain multiple operations', async () => {
    const db = new EvoDB({ mode: 'development' });
    await db.insert('users', [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 },
    ]);

    const results = await db
      .query<{ name: string; age: number }>('users')
      .where('age', '>=', 25)
      .where('age', '<=', 32)
      .select(['name'])
      .orderBy('name', 'asc')
      .limit(2);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Alice');
    expect(results[1].name).toBe('Bob');
  });
});

// =============================================================================
// Update Operation Tests
// =============================================================================

describe('update', () => {
  let db: EvoDB;

  beforeEach(() => {
    db = new EvoDB({ mode: 'development' });
  });

  it('should update a single document by filter', async () => {
    await db.insert('users', [
      { _id: 'user-1', name: 'Alice', age: 30 },
      { _id: 'user-2', name: 'Bob', age: 25 },
    ]);

    const result = await db.update('users', { _id: 'user-1' }, { name: 'Alice Updated' });

    expect(result.matchedCount).toBe(1);
    expect(result.modifiedCount).toBe(1);

    const users = await db.query('users').where('_id', '=', 'user-1');
    expect(users[0].name).toBe('Alice Updated');
    expect(users[0].age).toBe(30); // Other fields preserved
  });

  it('should update multiple documents matching filter', async () => {
    await db.insert('users', [
      { _id: 'user-1', name: 'Alice', role: 'user' },
      { _id: 'user-2', name: 'Bob', role: 'user' },
      { _id: 'user-3', name: 'Charlie', role: 'admin' },
    ]);

    const result = await db.update('users', { role: 'user' }, { role: 'member' });

    expect(result.matchedCount).toBe(2);
    expect(result.modifiedCount).toBe(2);

    const members = await db.query('users').where('role', '=', 'member');
    expect(members).toHaveLength(2);
  });

  it('should return zero counts when no documents match', async () => {
    await db.insert('users', { _id: 'user-1', name: 'Alice' });

    const result = await db.update('users', { _id: 'nonexistent' }, { name: 'Updated' });

    expect(result.matchedCount).toBe(0);
    expect(result.modifiedCount).toBe(0);
  });

  it('should handle nested field updates', async () => {
    await db.insert('users', {
      _id: 'user-1',
      name: 'Alice',
      address: { city: 'NYC', zip: '10001' },
    });

    const result = await db.update('users', { _id: 'user-1' }, { address: { city: 'LA', zip: '90001' } });

    expect(result.modifiedCount).toBe(1);

    const users = await db.query('users').where('_id', '=', 'user-1');
    expect(users[0].address).toEqual({ city: 'LA', zip: '90001' });
  });

  it('should add new fields during update', async () => {
    await db.insert('users', { _id: 'user-1', name: 'Alice' });

    const result = await db.update('users', { _id: 'user-1' }, { email: 'alice@example.com' });

    expect(result.modifiedCount).toBe(1);

    const users = await db.query('users').where('_id', '=', 'user-1');
    expect(users[0].name).toBe('Alice');
    expect(users[0].email).toBe('alice@example.com');
  });

  it('should validate updates against locked schema', async () => {
    const prodDb = new EvoDB({ mode: 'production' });
    await prodDb.schema.lock('users', {
      name: { type: 'string', required: true },
      age: { type: 'number', required: false },
    });

    await prodDb.insert('users', { _id: 'user-1', name: 'Alice', age: 30 });

    // Should fail - wrong type
    await expect(
      prodDb.update('users', { _id: 'user-1' }, { age: 'not-a-number' })
    ).rejects.toThrow(/expected type 'number'/);
  });

  it('should return updated documents when returnDocuments option is true', async () => {
    await db.insert('users', [
      { _id: 'user-1', name: 'Alice' },
      { _id: 'user-2', name: 'Bob' },
    ]);

    const result = await db.update('users', { _id: 'user-1' }, { name: 'Alice Updated' }, { returnDocuments: true });

    expect(result.documents).toBeDefined();
    expect(result.documents).toHaveLength(1);
    expect(result.documents![0].name).toBe('Alice Updated');
  });
});

// =============================================================================
// Delete Operation Tests
// =============================================================================

describe('delete', () => {
  let db: EvoDB;

  beforeEach(() => {
    db = new EvoDB({ mode: 'development' });
  });

  it('should delete a single document by filter', async () => {
    await db.insert('users', [
      { _id: 'user-1', name: 'Alice' },
      { _id: 'user-2', name: 'Bob' },
    ]);

    const result = await db.delete('users', { _id: 'user-1' });

    expect(result.deletedCount).toBe(1);

    const users = await db.query('users');
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Bob');
  });

  it('should delete multiple documents matching filter', async () => {
    await db.insert('users', [
      { _id: 'user-1', name: 'Alice', role: 'user' },
      { _id: 'user-2', name: 'Bob', role: 'user' },
      { _id: 'user-3', name: 'Charlie', role: 'admin' },
    ]);

    const result = await db.delete('users', { role: 'user' });

    expect(result.deletedCount).toBe(2);

    const users = await db.query('users');
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Charlie');
  });

  it('should return zero when no documents match', async () => {
    await db.insert('users', { _id: 'user-1', name: 'Alice' });

    const result = await db.delete('users', { _id: 'nonexistent' });

    expect(result.deletedCount).toBe(0);

    const users = await db.query('users');
    expect(users).toHaveLength(1);
  });

  it('should delete all documents when filter is empty', async () => {
    await db.insert('users', [
      { _id: 'user-1', name: 'Alice' },
      { _id: 'user-2', name: 'Bob' },
      { _id: 'user-3', name: 'Charlie' },
    ]);

    const result = await db.delete('users', {});

    expect(result.deletedCount).toBe(3);

    const users = await db.query('users');
    expect(users).toHaveLength(0);
  });

  it('should return deleted documents when returnDocuments option is true', async () => {
    await db.insert('users', [
      { _id: 'user-1', name: 'Alice' },
      { _id: 'user-2', name: 'Bob' },
    ]);

    const result = await db.delete('users', { _id: 'user-1' }, { returnDocuments: true });

    expect(result.documents).toBeDefined();
    expect(result.documents).toHaveLength(1);
    expect(result.documents![0].name).toBe('Alice');
  });

  it('should handle complex filter conditions', async () => {
    await db.insert('products', [
      { _id: 'p-1', name: 'Widget', price: 100, inStock: true },
      { _id: 'p-2', name: 'Gadget', price: 200, inStock: false },
      { _id: 'p-3', name: 'Gizmo', price: 150, inStock: false },
    ]);

    const result = await db.delete('products', { inStock: false });

    expect(result.deletedCount).toBe(2);

    const products = await db.query('products');
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe('Widget');
  });
});

// =============================================================================
// Update/Delete with Storage Persistence Tests
// =============================================================================

describe('Update/Delete Storage Integration', () => {
  it('should persist updates to storage', async () => {
    const storage = createMockStorage();
    const db = new EvoDB({ mode: 'development', storage });

    await db.insert('users', { _id: 'user-1', name: 'Alice' });
    await db.update('users', { _id: 'user-1' }, { name: 'Alice Updated' });

    const storedData = await storage.get('data/users/data.json');
    expect(storedData).not.toBeNull();

    const content = await storedData!.arrayBuffer();
    const parsed = JSON.parse(new TextDecoder().decode(content));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Alice Updated');
  });

  it('should persist deletes to storage', async () => {
    const storage = createMockStorage();
    const db = new EvoDB({ mode: 'development', storage });

    await db.insert('users', [
      { _id: 'user-1', name: 'Alice' },
      { _id: 'user-2', name: 'Bob' },
    ]);
    await db.delete('users', { _id: 'user-1' });

    const storedData = await storage.get('data/users/data.json');
    expect(storedData).not.toBeNull();

    const content = await storedData!.arrayBuffer();
    const parsed = JSON.parse(new TextDecoder().decode(content));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Bob');
  });
});
