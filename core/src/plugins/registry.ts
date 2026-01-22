/**
 * Plugin Registry
 *
 * TDD Issue: evodb-w1m
 *
 * The PluginRegistry manages registration, lookup, and lifecycle of plugins.
 * It provides type-safe methods for each plugin type and handles:
 * - Validation on registration
 * - Duplicate detection
 * - Plugin initialization and disposal
 * - Selection of best encoding for a column
 */

import type {
  EncodingPlugin,
  IndexPlugin,
  StorageAdapterPlugin,
  PluginContext,
} from './types.js';
import {
  validateEncodingPlugin,
  validateIndexPlugin,
  validateStorageAdapterPlugin,
} from './plugin-validation.js';
import {
  PluginRegistrationError,
  PluginNotFoundError,
} from './plugin-errors.js';
import type { Type, ColumnStats } from '../types.js';

// =============================================================================
// Plugin Registry Interface
// =============================================================================

/**
 * Registry for managing plugins.
 * Provides methods to register, lookup, and manage plugins of all types.
 */
export interface PluginRegistry {
  // =========================================================================
  // Encoding Plugins
  // =========================================================================

  /**
   * Register an encoding plugin.
   *
   * @param plugin - The encoding plugin to register
   * @param context - Optional context passed to plugin initialize()
   * @throws PluginRegistrationError if name or typeId already registered
   * @throws PluginValidationError if plugin is invalid
   */
  registerEncoding(plugin: EncodingPlugin, context?: PluginContext): void;

  /**
   * Unregister an encoding plugin by name.
   * Calls the plugin's dispose() method if defined.
   *
   * @param name - Plugin name to unregister
   */
  unregisterEncoding(name: string): void;

  /**
   * Get an encoding plugin by name.
   *
   * @param name - Plugin name
   * @returns The encoding plugin
   * @throws PluginNotFoundError if not found
   */
  getEncoding(name: string): EncodingPlugin;

  /**
   * Get an encoding plugin by its type ID.
   *
   * @param typeId - Encoding type ID
   * @returns The encoding plugin or undefined if not found
   */
  getEncodingByTypeId(typeId: number): EncodingPlugin | undefined;

  /**
   * Check if an encoding plugin is registered.
   *
   * @param name - Plugin name
   * @returns true if registered
   */
  hasEncoding(name: string): boolean;

  /**
   * List all registered encoding plugins.
   *
   * @returns Array of encoding plugins
   */
  listEncodings(): EncodingPlugin[];

  /**
   * Select the best encoding for a column based on registered plugins.
   *
   * @param type - Column type
   * @param values - Column values
   * @param stats - Column statistics
   * @returns Best encoding plugin or null if none suitable
   */
  selectEncoding(type: Type, values: unknown[], stats: ColumnStats): EncodingPlugin | null;

  // =========================================================================
  // Index Plugins
  // =========================================================================

  /**
   * Register an index plugin.
   *
   * @param plugin - The index plugin to register
   * @param context - Optional context passed to plugin initialize()
   * @throws PluginRegistrationError if name or indexType already registered
   * @throws PluginValidationError if plugin is invalid
   */
  registerIndex(plugin: IndexPlugin, context?: PluginContext): void;

  /**
   * Unregister an index plugin by name.
   *
   * @param name - Plugin name to unregister
   */
  unregisterIndex(name: string): void;

  /**
   * Get an index plugin by name.
   *
   * @param name - Plugin name
   * @returns The index plugin
   * @throws PluginNotFoundError if not found
   */
  getIndex(name: string): IndexPlugin;

  /**
   * Get an index plugin by its type.
   *
   * @param indexType - Index type identifier
   * @returns The index plugin or undefined if not found
   */
  getIndexByType(indexType: string): IndexPlugin | undefined;

  /**
   * Check if an index plugin is registered.
   *
   * @param name - Plugin name
   * @returns true if registered
   */
  hasIndex(name: string): boolean;

  /**
   * List all registered index plugins.
   *
   * @returns Array of index plugins
   */
  listIndexes(): IndexPlugin[];

  // =========================================================================
  // Storage Adapter Plugins
  // =========================================================================

  /**
   * Register a storage adapter plugin.
   *
   * @param plugin - The storage adapter plugin to register
   * @param context - Optional context passed to plugin initialize()
   * @throws PluginRegistrationError if name or adapterType already registered
   * @throws PluginValidationError if plugin is invalid
   */
  registerStorageAdapter(plugin: StorageAdapterPlugin, context?: PluginContext): void;

  /**
   * Unregister a storage adapter plugin by name.
   *
   * @param name - Plugin name to unregister
   */
  unregisterStorageAdapter(name: string): void;

  /**
   * Get a storage adapter plugin by name.
   *
   * @param name - Plugin name
   * @returns The storage adapter plugin
   * @throws PluginNotFoundError if not found
   */
  getStorageAdapter(name: string): StorageAdapterPlugin;

  /**
   * Get a storage adapter plugin by its type.
   *
   * @param adapterType - Adapter type identifier
   * @returns The storage adapter plugin or undefined if not found
   */
  getStorageAdapterByType(adapterType: string): StorageAdapterPlugin | undefined;

  /**
   * Check if a storage adapter plugin is registered.
   *
   * @param name - Plugin name
   * @returns true if registered
   */
  hasStorageAdapter(name: string): boolean;

  /**
   * List all registered storage adapter plugins.
   *
   * @returns Array of storage adapter plugins
   */
  listStorageAdapters(): StorageAdapterPlugin[];

  // =========================================================================
  // Registry Management
  // =========================================================================

  /**
   * Reset the registry, removing all plugins.
   * Calls dispose() on all plugins with that method.
   */
  reset(): void;
}

// =============================================================================
// Plugin Registry Implementation
// =============================================================================

/**
 * In-memory implementation of PluginRegistry.
 */
class InMemoryPluginRegistry implements PluginRegistry {
  private encodings = new Map<string, EncodingPlugin>();
  private encodingsByTypeId = new Map<number, EncodingPlugin>();
  private indexes = new Map<string, IndexPlugin>();
  private indexesByType = new Map<string, IndexPlugin>();
  private storageAdapters = new Map<string, StorageAdapterPlugin>();
  private storageAdaptersByType = new Map<string, StorageAdapterPlugin>();

  // =========================================================================
  // Encoding Plugins
  // =========================================================================

  registerEncoding(plugin: EncodingPlugin, context?: PluginContext): void {
    // Validate the plugin
    validateEncodingPlugin(plugin);

    const name = plugin.metadata.name;

    // Check for duplicate name
    if (this.encodings.has(name)) {
      throw new PluginRegistrationError(name, `Encoding plugin '${name}' is already registered`);
    }

    // Check for duplicate typeId
    if (this.encodingsByTypeId.has(plugin.typeId)) {
      const existing = this.encodingsByTypeId.get(plugin.typeId)!;
      throw new PluginRegistrationError(
        name,
        `Encoding typeId ${plugin.typeId} is already registered by '${existing.metadata.name}'`
      );
    }

    // Initialize the plugin if it has an initialize method
    if (plugin.initialize && context) {
      plugin.initialize(context);
    }

    // Register the plugin
    this.encodings.set(name, plugin);
    this.encodingsByTypeId.set(plugin.typeId, plugin);
  }

  unregisterEncoding(name: string): void {
    const plugin = this.encodings.get(name);
    if (plugin) {
      // Call dispose if defined
      if (plugin.dispose) {
        plugin.dispose();
      }
      this.encodings.delete(name);
      this.encodingsByTypeId.delete(plugin.typeId);
    }
  }

  getEncoding(name: string): EncodingPlugin {
    const plugin = this.encodings.get(name);
    if (!plugin) {
      throw new PluginNotFoundError(name, 'encoding');
    }
    return plugin;
  }

  getEncodingByTypeId(typeId: number): EncodingPlugin | undefined {
    return this.encodingsByTypeId.get(typeId);
  }

  hasEncoding(name: string): boolean {
    return this.encodings.has(name);
  }

  listEncodings(): EncodingPlugin[] {
    return Array.from(this.encodings.values());
  }

  selectEncoding(type: Type, values: unknown[], stats: ColumnStats): EncodingPlugin | null {
    let bestPlugin: EncodingPlugin | null = null;
    let bestPriority = Number.NEGATIVE_INFINITY;
    let bestSize = Number.POSITIVE_INFINITY;

    for (const plugin of this.encodings.values()) {
      // Check if plugin supports this type
      if (!plugin.supportedTypes.includes(type)) {
        continue;
      }

      // Check if plugin wants to handle this data
      if (!plugin.shouldUse(values, stats)) {
        continue;
      }

      const priority = plugin.priority ?? 0;
      const estimatedSize = plugin.estimateSize(values);

      // Select by priority first, then by estimated size
      if (priority > bestPriority || (priority === bestPriority && estimatedSize < bestSize)) {
        bestPlugin = plugin;
        bestPriority = priority;
        bestSize = estimatedSize;
      }
    }

    return bestPlugin;
  }

  // =========================================================================
  // Index Plugins
  // =========================================================================

  registerIndex(plugin: IndexPlugin, context?: PluginContext): void {
    // Validate the plugin
    validateIndexPlugin(plugin);

    const name = plugin.metadata.name;

    // Check for duplicate name
    if (this.indexes.has(name)) {
      throw new PluginRegistrationError(name, `Index plugin '${name}' is already registered`);
    }

    // Check for duplicate indexType
    if (this.indexesByType.has(plugin.indexType)) {
      const existing = this.indexesByType.get(plugin.indexType)!;
      throw new PluginRegistrationError(
        name,
        `Index type '${plugin.indexType}' is already registered by '${existing.metadata.name}'`
      );
    }

    // Initialize the plugin if it has an initialize method
    if (plugin.initialize && context) {
      plugin.initialize(context);
    }

    // Register the plugin
    this.indexes.set(name, plugin);
    this.indexesByType.set(plugin.indexType, plugin);
  }

  unregisterIndex(name: string): void {
    const plugin = this.indexes.get(name);
    if (plugin) {
      // Call dispose if defined
      if (plugin.dispose) {
        plugin.dispose();
      }
      this.indexes.delete(name);
      this.indexesByType.delete(plugin.indexType);
    }
  }

  getIndex(name: string): IndexPlugin {
    const plugin = this.indexes.get(name);
    if (!plugin) {
      throw new PluginNotFoundError(name, 'index');
    }
    return plugin;
  }

  getIndexByType(indexType: string): IndexPlugin | undefined {
    return this.indexesByType.get(indexType);
  }

  hasIndex(name: string): boolean {
    return this.indexes.has(name);
  }

  listIndexes(): IndexPlugin[] {
    return Array.from(this.indexes.values());
  }

  // =========================================================================
  // Storage Adapter Plugins
  // =========================================================================

  registerStorageAdapter(plugin: StorageAdapterPlugin, context?: PluginContext): void {
    // Validate the plugin
    validateStorageAdapterPlugin(plugin);

    const name = plugin.metadata.name;

    // Check for duplicate name
    if (this.storageAdapters.has(name)) {
      throw new PluginRegistrationError(name, `Storage adapter plugin '${name}' is already registered`);
    }

    // Check for duplicate adapterType
    if (this.storageAdaptersByType.has(plugin.adapterType)) {
      const existing = this.storageAdaptersByType.get(plugin.adapterType)!;
      throw new PluginRegistrationError(
        name,
        `Adapter type '${plugin.adapterType}' is already registered by '${existing.metadata.name}'`
      );
    }

    // Initialize the plugin if it has an initialize method
    if (plugin.initialize && context) {
      plugin.initialize(context);
    }

    // Register the plugin
    this.storageAdapters.set(name, plugin);
    this.storageAdaptersByType.set(plugin.adapterType, plugin);
  }

  unregisterStorageAdapter(name: string): void {
    const plugin = this.storageAdapters.get(name);
    if (plugin) {
      // Call dispose if defined
      if (plugin.dispose) {
        plugin.dispose();
      }
      this.storageAdapters.delete(name);
      this.storageAdaptersByType.delete(plugin.adapterType);
    }
  }

  getStorageAdapter(name: string): StorageAdapterPlugin {
    const plugin = this.storageAdapters.get(name);
    if (!plugin) {
      throw new PluginNotFoundError(name, 'storage-adapter');
    }
    return plugin;
  }

  getStorageAdapterByType(adapterType: string): StorageAdapterPlugin | undefined {
    return this.storageAdaptersByType.get(adapterType);
  }

  hasStorageAdapter(name: string): boolean {
    return this.storageAdapters.has(name);
  }

  listStorageAdapters(): StorageAdapterPlugin[] {
    return Array.from(this.storageAdapters.values());
  }

  // =========================================================================
  // Registry Management
  // =========================================================================

  reset(): void {
    // Dispose all encoding plugins
    for (const plugin of this.encodings.values()) {
      if (plugin.dispose) {
        plugin.dispose();
      }
    }

    // Dispose all index plugins
    for (const plugin of this.indexes.values()) {
      if (plugin.dispose) {
        plugin.dispose();
      }
    }

    // Dispose all storage adapter plugins
    for (const plugin of this.storageAdapters.values()) {
      if (plugin.dispose) {
        plugin.dispose();
      }
    }

    // Clear all maps
    this.encodings.clear();
    this.encodingsByTypeId.clear();
    this.indexes.clear();
    this.indexesByType.clear();
    this.storageAdapters.clear();
    this.storageAdaptersByType.clear();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new plugin registry instance.
 *
 * @returns A new PluginRegistry
 *
 * @example
 * ```typescript
 * const registry = createPluginRegistry();
 * registry.registerEncoding(myEncodingPlugin);
 * registry.registerIndex(myIndexPlugin);
 * ```
 */
export function createPluginRegistry(): PluginRegistry {
  return new InMemoryPluginRegistry();
}

// =============================================================================
// Global Registry (Optional Singleton)
// =============================================================================

let globalRegistry: PluginRegistry | null = null;

/**
 * Get the global plugin registry singleton.
 * Creates one if it doesn't exist.
 *
 * @returns The global plugin registry
 *
 * @example
 * ```typescript
 * // Register plugins globally
 * getGlobalRegistry().registerEncoding(myPlugin);
 *
 * // Use in another module
 * const plugin = getGlobalRegistry().getEncoding('my-plugin');
 * ```
 */
export function getGlobalRegistry(): PluginRegistry {
  if (!globalRegistry) {
    globalRegistry = createPluginRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global plugin registry.
 * Useful for testing.
 */
export function resetGlobalRegistry(): void {
  if (globalRegistry) {
    globalRegistry.reset();
    globalRegistry = null;
  }
}

// Re-export PluginRegistry class for type annotations
export { InMemoryPluginRegistry };
