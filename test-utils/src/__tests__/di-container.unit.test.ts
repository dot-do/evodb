/**
 * @evodb/test-utils - Dependency Injection Container Tests (TDD)
 *
 * Tests for a lightweight DI container pattern for testing.
 * Following TDD: write tests first, then implement.
 *
 * The container provides:
 * - Symbol-based service registration
 * - Factory function support for lazy instantiation
 * - Scoped containers for test isolation
 * - Easy mocking/overriding of services
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  Container,
  createContainer,
  createScope,
  ServiceKeys,
  type ServiceFactory,
} from '../di-container.js';

// =============================================================================
// Basic Container Tests
// =============================================================================

describe('DI Container - Basic Operations', () => {
  let container: Container;

  beforeEach(() => {
    container = createContainer();
  });

  describe('register and resolve', () => {
    it('should register and resolve a service by symbol key', () => {
      const SERVICE_KEY = Symbol('TestService');
      const service = { name: 'test-service' };

      container.register(SERVICE_KEY, () => service);
      const resolved = container.resolve<typeof service>(SERVICE_KEY);

      expect(resolved).toBe(service);
    });

    it('should register and resolve a service by string key', () => {
      const service = { value: 42 };

      container.register('myService', () => service);
      const resolved = container.resolve<typeof service>('myService');

      expect(resolved).toBe(service);
    });

    it('should call factory function each time for transient registration', () => {
      const COUNTER_KEY = Symbol('Counter');
      let callCount = 0;

      container.register(COUNTER_KEY, () => {
        callCount++;
        return { count: callCount };
      });

      const first = container.resolve<{ count: number }>(COUNTER_KEY);
      const second = container.resolve<{ count: number }>(COUNTER_KEY);

      expect(first.count).toBe(1);
      expect(second.count).toBe(2);
      expect(callCount).toBe(2);
    });

    it('should call factory only once for singleton registration', () => {
      const SINGLETON_KEY = Symbol('Singleton');
      let callCount = 0;

      container.registerSingleton(SINGLETON_KEY, () => {
        callCount++;
        return { id: callCount };
      });

      const first = container.resolve<{ id: number }>(SINGLETON_KEY);
      const second = container.resolve<{ id: number }>(SINGLETON_KEY);

      expect(first).toBe(second);
      expect(first.id).toBe(1);
      expect(callCount).toBe(1);
    });

    it('should throw when resolving unregistered service', () => {
      const UNREGISTERED = Symbol('Unregistered');

      expect(() => container.resolve(UNREGISTERED)).toThrow(/not registered/i);
    });

    it('should allow re-registering a service (override)', () => {
      const KEY = Symbol('Override');

      container.register(KEY, () => ({ version: 1 }));
      container.register(KEY, () => ({ version: 2 }));

      const resolved = container.resolve<{ version: number }>(KEY);
      expect(resolved.version).toBe(2);
    });
  });

  describe('has and unregister', () => {
    it('should check if a service is registered', () => {
      const KEY = Symbol('HasTest');

      expect(container.has(KEY)).toBe(false);

      container.register(KEY, () => ({}));

      expect(container.has(KEY)).toBe(true);
    });

    it('should unregister a service', () => {
      const KEY = Symbol('UnregisterTest');

      container.register(KEY, () => ({}));
      expect(container.has(KEY)).toBe(true);

      container.unregister(KEY);
      expect(container.has(KEY)).toBe(false);
    });
  });

  describe('registerValue', () => {
    it('should register a constant value (no factory)', () => {
      const KEY = Symbol('ConstantValue');
      const config = { apiUrl: 'https://api.example.com', timeout: 5000 };

      container.registerValue(KEY, config);

      const first = container.resolve<typeof config>(KEY);
      const second = container.resolve<typeof config>(KEY);

      expect(first).toBe(config);
      expect(second).toBe(config);
      expect(first.apiUrl).toBe('https://api.example.com');
    });
  });
});

// =============================================================================
// Scoped Container Tests
// =============================================================================

describe('DI Container - Scoped Containers', () => {
  it('should create a child scope that inherits parent registrations', () => {
    const parent = createContainer();
    const PARENT_SERVICE = Symbol('ParentService');

    parent.register(PARENT_SERVICE, () => ({ origin: 'parent' }));

    const child = createScope(parent);
    const resolved = child.resolve<{ origin: string }>(PARENT_SERVICE);

    expect(resolved.origin).toBe('parent');
  });

  it('should allow child scope to override parent registrations', () => {
    const parent = createContainer();
    const SERVICE_KEY = Symbol('OverrideService');

    parent.register(SERVICE_KEY, () => ({ value: 'parent' }));

    const child = createScope(parent);
    child.register(SERVICE_KEY, () => ({ value: 'child' }));

    const parentResolved = parent.resolve<{ value: string }>(SERVICE_KEY);
    const childResolved = child.resolve<{ value: string }>(SERVICE_KEY);

    expect(parentResolved.value).toBe('parent');
    expect(childResolved.value).toBe('child');
  });

  it('should not affect parent when child overrides', () => {
    const parent = createContainer();
    const KEY = Symbol('IsolationTest');

    parent.register(KEY, () => ({ count: 1 }));

    const child = createScope(parent);
    child.register(KEY, () => ({ count: 999 }));

    // Parent should be unaffected
    expect(parent.resolve<{ count: number }>(KEY).count).toBe(1);
  });

  it('should support nested scopes', () => {
    const root = createContainer();
    const KEY = Symbol('NestedTest');

    root.register(KEY, () => ({ level: 'root' }));

    const level1 = createScope(root);
    const level2 = createScope(level1);

    // level2 should resolve from root
    expect(level2.resolve<{ level: string }>(KEY).level).toBe('root');

    // Override at level1
    level1.register(KEY, () => ({ level: 'level1' }));
    expect(level2.resolve<{ level: string }>(KEY).level).toBe('level1');

    // Override at level2
    level2.register(KEY, () => ({ level: 'level2' }));
    expect(level2.resolve<{ level: string }>(KEY).level).toBe('level2');

    // Others unchanged
    expect(root.resolve<{ level: string }>(KEY).level).toBe('root');
    expect(level1.resolve<{ level: string }>(KEY).level).toBe('level1');
  });

  it('should clear child scope without affecting parent', () => {
    const parent = createContainer();
    const KEY = Symbol('ClearTest');

    parent.register(KEY, () => ({ from: 'parent' }));

    const child = createScope(parent);
    child.register(KEY, () => ({ from: 'child' }));

    child.clear();

    // Child should now resolve from parent
    expect(child.resolve<{ from: string }>(KEY).from).toBe('parent');
    // Parent unchanged
    expect(parent.resolve<{ from: string }>(KEY).from).toBe('parent');
  });
});

// =============================================================================
// Service Keys Tests
// =============================================================================

describe('DI Container - Service Keys', () => {
  it('should provide standard service keys for EvoDB components', () => {
    expect(ServiceKeys.QUERY_PLANNER).toBeDefined();
    expect(typeof ServiceKeys.QUERY_PLANNER).toBe('symbol');

    expect(ServiceKeys.ZONE_MAP_OPTIMIZER).toBeDefined();
    expect(typeof ServiceKeys.ZONE_MAP_OPTIMIZER).toBe('symbol');

    expect(ServiceKeys.BLOOM_FILTER_MANAGER).toBeDefined();
    expect(typeof ServiceKeys.BLOOM_FILTER_MANAGER).toBe('symbol');

    expect(ServiceKeys.CACHE_MANAGER).toBeDefined();
    expect(typeof ServiceKeys.CACHE_MANAGER).toBe('symbol');

    expect(ServiceKeys.RESULT_PROCESSOR).toBeDefined();
    expect(typeof ServiceKeys.RESULT_PROCESSOR).toBe('symbol');

    expect(ServiceKeys.DATA_SOURCE).toBeDefined();
    expect(typeof ServiceKeys.DATA_SOURCE).toBe('symbol');
  });

  it('should have unique symbols for each service key', () => {
    const keys = Object.values(ServiceKeys);
    const uniqueKeys = new Set(keys);

    expect(uniqueKeys.size).toBe(keys.length);
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('DI Container - Factory Functions', () => {
  let container: Container;

  beforeEach(() => {
    container = createContainer();
  });

  it('should pass container to factory for dependency resolution', () => {
    const DEP_KEY = Symbol('Dependency');
    const SERVICE_KEY = Symbol('ServiceWithDep');

    container.register(DEP_KEY, () => ({ name: 'dependency' }));
    container.register(SERVICE_KEY, (c) => ({
      dep: c.resolve<{ name: string }>(DEP_KEY),
      ownValue: 42,
    }));

    const service = container.resolve<{ dep: { name: string }; ownValue: number }>(SERVICE_KEY);

    expect(service.dep.name).toBe('dependency');
    expect(service.ownValue).toBe(42);
  });

  it('should support circular dependency detection', () => {
    const A_KEY = Symbol('A');
    const B_KEY = Symbol('B');

    container.register(A_KEY, (c) => ({ b: c.resolve(B_KEY) }));
    container.register(B_KEY, (c) => ({ a: c.resolve(A_KEY) }));

    // Should throw to prevent stack overflow
    expect(() => container.resolve(A_KEY)).toThrow(/circular|recursion/i);
  });
});

// =============================================================================
// Integration Tests - Mock Service Injection
// =============================================================================

describe('DI Container - Mock Service Injection', () => {
  it('should allow injecting mock services for testing', () => {
    const container = createContainer();

    // Register a mock QueryPlanner
    const mockPlanner = {
      createPlan: () => ({ planId: 'mock-plan', operations: [] }),
      optimize: (plan: unknown) => plan,
      estimateCost: () => 100,
    };

    container.register(ServiceKeys.QUERY_PLANNER, () => mockPlanner);

    const resolved = container.resolve<typeof mockPlanner>(ServiceKeys.QUERY_PLANNER);

    expect(resolved.createPlan()).toEqual({ planId: 'mock-plan', operations: [] });
    expect(resolved.estimateCost()).toBe(100);
  });

  it('should support partial mocking with scope override', async () => {
    const parent = createContainer();

    // Register real implementations
    parent.register(ServiceKeys.ZONE_MAP_OPTIMIZER, () => ({
      prunePartitions: () => ({ selected: [], pruned: [] }),
      estimateSelectivity: () => 0.5,
    }));
    parent.register(ServiceKeys.CACHE_MANAGER, () => ({
      isCached: () => Promise.resolve(false),
      prefetch: () => Promise.resolve(),
    }));

    // Create test scope with mock cache manager
    const testScope = createScope(parent);
    testScope.register(ServiceKeys.CACHE_MANAGER, () => ({
      isCached: () => Promise.resolve(true), // Always cached in tests
      prefetch: () => Promise.resolve(),
    }));

    // ZoneMapOptimizer comes from parent
    const optimizer = testScope.resolve<{ prunePartitions: () => { selected: unknown[]; pruned: unknown[] } }>(
      ServiceKeys.ZONE_MAP_OPTIMIZER
    );
    expect(optimizer.prunePartitions().selected).toEqual([]);

    // CacheManager is mocked
    const cache = testScope.resolve<{ isCached: () => Promise<boolean> }>(ServiceKeys.CACHE_MANAGER);
    await expect(cache.isCached()).resolves.toBe(true);
  });
});

// =============================================================================
// resolveOptional Tests
// =============================================================================

describe('DI Container - Optional Resolution', () => {
  let container: Container;

  beforeEach(() => {
    container = createContainer();
  });

  it('should return undefined for unregistered optional service', () => {
    const OPTIONAL_KEY = Symbol('Optional');

    const result = container.resolveOptional<{ value: number }>(OPTIONAL_KEY);

    expect(result).toBeUndefined();
  });

  it('should return the service if registered when using resolveOptional', () => {
    const KEY = Symbol('OptionalRegistered');

    container.register(KEY, () => ({ found: true }));

    const result = container.resolveOptional<{ found: boolean }>(KEY);

    expect(result).toBeDefined();
    expect(result?.found).toBe(true);
  });
});

// =============================================================================
// Type Safety Tests
// =============================================================================

describe('DI Container - Type Safety', () => {
  it('should maintain type safety through generic resolve', () => {
    const container = createContainer();

    interface MyService {
      doSomething(): string;
      getValue(): number;
    }

    const SERVICE_KEY = Symbol('TypedService');

    container.register<MyService>(SERVICE_KEY, () => ({
      doSomething: () => 'done',
      getValue: () => 42,
    }));

    const service = container.resolve<MyService>(SERVICE_KEY);

    // TypeScript should allow these calls
    expect(service.doSomething()).toBe('done');
    expect(service.getValue()).toBe(42);
  });
});
