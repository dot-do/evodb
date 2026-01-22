/**
 * Plugin Architecture Tests
 *
 * TDD Issue: evodb-w1m
 *
 * Tests for the plugin architecture that allows:
 * - Custom encoding strategies
 * - Custom index types
 * - Extension points for storage adapters
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  // Plugin interfaces
  type EncodingPlugin,
  type IndexPlugin,
  type StorageAdapterPlugin,
  type PluginMetadata,
  type PluginContext,
  // Registry
  PluginRegistry,
  createPluginRegistry,
  // Plugin validation
  validateEncodingPlugin,
  validateIndexPlugin,
  validateStorageAdapterPlugin,
  // Plugin errors
  PluginError,
  PluginRegistrationError,
  PluginNotFoundError,
  PluginValidationError,
  // Type guards
  isEncodingPlugin,
  isIndexPlugin,
  isStorageAdapterPlugin,
} from '../plugins/index.js';
import { type ColumnStats, Type, Encoding } from '../types.js';

// =============================================================================
// Test Plugin Implementations
// =============================================================================

/** Test encoding plugin that doubles values */
function createTestEncodingPlugin(): EncodingPlugin {
  return {
    metadata: {
      name: 'test-encoding',
      version: '1.0.0',
      description: 'Test encoding plugin',
    },
    typeId: 100, // Custom type IDs should be >= 100
    supportedTypes: [Type.Int32],

    encode(values: unknown[], stats: ColumnStats): Uint8Array {
      const arr = new Int32Array(values.length);
      for (let i = 0; i < values.length; i++) {
        arr[i] = (values[i] as number) * 2;
      }
      return new Uint8Array(arr.buffer);
    },

    decode(data: Uint8Array, count: number, stats: ColumnStats): unknown[] {
      const arr = new Int32Array(data.buffer, data.byteOffset, count);
      const result: number[] = [];
      for (let i = 0; i < count; i++) {
        result.push(arr[i] / 2);
      }
      return result;
    },

    estimateSize(values: unknown[]): number {
      return values.length * 4;
    },

    shouldUse(values: unknown[], stats: ColumnStats): boolean {
      return values.length > 10;
    },
  };
}

/** Test index plugin for testing */
function createTestIndexPlugin(): IndexPlugin {
  return {
    metadata: {
      name: 'test-index',
      version: '1.0.0',
      description: 'Test index plugin',
    },
    indexType: 'test-hash',

    async build(data: ArrayBuffer, config: Record<string, unknown>): Promise<unknown> {
      return { type: 'test-hash', data: new Uint8Array(data) };
    },

    async search(index: unknown, query: unknown, k: number): Promise<Array<{ id: string; score: number }>> {
      return [{ id: '1', score: 1.0 }];
    },

    serialize(index: unknown): Uint8Array {
      return new Uint8Array([1, 2, 3]);
    },

    deserialize(data: Uint8Array): unknown {
      return { type: 'test-hash', data };
    },
  };
}

/** Test storage adapter plugin */
function createTestStoragePlugin(): StorageAdapterPlugin {
  const storage = new Map<string, Uint8Array>();

  return {
    metadata: {
      name: 'test-storage',
      version: '1.0.0',
      description: 'Test storage adapter plugin',
    },
    adapterType: 'memory-custom',

    createAdapter(config: Record<string, unknown>) {
      return {
        async get(key: string): Promise<Uint8Array | null> {
          return storage.get(key) ?? null;
        },
        async put(key: string, data: Uint8Array): Promise<void> {
          storage.set(key, data);
        },
        async delete(key: string): Promise<void> {
          storage.delete(key);
        },
        async list(prefix: string): Promise<string[]> {
          return Array.from(storage.keys()).filter(k => k.startsWith(prefix));
        },
        async exists(key: string): Promise<boolean> {
          return storage.has(key);
        },
      };
    },
  };
}

// =============================================================================
// Plugin Interface Tests
// =============================================================================

describe('Plugin Interfaces', () => {
  describe('EncodingPlugin', () => {
    it('should have required metadata', () => {
      const plugin = createTestEncodingPlugin();
      expect(plugin.metadata.name).toBe('test-encoding');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.description).toBeDefined();
    });

    it('should have typeId >= 100 for custom encodings', () => {
      const plugin = createTestEncodingPlugin();
      expect(plugin.typeId).toBeGreaterThanOrEqual(100);
    });

    it('should specify supported types', () => {
      const plugin = createTestEncodingPlugin();
      expect(plugin.supportedTypes).toContain(Type.Int32);
    });

    it('should encode and decode values correctly', () => {
      const plugin = createTestEncodingPlugin();
      const values = [1, 2, 3, 4, 5];
      const stats: ColumnStats = { min: 1, max: 5, nullCount: 0, distinctEst: 5 };

      const encoded = plugin.encode(values, stats);
      const decoded = plugin.decode(encoded, values.length, stats);

      expect(decoded).toEqual(values);
    });

    it('should estimate encoded size', () => {
      const plugin = createTestEncodingPlugin();
      const values = [1, 2, 3, 4, 5];
      const estimatedSize = plugin.estimateSize(values);
      expect(estimatedSize).toBe(20); // 5 * 4 bytes per int32
    });

    it('should determine if encoding should be used', () => {
      const plugin = createTestEncodingPlugin();
      const smallValues = [1, 2, 3];
      const largeValues = new Array(100).fill(1);
      const stats: ColumnStats = { min: 1, max: 1, nullCount: 0, distinctEst: 1 };

      expect(plugin.shouldUse(smallValues, stats)).toBe(false);
      expect(plugin.shouldUse(largeValues, stats)).toBe(true);
    });
  });

  describe('IndexPlugin', () => {
    it('should have required metadata', () => {
      const plugin = createTestIndexPlugin();
      expect(plugin.metadata.name).toBe('test-index');
      expect(plugin.metadata.version).toBe('1.0.0');
    });

    it('should have indexType identifier', () => {
      const plugin = createTestIndexPlugin();
      expect(plugin.indexType).toBe('test-hash');
    });

    it('should build and search index', async () => {
      const plugin = createTestIndexPlugin();
      const data = new ArrayBuffer(10);
      const index = await plugin.build(data, {});
      const results = await plugin.search(index, {}, 10);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    it('should serialize and deserialize index', async () => {
      const plugin = createTestIndexPlugin();
      const data = new ArrayBuffer(10);
      const index = await plugin.build(data, {});

      const serialized = plugin.serialize(index);
      const deserialized = plugin.deserialize(serialized);

      expect(deserialized).toBeDefined();
    });
  });

  describe('StorageAdapterPlugin', () => {
    it('should have required metadata', () => {
      const plugin = createTestStoragePlugin();
      expect(plugin.metadata.name).toBe('test-storage');
      expect(plugin.metadata.version).toBe('1.0.0');
    });

    it('should have adapterType identifier', () => {
      const plugin = createTestStoragePlugin();
      expect(plugin.adapterType).toBe('memory-custom');
    });

    it('should create functional storage adapter', async () => {
      const plugin = createTestStoragePlugin();
      const adapter = plugin.createAdapter({});

      await adapter.put('test-key', new Uint8Array([1, 2, 3]));
      const data = await adapter.get('test-key');

      expect(data).toEqual(new Uint8Array([1, 2, 3]));
    });
  });
});

// =============================================================================
// Type Guards Tests
// =============================================================================

describe('Plugin Type Guards', () => {
  it('should identify encoding plugins', () => {
    const plugin = createTestEncodingPlugin();
    expect(isEncodingPlugin(plugin)).toBe(true);
    expect(isIndexPlugin(plugin)).toBe(false);
    expect(isStorageAdapterPlugin(plugin)).toBe(false);
  });

  it('should identify index plugins', () => {
    const plugin = createTestIndexPlugin();
    expect(isEncodingPlugin(plugin)).toBe(false);
    expect(isIndexPlugin(plugin)).toBe(true);
    expect(isStorageAdapterPlugin(plugin)).toBe(false);
  });

  it('should identify storage adapter plugins', () => {
    const plugin = createTestStoragePlugin();
    expect(isEncodingPlugin(plugin)).toBe(false);
    expect(isIndexPlugin(plugin)).toBe(false);
    expect(isStorageAdapterPlugin(plugin)).toBe(true);
  });

  it('should reject non-plugin objects', () => {
    expect(isEncodingPlugin({})).toBe(false);
    expect(isIndexPlugin(null)).toBe(false);
    expect(isStorageAdapterPlugin(undefined)).toBe(false);
    expect(isEncodingPlugin({ metadata: { name: 'test' } })).toBe(false);
  });
});

// =============================================================================
// Plugin Validation Tests
// =============================================================================

describe('Plugin Validation', () => {
  describe('validateEncodingPlugin', () => {
    it('should accept valid encoding plugin', () => {
      const plugin = createTestEncodingPlugin();
      expect(() => validateEncodingPlugin(plugin)).not.toThrow();
    });

    it('should reject plugin with missing metadata', () => {
      const plugin = { ...createTestEncodingPlugin(), metadata: undefined } as unknown as EncodingPlugin;
      expect(() => validateEncodingPlugin(plugin)).toThrow(PluginValidationError);
    });

    it('should reject plugin with typeId < 100', () => {
      const plugin = { ...createTestEncodingPlugin(), typeId: 50 };
      expect(() => validateEncodingPlugin(plugin)).toThrow(PluginValidationError);
    });

    it('should reject plugin with empty supportedTypes', () => {
      const plugin = { ...createTestEncodingPlugin(), supportedTypes: [] };
      expect(() => validateEncodingPlugin(plugin)).toThrow(PluginValidationError);
    });

    it('should reject plugin with missing encode function', () => {
      const plugin = { ...createTestEncodingPlugin(), encode: undefined } as unknown as EncodingPlugin;
      expect(() => validateEncodingPlugin(plugin)).toThrow(PluginValidationError);
    });
  });

  describe('validateIndexPlugin', () => {
    it('should accept valid index plugin', () => {
      const plugin = createTestIndexPlugin();
      expect(() => validateIndexPlugin(plugin)).not.toThrow();
    });

    it('should reject plugin with missing indexType', () => {
      const plugin = { ...createTestIndexPlugin(), indexType: '' };
      expect(() => validateIndexPlugin(plugin)).toThrow(PluginValidationError);
    });

    it('should reject plugin with missing build function', () => {
      const plugin = { ...createTestIndexPlugin(), build: undefined } as unknown as IndexPlugin;
      expect(() => validateIndexPlugin(plugin)).toThrow(PluginValidationError);
    });
  });

  describe('validateStorageAdapterPlugin', () => {
    it('should accept valid storage plugin', () => {
      const plugin = createTestStoragePlugin();
      expect(() => validateStorageAdapterPlugin(plugin)).not.toThrow();
    });

    it('should reject plugin with missing adapterType', () => {
      const plugin = { ...createTestStoragePlugin(), adapterType: '' };
      expect(() => validateStorageAdapterPlugin(plugin)).toThrow(PluginValidationError);
    });

    it('should reject plugin with missing createAdapter function', () => {
      const plugin = { ...createTestStoragePlugin(), createAdapter: undefined } as unknown as StorageAdapterPlugin;
      expect(() => validateStorageAdapterPlugin(plugin)).toThrow(PluginValidationError);
    });
  });
});

// =============================================================================
// Plugin Registry Tests
// =============================================================================

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = createPluginRegistry();
  });

  describe('Encoding Plugins', () => {
    it('should register encoding plugin', () => {
      const plugin = createTestEncodingPlugin();
      registry.registerEncoding(plugin);
      expect(registry.hasEncoding('test-encoding')).toBe(true);
    });

    it('should get registered encoding plugin', () => {
      const plugin = createTestEncodingPlugin();
      registry.registerEncoding(plugin);
      const retrieved = registry.getEncoding('test-encoding');
      expect(retrieved).toBe(plugin);
    });

    it('should list all encoding plugins', () => {
      const plugin1 = createTestEncodingPlugin();
      const plugin2 = { ...createTestEncodingPlugin(), metadata: { ...createTestEncodingPlugin().metadata, name: 'test-encoding-2' }, typeId: 101 };

      registry.registerEncoding(plugin1);
      registry.registerEncoding(plugin2);

      const encodings = registry.listEncodings();
      expect(encodings).toHaveLength(2);
      expect(encodings.map(e => e.metadata.name)).toContain('test-encoding');
      expect(encodings.map(e => e.metadata.name)).toContain('test-encoding-2');
    });

    it('should throw on duplicate encoding name', () => {
      const plugin = createTestEncodingPlugin();
      registry.registerEncoding(plugin);
      expect(() => registry.registerEncoding(plugin)).toThrow(PluginRegistrationError);
    });

    it('should throw on duplicate typeId', () => {
      const plugin1 = createTestEncodingPlugin();
      const plugin2 = { ...createTestEncodingPlugin(), metadata: { ...createTestEncodingPlugin().metadata, name: 'different-name' } };

      registry.registerEncoding(plugin1);
      expect(() => registry.registerEncoding(plugin2)).toThrow(PluginRegistrationError);
    });

    it('should throw on getting non-existent encoding', () => {
      expect(() => registry.getEncoding('non-existent')).toThrow(PluginNotFoundError);
    });

    it('should unregister encoding plugin', () => {
      const plugin = createTestEncodingPlugin();
      registry.registerEncoding(plugin);
      registry.unregisterEncoding('test-encoding');
      expect(registry.hasEncoding('test-encoding')).toBe(false);
    });

    it('should get encoding by typeId', () => {
      const plugin = createTestEncodingPlugin();
      registry.registerEncoding(plugin);
      const retrieved = registry.getEncodingByTypeId(100);
      expect(retrieved).toBe(plugin);
    });

    it('should select best encoding for column', () => {
      const plugin = createTestEncodingPlugin();
      registry.registerEncoding(plugin);

      const values = new Array(100).fill(42);
      const stats: ColumnStats = { min: 42, max: 42, nullCount: 0, distinctEst: 1 };

      const selected = registry.selectEncoding(Type.Int32, values, stats);
      expect(selected?.metadata.name).toBe('test-encoding');
    });

    it('should return null when no suitable encoding found', () => {
      const plugin = createTestEncodingPlugin();
      registry.registerEncoding(plugin);

      // Plugin only supports Int32, not String
      const values = ['a', 'b', 'c'];
      const stats: ColumnStats = { min: 'a', max: 'c', nullCount: 0, distinctEst: 3 };

      const selected = registry.selectEncoding(Type.String, values, stats);
      expect(selected).toBeNull();
    });
  });

  describe('Index Plugins', () => {
    it('should register index plugin', () => {
      const plugin = createTestIndexPlugin();
      registry.registerIndex(plugin);
      expect(registry.hasIndex('test-index')).toBe(true);
    });

    it('should get registered index plugin', () => {
      const plugin = createTestIndexPlugin();
      registry.registerIndex(plugin);
      const retrieved = registry.getIndex('test-index');
      expect(retrieved).toBe(plugin);
    });

    it('should list all index plugins', () => {
      const plugin1 = createTestIndexPlugin();
      const plugin2 = { ...createTestIndexPlugin(), metadata: { ...createTestIndexPlugin().metadata, name: 'test-index-2' }, indexType: 'test-hash-2' };

      registry.registerIndex(plugin1);
      registry.registerIndex(plugin2);

      const indexes = registry.listIndexes();
      expect(indexes).toHaveLength(2);
    });

    it('should throw on duplicate index name', () => {
      const plugin = createTestIndexPlugin();
      registry.registerIndex(plugin);
      expect(() => registry.registerIndex(plugin)).toThrow(PluginRegistrationError);
    });

    it('should throw on duplicate indexType', () => {
      const plugin1 = createTestIndexPlugin();
      const plugin2 = { ...createTestIndexPlugin(), metadata: { ...createTestIndexPlugin().metadata, name: 'different-name' } };

      registry.registerIndex(plugin1);
      expect(() => registry.registerIndex(plugin2)).toThrow(PluginRegistrationError);
    });

    it('should get index by type', () => {
      const plugin = createTestIndexPlugin();
      registry.registerIndex(plugin);
      const retrieved = registry.getIndexByType('test-hash');
      expect(retrieved).toBe(plugin);
    });

    it('should unregister index plugin', () => {
      const plugin = createTestIndexPlugin();
      registry.registerIndex(plugin);
      registry.unregisterIndex('test-index');
      expect(registry.hasIndex('test-index')).toBe(false);
    });
  });

  describe('Storage Adapter Plugins', () => {
    it('should register storage adapter plugin', () => {
      const plugin = createTestStoragePlugin();
      registry.registerStorageAdapter(plugin);
      expect(registry.hasStorageAdapter('test-storage')).toBe(true);
    });

    it('should get registered storage adapter plugin', () => {
      const plugin = createTestStoragePlugin();
      registry.registerStorageAdapter(plugin);
      const retrieved = registry.getStorageAdapter('test-storage');
      expect(retrieved).toBe(plugin);
    });

    it('should list all storage adapter plugins', () => {
      const plugin1 = createTestStoragePlugin();
      const plugin2 = { ...createTestStoragePlugin(), metadata: { ...createTestStoragePlugin().metadata, name: 'test-storage-2' }, adapterType: 'memory-custom-2' };

      registry.registerStorageAdapter(plugin1);
      registry.registerStorageAdapter(plugin2);

      const adapters = registry.listStorageAdapters();
      expect(adapters).toHaveLength(2);
    });

    it('should throw on duplicate storage adapter name', () => {
      const plugin = createTestStoragePlugin();
      registry.registerStorageAdapter(plugin);
      expect(() => registry.registerStorageAdapter(plugin)).toThrow(PluginRegistrationError);
    });

    it('should get storage adapter by type', () => {
      const plugin = createTestStoragePlugin();
      registry.registerStorageAdapter(plugin);
      const retrieved = registry.getStorageAdapterByType('memory-custom');
      expect(retrieved).toBe(plugin);
    });

    it('should unregister storage adapter plugin', () => {
      const plugin = createTestStoragePlugin();
      registry.registerStorageAdapter(plugin);
      registry.unregisterStorageAdapter('test-storage');
      expect(registry.hasStorageAdapter('test-storage')).toBe(false);
    });
  });

  describe('Plugin Context', () => {
    it('should initialize plugins with context', () => {
      const initSpy = vi.fn();
      const plugin = {
        ...createTestEncodingPlugin(),
        initialize: initSpy,
      };

      const context: PluginContext = {
        version: '1.0.0',
        environment: 'test',
        config: { debug: true },
      };

      registry.registerEncoding(plugin, context);
      expect(initSpy).toHaveBeenCalledWith(context);
    });

    it('should dispose plugins on unregister', () => {
      const disposeSpy = vi.fn();
      const plugin = {
        ...createTestEncodingPlugin(),
        dispose: disposeSpy,
      };

      registry.registerEncoding(plugin);
      registry.unregisterEncoding('test-encoding');
      expect(disposeSpy).toHaveBeenCalled();
    });
  });

  describe('Registry Reset', () => {
    it('should clear all plugins on reset', () => {
      registry.registerEncoding(createTestEncodingPlugin());
      registry.registerIndex(createTestIndexPlugin());
      registry.registerStorageAdapter(createTestStoragePlugin());

      registry.reset();

      expect(registry.listEncodings()).toHaveLength(0);
      expect(registry.listIndexes()).toHaveLength(0);
      expect(registry.listStorageAdapters()).toHaveLength(0);
    });

    it('should call dispose on all plugins during reset', () => {
      const disposeSpy1 = vi.fn();
      const disposeSpy2 = vi.fn();

      const plugin1 = { ...createTestEncodingPlugin(), dispose: disposeSpy1 };
      const plugin2 = { ...createTestIndexPlugin(), dispose: disposeSpy2 };

      registry.registerEncoding(plugin1);
      registry.registerIndex(plugin2);
      registry.reset();

      expect(disposeSpy1).toHaveBeenCalled();
      expect(disposeSpy2).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Plugin Error Tests
// =============================================================================

describe('Plugin Errors', () => {
  it('should create PluginError with message', () => {
    const error = new PluginError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('PluginError');
  });

  it('should create PluginRegistrationError with plugin name', () => {
    const error = new PluginRegistrationError('test-plugin', 'Already registered');
    expect(error.message).toContain('test-plugin');
    expect(error.message).toContain('Already registered');
    expect(error.pluginName).toBe('test-plugin');
    expect(error.name).toBe('PluginRegistrationError');
  });

  it('should create PluginNotFoundError with plugin name', () => {
    const error = new PluginNotFoundError('test-plugin', 'encoding');
    expect(error.message).toContain('test-plugin');
    expect(error.message).toContain('encoding');
    expect(error.pluginName).toBe('test-plugin');
    expect(error.pluginType).toBe('encoding');
    expect(error.name).toBe('PluginNotFoundError');
  });

  it('should create PluginValidationError with details', () => {
    const error = new PluginValidationError('test-plugin', 'Missing encode function', { field: 'encode' });
    expect(error.message).toContain('test-plugin');
    expect(error.message).toContain('Missing encode function');
    expect(error.details).toEqual({ field: 'encode' });
    expect(error.name).toBe('PluginValidationError');
  });
});
