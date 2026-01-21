/**
 * @evodb/query - Subrequest Budget Tracking Tests
 *
 * TDD tests for subrequest budget tracking in query execution.
 * Cloudflare Workers have subrequest limits:
 * - Workers: 1000 subrequests per invocation
 * - Snippets: 5 subrequests per invocation
 *
 * These tests ensure the query engine tracks and enforces these limits
 * with clear error messages before hitting cryptic platform errors.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  QueryEngine,
  createQueryEngine,
  SubrequestBudgetExceededError,
  SubrequestTracker,
} from '../engine.js';

import type {
  Query,
  QueryEngineConfig,
  PartitionInfo,
} from '../types.js';

import {
  createMockDataSource,
  MockDataSource,
  MockTableDefinition,
} from './fixtures/mock-data.js';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock data source with many partitions to exceed subrequest limits
 */
function createManyPartitionDataSource(partitionCount: number): MockDataSource {
  const tables = new Map<string, MockTableDefinition>();

  // Create a table with many partitions
  const partitions: PartitionInfo[] = [];
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < partitionCount; i++) {
    partitions.push({
      path: `data/many_partitions/p${i}.bin`,
      partitionValues: { partition_id: i },
      sizeBytes: 1000,
      rowCount: 10,
      zoneMap: {
        columns: {
          id: { min: i * 10, max: i * 10 + 9, nullCount: 0, allNull: false },
        },
      },
      isCached: false,
    });

    // Add rows for this partition
    for (let j = 0; j < 10; j++) {
      rows.push({ id: i * 10 + j, partition_id: i });
    }
  }

  tables.set('com/example/api/many_partitions', {
    partitions,
    rows,
    schema: { id: 'number', partition_id: 'number' },
  });

  return new MockDataSource(tables);
}

/**
 * Create test config with subrequest tracking enabled
 */
function createTestConfig(overrides?: Partial<QueryEngineConfig>): QueryEngineConfig {
  return {
    bucket: {
      get: async () => null,
      head: async () => null,
      list: async () => ({ objects: [], truncated: false }),
    },
    dataSource: createMockDataSource(),
    maxParallelism: 4,
    defaultTimeoutMs: 30000,
    enableStats: true,
    ...overrides,
  };
}

// =============================================================================
// SubrequestBudgetExceededError Tests
// =============================================================================

describe('SubrequestBudgetExceededError', () => {
  it('should be a proper Error subclass', () => {
    const error = new SubrequestBudgetExceededError(1000, 1001, 'worker');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SubrequestBudgetExceededError);
  });

  it('should include budget limit in message', () => {
    const error = new SubrequestBudgetExceededError(1000, 1001, 'worker');
    expect(error.message).toContain('1000');
  });

  it('should include current count in message', () => {
    const error = new SubrequestBudgetExceededError(1000, 1001, 'worker');
    expect(error.message).toContain('1001');
  });

  it('should include context type in message', () => {
    const error = new SubrequestBudgetExceededError(1000, 1001, 'worker');
    expect(error.message.toLowerCase()).toContain('worker');
  });

  it('should expose budget and count properties', () => {
    const error = new SubrequestBudgetExceededError(1000, 1001, 'worker');
    expect(error.budget).toBe(1000);
    expect(error.count).toBe(1001);
    expect(error.context).toBe('worker');
  });

  it('should have descriptive name', () => {
    const error = new SubrequestBudgetExceededError(5, 6, 'snippet');
    expect(error.name).toBe('SubrequestBudgetExceededError');
  });

  it('should format message for snippets context', () => {
    const error = new SubrequestBudgetExceededError(5, 6, 'snippet');
    expect(error.message.toLowerCase()).toContain('snippet');
    expect(error.message).toContain('5');
    expect(error.message).toContain('6');
  });
});

// =============================================================================
// SubrequestTracker Tests
// =============================================================================

describe('SubrequestTracker', () => {
  describe('Worker context (1000 limit)', () => {
    it('should create tracker with 1000 budget for worker context', () => {
      const tracker = new SubrequestTracker('worker');
      expect(tracker.getBudget()).toBe(1000);
      expect(tracker.getCount()).toBe(0);
      expect(tracker.getRemaining()).toBe(1000);
    });

    it('should track subrequest count', () => {
      const tracker = new SubrequestTracker('worker');
      tracker.increment();
      expect(tracker.getCount()).toBe(1);
      tracker.increment();
      expect(tracker.getCount()).toBe(2);
    });

    it('should increment by custom amount', () => {
      const tracker = new SubrequestTracker('worker');
      tracker.increment(5);
      expect(tracker.getCount()).toBe(5);
    });

    it('should calculate remaining budget correctly', () => {
      const tracker = new SubrequestTracker('worker');
      tracker.increment(100);
      expect(tracker.getRemaining()).toBe(900);
    });

    it('should not throw when within budget', () => {
      const tracker = new SubrequestTracker('worker');
      expect(() => tracker.increment(1000)).not.toThrow();
    });

    it('should throw SubrequestBudgetExceededError when exceeding budget', () => {
      const tracker = new SubrequestTracker('worker');
      tracker.increment(1000);
      expect(() => tracker.increment(1)).toThrow(SubrequestBudgetExceededError);
    });

    it('should throw when would exceed budget (pre-check)', () => {
      const tracker = new SubrequestTracker('worker');
      expect(() => tracker.checkBudget(1001)).toThrow(SubrequestBudgetExceededError);
    });

    it('should allow check when within budget', () => {
      const tracker = new SubrequestTracker('worker');
      expect(() => tracker.checkBudget(1000)).not.toThrow();
    });
  });

  describe('Snippet context (5 limit)', () => {
    it('should create tracker with 5 budget for snippet context', () => {
      const tracker = new SubrequestTracker('snippet');
      expect(tracker.getBudget()).toBe(5);
      expect(tracker.getCount()).toBe(0);
      expect(tracker.getRemaining()).toBe(5);
    });

    it('should throw when exceeding snippet budget', () => {
      const tracker = new SubrequestTracker('snippet');
      tracker.increment(5);
      expect(() => tracker.increment(1)).toThrow(SubrequestBudgetExceededError);
    });

    it('should provide helpful error message for snippets', () => {
      const tracker = new SubrequestTracker('snippet');
      tracker.increment(5);
      try {
        tracker.increment(1);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SubrequestBudgetExceededError);
        const error = e as SubrequestBudgetExceededError;
        expect(error.budget).toBe(5);
        expect(error.context).toBe('snippet');
      }
    });
  });

  describe('Custom budget', () => {
    it('should accept custom budget value', () => {
      const tracker = new SubrequestTracker('worker', 100);
      expect(tracker.getBudget()).toBe(100);
    });

    it('should enforce custom budget', () => {
      const tracker = new SubrequestTracker('worker', 10);
      tracker.increment(10);
      expect(() => tracker.increment(1)).toThrow(SubrequestBudgetExceededError);
    });
  });

  describe('Reset', () => {
    it('should reset count to zero', () => {
      const tracker = new SubrequestTracker('worker');
      tracker.increment(500);
      tracker.reset();
      expect(tracker.getCount()).toBe(0);
      expect(tracker.getRemaining()).toBe(1000);
    });
  });
});

// =============================================================================
// QueryEngine Subrequest Tracking Tests
// =============================================================================

describe('QueryEngine - Subrequest Budget Tracking', () => {
  describe('Worker context (1000 subrequest limit)', () => {
    it('should track subrequests during query execution', async () => {
      const config = createTestConfig({
        subrequestContext: 'worker',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/users',
      };

      const result = await engine.execute(query);

      // Stats should include subrequest count
      expect(result.stats.subrequestCount).toBeDefined();
      expect(result.stats.subrequestCount).toBeGreaterThanOrEqual(0);
    });

    it('should throw SubrequestBudgetExceededError when exceeding worker limit', async () => {
      // Create a data source with 1001 partitions (exceeds worker limit)
      const manyPartitionSource = createManyPartitionDataSource(1001);

      const config = createTestConfig({
        dataSource: manyPartitionSource,
        subrequestContext: 'worker',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/many_partitions',
      };

      await expect(engine.execute(query)).rejects.toThrow(SubrequestBudgetExceededError);
    });

    it('should provide clear error message when exceeding limit', async () => {
      const manyPartitionSource = createManyPartitionDataSource(1001);

      const config = createTestConfig({
        dataSource: manyPartitionSource,
        subrequestContext: 'worker',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/many_partitions',
      };

      try {
        await engine.execute(query);
        expect.fail('Should have thrown SubrequestBudgetExceededError');
      } catch (e) {
        expect(e).toBeInstanceOf(SubrequestBudgetExceededError);
        const error = e as SubrequestBudgetExceededError;
        expect(error.message).toContain('1000');
        expect(error.message.toLowerCase()).toContain('subrequest');
        expect(error.message.toLowerCase()).toContain('budget');
      }
    });

    it('should succeed when within worker budget', async () => {
      // Create a data source with 500 partitions (within worker limit)
      const dataSource = createManyPartitionDataSource(500);

      const config = createTestConfig({
        dataSource,
        subrequestContext: 'worker',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/many_partitions',
      };

      const result = await engine.execute(query);
      expect(result.rows).toBeDefined();
      expect(result.stats.subrequestCount).toBeLessThanOrEqual(1000);
    });
  });

  describe('Snippet context (5 subrequest limit)', () => {
    it('should track subrequests in snippet context', async () => {
      const config = createTestConfig({
        subrequestContext: 'snippet',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/users',
      };

      // This should fail because even a simple query likely exceeds 5 subrequests
      // unless the data is already cached or the table has very few partitions
    });

    it('should throw SubrequestBudgetExceededError when exceeding snippet limit', async () => {
      // Create a data source with 6 partitions (exceeds snippet limit)
      const dataSource = createManyPartitionDataSource(6);

      const config = createTestConfig({
        dataSource,
        subrequestContext: 'snippet',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/many_partitions',
      };

      await expect(engine.execute(query)).rejects.toThrow(SubrequestBudgetExceededError);
    });

    it('should provide snippet-specific error message', async () => {
      const dataSource = createManyPartitionDataSource(6);

      const config = createTestConfig({
        dataSource,
        subrequestContext: 'snippet',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/many_partitions',
      };

      try {
        await engine.execute(query);
        expect.fail('Should have thrown SubrequestBudgetExceededError');
      } catch (e) {
        expect(e).toBeInstanceOf(SubrequestBudgetExceededError);
        const error = e as SubrequestBudgetExceededError;
        expect(error.budget).toBe(5);
        expect(error.context).toBe('snippet');
      }
    });

    it('should succeed when within snippet budget', async () => {
      // Create a data source with 3 partitions (within snippet limit)
      const dataSource = createManyPartitionDataSource(3);

      const config = createTestConfig({
        dataSource,
        subrequestContext: 'snippet',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/many_partitions',
      };

      const result = await engine.execute(query);
      expect(result.rows).toBeDefined();
      expect(result.stats.subrequestCount).toBeLessThanOrEqual(5);
    });
  });

  describe('Pre-execution budget check', () => {
    it('should check budget before starting execution', async () => {
      const dataSource = createManyPartitionDataSource(1001);

      const config = createTestConfig({
        dataSource,
        subrequestContext: 'worker',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/many_partitions',
      };

      // The error should be thrown before any significant work is done
      await expect(engine.execute(query)).rejects.toThrow(SubrequestBudgetExceededError);
    });

    it('should estimate subrequest count in query plan', async () => {
      const dataSource = createManyPartitionDataSource(100);

      const config = createTestConfig({
        dataSource,
        subrequestContext: 'worker',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/many_partitions',
      };

      const plan = await engine.plan(query);

      // Plan should include estimated subrequest count
      expect(plan.estimatedCost.estimatedSubrequests).toBeDefined();
      expect(plan.estimatedCost.estimatedSubrequests).toBeGreaterThan(0);
    });
  });

  describe('Custom budget configuration', () => {
    it('should accept custom subrequest budget', async () => {
      const dataSource = createManyPartitionDataSource(10);

      const config = createTestConfig({
        dataSource,
        subrequestContext: 'worker',
        subrequestBudget: 5, // Custom low budget for testing
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/many_partitions',
      };

      await expect(engine.execute(query)).rejects.toThrow(SubrequestBudgetExceededError);
    });
  });

  describe('Streaming queries', () => {
    it('should track subrequests in streaming execution', async () => {
      const config = createTestConfig({
        subrequestContext: 'worker',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/users',
        limit: 10,
      };

      const stream = await engine.executeStream(query);

      // Consume the stream
      for await (const _ of stream.rows) {
        // consume
      }

      const stats = await stream.getStats();
      expect(stats.subrequestCount).toBeDefined();
    });

    it('should throw when streaming would exceed budget', async () => {
      const dataSource = createManyPartitionDataSource(1001);

      const config = createTestConfig({
        dataSource,
        subrequestContext: 'worker',
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/many_partitions',
      };

      await expect(engine.executeStream(query)).rejects.toThrow(SubrequestBudgetExceededError);
    });
  });

  describe('Default behavior (no context specified)', () => {
    it('should default to worker context when not specified', async () => {
      const config = createTestConfig();
      // No subrequestContext specified
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/users',
      };

      const result = await engine.execute(query);

      // Should still track subrequests with worker budget
      expect(result.stats.subrequestCount).toBeDefined();
    });

    it('should use 1000 limit when context not specified', async () => {
      const dataSource = createManyPartitionDataSource(1001);

      const config = createTestConfig({
        dataSource,
        // No subrequestContext specified
      });
      const engine = createQueryEngine(config);

      const query: Query = {
        table: 'com/example/api/many_partitions',
      };

      // Should throw at worker limit (1000)
      await expect(engine.execute(query)).rejects.toThrow(SubrequestBudgetExceededError);
    });
  });
});

// =============================================================================
// Integration with Cache
// =============================================================================

describe('Subrequest Budget - Cache Integration', () => {
  it('should not count cache hits as subrequests', async () => {
    const config = createTestConfig({
      subrequestContext: 'worker',
      cache: {
        enabled: true,
        ttlSeconds: 3600,
        maxSizeBytes: 100 * 1024 * 1024,
        keyPrefix: 'test:',
      },
    });
    const engine = createQueryEngine(config);

    const query: Query = {
      table: 'com/example/api/users',
    };

    // First execution - should count subrequests
    const result1 = await engine.execute(query);
    const count1 = result1.stats.subrequestCount ?? 0;

    // Second execution - cached data should not add to subrequest count
    const result2 = await engine.execute(query);
    const count2 = result2.stats.subrequestCount ?? 0;

    // Second execution should have same or fewer subrequests (cached)
    expect(count2).toBeLessThanOrEqual(count1);
  });
});
