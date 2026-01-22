/**
 * Plugin Validation
 *
 * TDD Issue: evodb-w1m
 *
 * Validation functions for plugin types:
 * - validateEncodingPlugin
 * - validateIndexPlugin
 * - validateStorageAdapterPlugin
 * - Type guards for plugin identification
 */

import type {
  EncodingPlugin,
  IndexPlugin,
  StorageAdapterPlugin,
  PluginMetadata,
  BasePlugin,
} from './types.js';
import { PluginValidationError } from './plugin-errors.js';

// =============================================================================
// Metadata Validation
// =============================================================================

/**
 * Validate that plugin metadata is complete.
 *
 * @param metadata - Metadata to validate
 * @param pluginName - Name to use in error messages
 * @throws PluginValidationError if metadata is invalid
 */
function validateMetadata(metadata: unknown, pluginName: string): asserts metadata is PluginMetadata {
  if (!metadata || typeof metadata !== 'object') {
    throw new PluginValidationError(pluginName, 'metadata is required and must be an object');
  }

  const meta = metadata as Record<string, unknown>;

  if (typeof meta.name !== 'string' || meta.name.trim() === '') {
    throw new PluginValidationError(pluginName, 'metadata.name is required and must be a non-empty string');
  }

  if (typeof meta.version !== 'string' || meta.version.trim() === '') {
    throw new PluginValidationError(pluginName, 'metadata.version is required and must be a non-empty string');
  }
}

// =============================================================================
// Encoding Plugin Validation
// =============================================================================

/**
 * Minimum typeId for custom encodings (0-99 reserved for built-in).
 */
const MIN_CUSTOM_TYPE_ID = 100;

/**
 * Validate an encoding plugin.
 *
 * @param plugin - Plugin to validate
 * @throws PluginValidationError if plugin is invalid
 */
export function validateEncodingPlugin(plugin: unknown): asserts plugin is EncodingPlugin {
  const name = getPluginName(plugin);

  validateMetadata((plugin as BasePlugin)?.metadata, name);

  const p = plugin as Partial<EncodingPlugin>;

  // Validate typeId
  if (typeof p.typeId !== 'number') {
    throw new PluginValidationError(name, 'typeId is required and must be a number');
  }

  if (p.typeId < MIN_CUSTOM_TYPE_ID) {
    throw new PluginValidationError(
      name,
      `typeId must be >= ${MIN_CUSTOM_TYPE_ID} (0-99 reserved for built-in encodings)`,
      { typeId: p.typeId, minAllowed: MIN_CUSTOM_TYPE_ID }
    );
  }

  // Validate supportedTypes
  if (!Array.isArray(p.supportedTypes) || p.supportedTypes.length === 0) {
    throw new PluginValidationError(name, 'supportedTypes must be a non-empty array of Type values');
  }

  // Validate required functions
  if (typeof p.encode !== 'function') {
    throw new PluginValidationError(name, 'encode function is required', { field: 'encode' });
  }

  if (typeof p.decode !== 'function') {
    throw new PluginValidationError(name, 'decode function is required', { field: 'decode' });
  }

  if (typeof p.estimateSize !== 'function') {
    throw new PluginValidationError(name, 'estimateSize function is required', { field: 'estimateSize' });
  }

  if (typeof p.shouldUse !== 'function') {
    throw new PluginValidationError(name, 'shouldUse function is required', { field: 'shouldUse' });
  }
}

// =============================================================================
// Index Plugin Validation
// =============================================================================

/**
 * Validate an index plugin.
 *
 * @param plugin - Plugin to validate
 * @throws PluginValidationError if plugin is invalid
 */
export function validateIndexPlugin(plugin: unknown): asserts plugin is IndexPlugin {
  const name = getPluginName(plugin);

  validateMetadata((plugin as BasePlugin)?.metadata, name);

  const p = plugin as Partial<IndexPlugin>;

  // Validate indexType
  if (typeof p.indexType !== 'string' || p.indexType.trim() === '') {
    throw new PluginValidationError(name, 'indexType is required and must be a non-empty string');
  }

  // Validate required functions
  if (typeof p.build !== 'function') {
    throw new PluginValidationError(name, 'build function is required', { field: 'build' });
  }

  if (typeof p.search !== 'function') {
    throw new PluginValidationError(name, 'search function is required', { field: 'search' });
  }

  if (typeof p.serialize !== 'function') {
    throw new PluginValidationError(name, 'serialize function is required', { field: 'serialize' });
  }

  if (typeof p.deserialize !== 'function') {
    throw new PluginValidationError(name, 'deserialize function is required', { field: 'deserialize' });
  }
}

// =============================================================================
// Storage Adapter Plugin Validation
// =============================================================================

/**
 * Validate a storage adapter plugin.
 *
 * @param plugin - Plugin to validate
 * @throws PluginValidationError if plugin is invalid
 */
export function validateStorageAdapterPlugin(plugin: unknown): asserts plugin is StorageAdapterPlugin {
  const name = getPluginName(plugin);

  validateMetadata((plugin as BasePlugin)?.metadata, name);

  const p = plugin as Partial<StorageAdapterPlugin>;

  // Validate adapterType
  if (typeof p.adapterType !== 'string' || p.adapterType.trim() === '') {
    throw new PluginValidationError(name, 'adapterType is required and must be a non-empty string');
  }

  // Validate required functions
  if (typeof p.createAdapter !== 'function') {
    throw new PluginValidationError(name, 'createAdapter function is required', { field: 'createAdapter' });
  }
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an object is an EncodingPlugin.
 *
 * @param obj - Object to check
 * @returns true if obj is an EncodingPlugin
 */
export function isEncodingPlugin(obj: unknown): obj is EncodingPlugin {
  if (!obj || typeof obj !== 'object') return false;

  const plugin = obj as Partial<EncodingPlugin>;
  return (
    plugin.metadata !== undefined &&
    typeof plugin.metadata.name === 'string' &&
    typeof plugin.typeId === 'number' &&
    Array.isArray(plugin.supportedTypes) &&
    typeof plugin.encode === 'function' &&
    typeof plugin.decode === 'function' &&
    typeof plugin.estimateSize === 'function' &&
    typeof plugin.shouldUse === 'function'
  );
}

/**
 * Check if an object is an IndexPlugin.
 *
 * @param obj - Object to check
 * @returns true if obj is an IndexPlugin
 */
export function isIndexPlugin(obj: unknown): obj is IndexPlugin {
  if (!obj || typeof obj !== 'object') return false;

  const plugin = obj as Partial<IndexPlugin>;
  return (
    plugin.metadata !== undefined &&
    typeof plugin.metadata.name === 'string' &&
    typeof plugin.indexType === 'string' &&
    typeof plugin.build === 'function' &&
    typeof plugin.search === 'function' &&
    typeof plugin.serialize === 'function' &&
    typeof plugin.deserialize === 'function'
  );
}

/**
 * Check if an object is a StorageAdapterPlugin.
 *
 * @param obj - Object to check
 * @returns true if obj is a StorageAdapterPlugin
 */
export function isStorageAdapterPlugin(obj: unknown): obj is StorageAdapterPlugin {
  if (!obj || typeof obj !== 'object') return false;

  const plugin = obj as Partial<StorageAdapterPlugin>;
  return (
    plugin.metadata !== undefined &&
    typeof plugin.metadata.name === 'string' &&
    typeof plugin.adapterType === 'string' &&
    typeof plugin.createAdapter === 'function'
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract plugin name from an object for error messages.
 */
function getPluginName(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return 'unknown';
  const plugin = obj as Partial<BasePlugin>;
  if (plugin.metadata && typeof plugin.metadata.name === 'string') {
    return plugin.metadata.name;
  }
  return 'unknown';
}
