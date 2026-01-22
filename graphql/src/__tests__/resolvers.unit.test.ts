/**
 * @evodb/graphql - Resolver Unit Tests
 *
 * Tests for GraphQL resolvers and filter conversion.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  ResolverGenerator,
  createResolverGenerator,
  createResolvers,
  filterToPredicates,
  createInMemoryPubSub,
} from '../resolvers.js';

import type { ResolverContext, GeneratedResolvers } from '../resolvers.js';
import type { GraphQLResolveInfo } from '../types.js';

import {
  createMockExecutor,
  SAMPLE_USERS,
  SAMPLE_ORDERS,
  SAMPLE_TABLES,
} from './fixtures/mock-executor.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestContext(): ResolverContext {
  const executor = createMockExecutor({
    users: [...SAMPLE_USERS],
    orders: [...SAMPLE_ORDERS],
  });

  return {
    executor,
    requestId: 'test-request-1',
  };
}

const mockInfo: GraphQLResolveInfo = {
  fieldName: 'test',
  fieldNodes: [],
  returnType: {},
  parentType: {},
  path: {},
  schema: {},
  rootValue: {},
  operation: {},
  variableValues: {},
};

// =============================================================================
// Filter Conversion Tests
// =============================================================================

describe('filterToPredicates', () => {
  it('should convert simple equality filter', () => {
    const filter = { status: 'active' };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(1);
    expect(predicates[0].column).toBe('status');
    expect(predicates[0].operator).toBe('eq');
    expect(predicates[0].value).toBe('active');
  });

  it('should convert filter with _not suffix', () => {
    const filter = { status_not: 'banned' };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(1);
    expect(predicates[0].operator).toBe('ne');
  });

  it('should convert filter with comparison operators', () => {
    const filter = {
      age_gt: 18,
      age_lte: 65,
    };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(2);
    expect(predicates.find((p) => p.operator === 'gt')).toBeDefined();
    expect(predicates.find((p) => p.operator === 'lte')).toBeDefined();
  });

  it('should convert filter with IN operator', () => {
    const filter = { status_in: ['active', 'pending'] };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(1);
    expect(predicates[0].operator).toBe('in');
    expect(predicates[0].values).toEqual(['active', 'pending']);
  });

  it('should convert filter with NOT IN operator', () => {
    const filter = { status_notIn: ['banned'] };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(1);
    expect(predicates[0].operator).toBe('notIn');
  });

  it('should convert filter with LIKE operator', () => {
    const filter = { email_like: '%@example.com' };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(1);
    expect(predicates[0].operator).toBe('like');
    expect(predicates[0].value).toBe('%@example.com');
  });

  it('should convert filter with IS NULL operator', () => {
    const filter = { name_isNull: true };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(1);
    expect(predicates[0].operator).toBe('isNull');
  });

  it('should convert filter with IS NOT NULL', () => {
    const filter = { name_isNull: false };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(1);
    expect(predicates[0].operator).toBe('isNotNull');
  });

  it('should handle AND logical operator', () => {
    const filter = {
      AND: [{ status: 'active' }, { age_gt: 25 }],
    };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(2);
    expect(predicates.find((p) => p.column === 'status')).toBeDefined();
    expect(predicates.find((p) => p.column === 'age')).toBeDefined();
  });

  it('should handle NOT logical operator', () => {
    const filter = {
      NOT: { status: 'banned' },
    };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(1);
    expect(predicates[0].not).toBe(true);
  });

  it('should convert camelCase to snake_case column names', () => {
    const filter = { createdAt_gt: '2024-01-01' };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(1);
    expect(predicates[0].column).toBe('created_at');
  });

  it('should ignore null and undefined values', () => {
    const filter = { status: null, name: undefined, email: 'test@example.com' };
    const predicates = filterToPredicates(filter);

    expect(predicates).toHaveLength(1);
    expect(predicates[0].column).toBe('email');
  });
});

// =============================================================================
// InMemory PubSub Tests
// =============================================================================

describe('createInMemoryPubSub', () => {
  it('should publish and receive messages', async () => {
    const pubsub = createInMemoryPubSub();
    const channel = 'test-channel';
    const received: unknown[] = [];

    // Subscribe
    const iterator = pubsub.subscribe(channel);

    // Start consuming in background
    const consumePromise = (async () => {
      const result = await iterator.next();
      received.push(result.value);
    })();

    // Give time for subscription to be ready
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Publish
    await pubsub.publish(channel, { type: 'test', data: 'hello' });

    await consumePromise;

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'test', data: 'hello' });
  });

  it('should queue messages before consumption', async () => {
    const pubsub = createInMemoryPubSub();
    const channel = 'test-channel';

    const iterator = pubsub.subscribe(channel);

    // Publish before consuming
    await pubsub.publish(channel, { msg: 1 });
    await pubsub.publish(channel, { msg: 2 });

    const result1 = await iterator.next();
    const result2 = await iterator.next();

    expect(result1.value).toEqual({ msg: 1 });
    expect(result2.value).toEqual({ msg: 2 });
  });
});

// =============================================================================
// Resolver Generator Tests
// =============================================================================

describe('ResolverGenerator', () => {
  let resolvers: GeneratedResolvers;
  let context: ResolverContext;

  beforeEach(() => {
    context = createTestContext();
    resolvers = createResolvers({
      executor: context.executor,
      tables: SAMPLE_TABLES,
    });
  });

  describe('Query Resolvers', () => {
    it('should generate query resolvers for each table', () => {
      expect(resolvers.Query.user).toBeDefined();
      expect(resolvers.Query.users).toBeDefined();
      expect(resolvers.Query.usersConnection).toBeDefined();
      expect(resolvers.Query.order).toBeDefined();
      expect(resolvers.Query.orders).toBeDefined();
    });

    it('should resolve single item by ID', async () => {
      const result = await resolvers.Query.user(
        {},
        { id: 'user-1' },
        context,
        mockInfo
      );

      expect(result).toBeDefined();
      expect(result.email).toBe('alice@example.com');
    });

    it('should return null for non-existent item', async () => {
      const result = await resolvers.Query.user(
        {},
        { id: 'non-existent' },
        context,
        mockInfo
      );

      expect(result).toBeNull();
    });

    it('should resolve list query', async () => {
      const result = await resolvers.Query.users(
        {},
        {},
        context,
        mockInfo
      );

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(4);
    });

    it('should filter list results', async () => {
      const result = await resolvers.Query.users(
        {},
        { filter: { status: 'active' } },
        context,
        mockInfo
      );

      expect(result.length).toBe(2);
      for (const user of result) {
        expect(user.status).toBe('active');
      }
    });

    it('should apply limit to list query', async () => {
      const result = await resolvers.Query.users(
        {},
        { limit: 2 },
        context,
        mockInfo
      );

      expect(result.length).toBe(2);
    });

    it('should apply offset to list query', async () => {
      const result = await resolvers.Query.users(
        {},
        { limit: 2, offset: 2 },
        context,
        mockInfo
      );

      expect(result.length).toBe(2);
      // Should skip first 2 users
      expect(result[0].id).toBe('user-3');
    });

    it('should sort list results', async () => {
      const result = await resolvers.Query.users(
        {},
        {
          orderBy: [{ field: 'AGE', direction: 'DESC' }],
        },
        context,
        mockInfo
      );

      const ages = result.map((u: Record<string, unknown>) => u.age);
      expect(ages).toEqual([35, 30, 28, 25]);
    });

    it('should resolve connection query with pagination info', async () => {
      const result = await resolvers.Query.usersConnection(
        {},
        { first: 2 },
        context,
        mockInfo
      );

      expect(result.edges).toHaveLength(2);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.hasPreviousPage).toBe(false);
      expect(result.pageInfo.startCursor).toBeDefined();
      expect(result.pageInfo.endCursor).toBeDefined();
    });

    it('should handle cursor-based pagination', async () => {
      // Get first page
      const page1 = await resolvers.Query.usersConnection(
        {},
        { first: 2 },
        context,
        mockInfo
      );

      // Get second page using cursor
      const page2 = await resolvers.Query.usersConnection(
        {},
        { first: 2, after: page1.pageInfo.endCursor },
        context,
        mockInfo
      );

      expect(page2.edges).toHaveLength(2);
      expect(page2.edges[0].node.id).not.toBe(page1.edges[0].node.id);
    });
  });

  describe('Mutation Resolvers', () => {
    it('should generate mutation resolvers for each table', () => {
      expect(resolvers.Mutation.createUser).toBeDefined();
      expect(resolvers.Mutation.updateUser).toBeDefined();
      expect(resolvers.Mutation.deleteUser).toBeDefined();
      expect(resolvers.Mutation.deleteUsers).toBeDefined();
    });

    it('should create item successfully', async () => {
      const result = await resolvers.Mutation.createUser(
        {},
        {
          input: {
            email: 'newuser@example.com',
            name: 'New User',
            status: 'active',
            age: 30,
          },
        },
        context,
        mockInfo
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.email).toBe('newuser@example.com');
    });

    it('should update item successfully', async () => {
      const result = await resolvers.Mutation.updateUser(
        {},
        {
          id: 'user-1',
          input: {
            name: 'Updated Name',
          },
        },
        context,
        mockInfo
      );

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Updated Name');
    });

    it('should delete item successfully', async () => {
      const result = await resolvers.Mutation.deleteUser(
        {},
        { id: 'user-1' },
        context,
        mockInfo
      );

      expect(result.success).toBe(true);
      expect(result.deletedId).toBe('user-1');
    });

    it('should batch delete items successfully', async () => {
      const result = await resolvers.Mutation.deleteUsers(
        {},
        { filter: { status: 'inactive' } },
        context,
        mockInfo
      );

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThan(0);
    });
  });

  describe('Subscription Resolvers', () => {
    it('should generate subscription resolvers for each table', () => {
      expect(resolvers.Subscription.usersChanged).toBeDefined();
      expect(resolvers.Subscription.userChanged).toBeDefined();
    });

    it('should have subscribe function for table subscription', () => {
      const subscription = resolvers.Subscription.usersChanged;
      expect(subscription.subscribe).toBeInstanceOf(Function);
    });

    it('should have subscribe function for item subscription', () => {
      const subscription = resolvers.Subscription.userChanged;
      expect(subscription.subscribe).toBeInstanceOf(Function);
    });
  });

  describe('Scalar Resolvers', () => {
    it('should include DateTime scalar resolver', () => {
      expect(resolvers.DateTime).toBeDefined();
      expect(resolvers.DateTime.serialize).toBeInstanceOf(Function);
      expect(resolvers.DateTime.parseValue).toBeInstanceOf(Function);
    });

    it('should serialize DateTime correctly', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const serialized = resolvers.DateTime.serialize(date);
      expect(serialized).toBe('2024-01-15T12:00:00.000Z');
    });

    it('should include Date scalar resolver', () => {
      expect(resolvers.Date).toBeDefined();
      expect(resolvers.Date.serialize).toBeInstanceOf(Function);
    });

    it('should serialize Date correctly', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const serialized = resolvers.Date.serialize(date);
      expect(serialized).toBe('2024-01-15');
    });

    it('should include JSON scalar resolver', () => {
      expect(resolvers.JSON).toBeDefined();
      expect(resolvers.JSON.serialize).toBeInstanceOf(Function);
    });
  });

  describe('Authorization', () => {
    it('should reject unauthorized read operations', async () => {
      const authResolvers = createResolvers({
        executor: context.executor,
        tables: SAMPLE_TABLES,
        authorize: () => false,
      });

      await expect(
        authResolvers.Query.user({}, { id: 'user-1' }, context, mockInfo)
      ).rejects.toThrow('Not authorized');
    });

    it('should reject unauthorized create operations', async () => {
      const authResolvers = createResolvers({
        executor: context.executor,
        tables: SAMPLE_TABLES,
        authorize: (ctx, operation) => operation !== 'create',
      });

      const result = await authResolvers.Mutation.createUser(
        {},
        { input: { email: 'test@example.com' } },
        context,
        mockInfo
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authorized');
    });
  });

  describe('Hooks', () => {
    it('should call beforeCreate hook', async () => {
      let hookCalled = false;

      const hookResolvers = createResolvers({
        executor: context.executor,
        tables: SAMPLE_TABLES,
        hooks: {
          beforeCreate: (ctx, tableName, input) => {
            hookCalled = true;
            return { ...input, modified: true };
          },
        },
      });

      await hookResolvers.Mutation.createUser(
        {},
        { input: { email: 'test@example.com' } },
        context,
        mockInfo
      );

      expect(hookCalled).toBe(true);
    });

    it('should call afterCreate hook', async () => {
      let hookCalled = false;

      const hookResolvers = createResolvers({
        executor: context.executor,
        tables: SAMPLE_TABLES,
        hooks: {
          afterCreate: (ctx, tableName, result) => {
            hookCalled = true;
          },
        },
      });

      await hookResolvers.Mutation.createUser(
        {},
        { input: { email: 'test@example.com' } },
        context,
        mockInfo
      );

      expect(hookCalled).toBe(true);
    });

    it('should allow beforeDelete to prevent deletion', async () => {
      const hookResolvers = createResolvers({
        executor: context.executor,
        tables: SAMPLE_TABLES,
        hooks: {
          beforeDelete: () => false,
        },
      });

      const result = await hookResolvers.Mutation.deleteUser(
        {},
        { id: 'user-1' },
        context,
        mockInfo
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Delete prevented by hook');
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createResolvers', () => {
  it('should create resolvers using factory function', () => {
    const context = createTestContext();
    const resolvers = createResolvers({
      executor: context.executor,
      tables: SAMPLE_TABLES,
    });

    expect(resolvers.Query).toBeDefined();
    expect(resolvers.Mutation).toBeDefined();
    expect(resolvers.Subscription).toBeDefined();
  });
});
