/**
 * @evodb/core/plugins - Plugin Architecture
 *
 * TDD Issue: evodb-w1m
 *
 * This module provides a plugin architecture that allows:
 * - Custom encoding strategies (EncodingPlugin)
 * - Custom index types (IndexPlugin)
 * - Extension points for storage adapters (StorageAdapterPlugin)
 *
 * @example
 * ```typescript
 * import {
 *   createPluginRegistry,
 *   EncodingPlugin,
 *   IndexPlugin,
 *   StorageAdapterPlugin,
 * } from '@evodb/core/plugins';
 *
 * // Create a registry
 * const registry = createPluginRegistry();
 *
 * // Register custom plugins
 * registry.registerEncoding(myEncodingPlugin);
 * registry.registerIndex(myIndexPlugin);
 * registry.registerStorageAdapter(myStoragePlugin);
 *
 * // Use plugins
 * const encoding = registry.selectEncoding(Type.Int32, values, stats);
 * ```
 *
 * @module plugins
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Plugin interfaces
  EncodingPlugin,
  IndexPlugin,
  StorageAdapterPlugin,
  // Supporting types
  PluginMetadata,
  PluginContext,
  BasePlugin,
  IndexSearchResult,
  IndexBuildConfig,
  PluginStorageAdapter,
  StorageAdapterConfig,
  Plugin,
  PluginType,
} from './types.js';

// =============================================================================
// Registry
// =============================================================================

export {
  // Registry interface and factory
  type PluginRegistry,
  createPluginRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
} from './registry.js';

// =============================================================================
// Validation
// =============================================================================

export {
  // Validation functions
  validateEncodingPlugin,
  validateIndexPlugin,
  validateStorageAdapterPlugin,
  // Type guards
  isEncodingPlugin,
  isIndexPlugin,
  isStorageAdapterPlugin,
} from './plugin-validation.js';

// =============================================================================
// Errors
// =============================================================================

export {
  PluginError,
  PluginRegistrationError,
  PluginNotFoundError,
  PluginValidationError,
} from './plugin-errors.js';

// =============================================================================
// Example Plugins
// =============================================================================

export {
  // Bit-packed encoding plugin
  BitPackedEncodingPlugin,
  createBitPackedEncodingPlugin,
} from './examples/bit-packed-encoding.js';
