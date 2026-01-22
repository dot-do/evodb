/**
 * @evodb/test-utils - Dependency Injection Container
 *
 * A lightweight DI container for testing EvoDB components.
 * Provides easy mocking and test isolation without external dependencies.
 *
 * ## Features
 *
 * - Symbol-based service registration for type safety
 * - Factory functions for lazy instantiation
 * - Singleton and transient lifetimes
 * - Scoped containers for test isolation
 * - Parent-child inheritance with override support
 * - Circular dependency detection
 *
 * ## Usage
 *
 * ### Basic Registration and Resolution
 *
 * ```typescript
 * import { createContainer, ServiceKeys } from '@evodb/test-utils';
 *
 * const container = createContainer();
 *
 * // Register a service with a factory function
 * container.register(ServiceKeys.CACHE_MANAGER, () => new MockCacheManager());
 *
 * // Resolve the service
 * const cacheManager = container.resolve(ServiceKeys.CACHE_MANAGER);
 * ```
 *
 * ### Singleton Services
 *
 * ```typescript
 * // Factory is called only once
 * container.registerSingleton(ServiceKeys.QUERY_PLANNER, () => new QueryPlanner(config));
 *
 * const planner1 = container.resolve(ServiceKeys.QUERY_PLANNER);
 * const planner2 = container.resolve(ServiceKeys.QUERY_PLANNER);
 * console.log(planner1 === planner2); // true
 * ```
 *
 * ### Scoped Containers for Test Isolation
 *
 * ```typescript
 * // Create a parent container with default implementations
 * const defaultContainer = createContainer();
 * defaultContainer.register(ServiceKeys.DATA_SOURCE, () => new R2DataSource(bucket));
 *
 * // In each test, create a scoped container that can override services
 * const testContainer = createScope(defaultContainer);
 * testContainer.register(ServiceKeys.DATA_SOURCE, () => new MockDataSource());
 *
 * // The test container uses the mock, but doesn't affect other tests
 * ```
 *
 * ### Injecting Dependencies
 *
 * ```typescript
 * // Factory functions receive the container for dependency resolution
 * container.register(ServiceKeys.QUERY_ENGINE, (c) => {
 *   return new QueryEngine({
 *     planner: c.resolve(ServiceKeys.QUERY_PLANNER),
 *     cacheManager: c.resolve(ServiceKeys.CACHE_MANAGER),
 *   });
 * });
 * ```
 *
 * @module
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Service key type - can be a symbol or string.
 * Symbols are preferred for type safety and uniqueness.
 */
export type ServiceKey = symbol | string;

/**
 * Factory function that creates a service instance.
 * Receives the container for resolving dependencies.
 */
export type ServiceFactory<T> = (container: Container) => T;

/**
 * Registration entry storing service configuration.
 */
interface ServiceRegistration<T = unknown> {
  factory: ServiceFactory<T>;
  singleton: boolean;
  instance?: T;
}

// =============================================================================
// Container Interface
// =============================================================================

/**
 * Dependency injection container interface.
 *
 * Provides methods for registering and resolving services.
 */
export interface Container {
  /**
   * Register a service with a factory function (transient lifetime).
   * The factory is called each time the service is resolved.
   *
   * @param key - Unique identifier for the service
   * @param factory - Function that creates the service instance
   */
  register<T>(key: ServiceKey, factory: ServiceFactory<T>): void;

  /**
   * Register a singleton service.
   * The factory is called only once, and the instance is cached.
   *
   * @param key - Unique identifier for the service
   * @param factory - Function that creates the service instance
   */
  registerSingleton<T>(key: ServiceKey, factory: ServiceFactory<T>): void;

  /**
   * Register a constant value (no factory needed).
   * Useful for configuration objects.
   *
   * @param key - Unique identifier for the value
   * @param value - The constant value to register
   */
  registerValue<T>(key: ServiceKey, value: T): void;

  /**
   * Resolve a service by its key.
   * Throws if the service is not registered.
   *
   * @param key - Unique identifier for the service
   * @returns The service instance
   * @throws Error if service is not registered
   */
  resolve<T>(key: ServiceKey): T;

  /**
   * Resolve a service if registered, otherwise return undefined.
   * Useful for optional dependencies.
   *
   * @param key - Unique identifier for the service
   * @returns The service instance or undefined
   */
  resolveOptional<T>(key: ServiceKey): T | undefined;

  /**
   * Check if a service is registered.
   *
   * @param key - Unique identifier for the service
   * @returns true if the service is registered
   */
  has(key: ServiceKey): boolean;

  /**
   * Remove a service registration.
   *
   * @param key - Unique identifier for the service
   */
  unregister(key: ServiceKey): void;

  /**
   * Clear all registrations in this container.
   * Does not affect parent container.
   */
  clear(): void;
}

// =============================================================================
// Container Implementation
// =============================================================================

/**
 * Concrete container implementation.
 */
class ContainerImpl implements Container {
  private readonly registrations = new Map<ServiceKey, ServiceRegistration>();
  private readonly parent?: Container;
  private readonly resolving = new Set<ServiceKey>();

  constructor(parent?: Container) {
    this.parent = parent;
  }

  register<T>(key: ServiceKey, factory: ServiceFactory<T>): void {
    this.registrations.set(key, {
      factory: factory as ServiceFactory<unknown>,
      singleton: false,
    });
  }

  registerSingleton<T>(key: ServiceKey, factory: ServiceFactory<T>): void {
    this.registrations.set(key, {
      factory: factory as ServiceFactory<unknown>,
      singleton: true,
    });
  }

  registerValue<T>(key: ServiceKey, value: T): void {
    this.registrations.set(key, {
      factory: () => value,
      singleton: true,
      instance: value,
    });
  }

  resolve<T>(key: ServiceKey): T {
    // Check for circular dependency
    if (this.resolving.has(key)) {
      const keyName = typeof key === 'symbol' ? key.toString() : key;
      throw new Error(`Circular dependency detected when resolving: ${keyName}`);
    }

    // Check local registrations first
    const registration = this.registrations.get(key);
    if (registration) {
      // Return cached singleton instance if available
      if (registration.singleton && registration.instance !== undefined) {
        return registration.instance as T;
      }

      // Mark as resolving (circular dependency detection)
      this.resolving.add(key);
      try {
        const instance = registration.factory(this) as T;

        // Cache singleton instance
        if (registration.singleton) {
          registration.instance = instance;
        }

        return instance;
      } finally {
        this.resolving.delete(key);
      }
    }

    // Fall back to parent container
    if (this.parent) {
      return this.parent.resolve<T>(key);
    }

    // Service not found
    const keyName = typeof key === 'symbol' ? key.toString() : key;
    throw new Error(`Service not registered: ${keyName}`);
  }

  resolveOptional<T>(key: ServiceKey): T | undefined {
    if (this.has(key)) {
      return this.resolve<T>(key);
    }
    return undefined;
  }

  has(key: ServiceKey): boolean {
    if (this.registrations.has(key)) {
      return true;
    }
    if (this.parent) {
      return this.parent.has(key);
    }
    return false;
  }

  unregister(key: ServiceKey): void {
    this.registrations.delete(key);
  }

  clear(): void {
    this.registrations.clear();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new root container.
 *
 * @example
 * ```typescript
 * const container = createContainer();
 * container.register(ServiceKeys.CACHE_MANAGER, () => new CacheManager());
 * ```
 */
export function createContainer(): Container {
  return new ContainerImpl();
}

/**
 * Create a scoped (child) container that inherits from a parent.
 *
 * The child container can override parent registrations without
 * affecting the parent. This is ideal for test isolation.
 *
 * @param parent - Parent container to inherit from
 *
 * @example
 * ```typescript
 * const parent = createContainer();
 * parent.register(KEY, () => ({ value: 'parent' }));
 *
 * const child = createScope(parent);
 * child.register(KEY, () => ({ value: 'child' }));
 *
 * // child.resolve(KEY).value === 'child'
 * // parent.resolve(KEY).value === 'parent'
 * ```
 */
export function createScope(parent: Container): Container {
  return new ContainerImpl(parent);
}

// =============================================================================
// Service Keys
// =============================================================================

/**
 * Standard service keys for EvoDB components.
 *
 * Use these keys for registering and resolving common EvoDB services.
 * Using symbols ensures uniqueness and prevents key collisions.
 *
 * @example
 * ```typescript
 * import { ServiceKeys, createContainer } from '@evodb/test-utils';
 *
 * const container = createContainer();
 *
 * // Register a mock query planner
 * container.register(ServiceKeys.QUERY_PLANNER, () => ({
 *   createPlan: () => ({ planId: 'mock' }),
 * }));
 * ```
 */
export const ServiceKeys = {
  /** QueryPlanner - creates query execution plans */
  QUERY_PLANNER: Symbol('QueryPlanner'),

  /** ZoneMapOptimizer - prunes partitions using zone maps */
  ZONE_MAP_OPTIMIZER: Symbol('ZoneMapOptimizer'),

  /** BloomFilterManager - manages bloom filters for point lookups */
  BLOOM_FILTER_MANAGER: Symbol('BloomFilterManager'),

  /** CacheManager - handles edge cache integration */
  CACHE_MANAGER: Symbol('CacheManager'),

  /** ResultProcessor - processes and formats query results */
  RESULT_PROCESSOR: Symbol('ResultProcessor'),

  /** TableDataSource - provides table data (R2DataSource or MockDataSource) */
  DATA_SOURCE: Symbol('DataSource'),

  /** AggregationEngine - performs aggregation operations */
  AGGREGATION_ENGINE: Symbol('AggregationEngine'),

  /** PartitionScanner - scans partition data */
  PARTITION_SCANNER: Symbol('PartitionScanner'),

  /** R2Bucket - R2 storage bucket */
  R2_BUCKET: Symbol('R2Bucket'),

  /** DurableObjectStorage - DO storage interface */
  DO_STORAGE: Symbol('DurableObjectStorage'),

  /** Configuration object */
  CONFIG: Symbol('Config'),
} as const;

/**
 * Type representing all service key values.
 */
export type ServiceKeyValue = (typeof ServiceKeys)[keyof typeof ServiceKeys];

// =============================================================================
// Helper Functions for Testing
// =============================================================================

/**
 * Create a test container with common mocks pre-registered.
 *
 * This is a convenience function for tests that need a container
 * with basic mocks already set up.
 *
 * @param overrides - Optional factory overrides for specific services
 *
 * @example
 * ```typescript
 * const container = createTestContainer({
 *   [ServiceKeys.CACHE_MANAGER]: () => new CustomMockCacheManager(),
 * });
 * ```
 */
export function createTestContainer(
  overrides?: Partial<Record<ServiceKeyValue, ServiceFactory<unknown>>>
): Container {
  const container = createContainer();

  // Register default mocks for common services
  container.register(ServiceKeys.ZONE_MAP_OPTIMIZER, () => ({
    prunePartitions: (partitions: unknown[], _predicates: unknown[]) => ({
      selected: partitions,
      pruned: [],
    }),
    estimateSelectivity: () => 1.0,
  }));

  container.register(ServiceKeys.BLOOM_FILTER_MANAGER, () => ({
    mightContain: () => true,
    checkPredicate: () => true,
    getStats: () => ({ checks: 0, hits: 0, falsePositiveRate: 0, trueNegatives: 0, targetFpr: 0.01 }),
    registerFilter: () => {},
    registerFilterFromBytes: () => {},
    getFilterBytes: () => null,
    hasFilter: () => false,
    recordTrueNegative: () => {},
    clear: () => {},
  }));

  container.register(ServiceKeys.CACHE_MANAGER, () => ({
    isCached: () => Promise.resolve(false),
    getPartitionData: () => Promise.resolve({ data: null, fromCache: false }),
    prefetch: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    invalidate: () => Promise.resolve(),
    getStats: () => ({ hits: 0, misses: 0, hitRatio: 0, bytesFromCache: 0 }),
  }));

  container.register(ServiceKeys.RESULT_PROCESSOR, () => ({
    sort: <T extends Record<string, unknown>>(rows: T[], _orderBy: unknown[]) => rows,
    limit: <T>(rows: T[], limit: number, offset: number = 0) => rows.slice(offset, offset + limit),
  }));

  // Apply any overrides (handle both symbol and string keys)
  if (overrides) {
    // Handle symbol keys
    const symbolKeys = Object.getOwnPropertySymbols(overrides) as ServiceKeyValue[];
    for (const key of symbolKeys) {
      const factory = (overrides as Record<symbol, ServiceFactory<unknown>>)[key];
      if (factory) {
        container.register(key, factory);
      }
    }

    // Handle string keys (type assertion needed due to symbol key presence)
    const entries = Object.entries(overrides) as Array<[string, ServiceFactory<unknown> | undefined]>;
    for (const [key, factory] of entries) {
      if (factory) {
        container.register(key as ServiceKey, factory);
      }
    }
  }

  return container;
}
