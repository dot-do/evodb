/**
 * Plugin Architecture Types
 *
 * TDD Issue: evodb-w1m
 *
 * This module defines the core interfaces for the EvoDB plugin system:
 * - EncodingPlugin: Custom encoding strategies
 * - IndexPlugin: Custom index types
 * - StorageAdapterPlugin: Custom storage adapters
 *
 * Design principles:
 * - Plugins are stateless functions where possible
 * - Plugins have metadata for versioning and discovery
 * - Plugins can optionally have lifecycle hooks (initialize/dispose)
 * - Type IDs for custom encodings start at 100 to avoid conflicts
 */

import { type Type, type ColumnStats } from '../types.js';
import { type StorageProvider } from '../storage-provider.js';

// =============================================================================
// Plugin Metadata
// =============================================================================

/**
 * Metadata that all plugins must provide.
 * Used for versioning, discovery, and debugging.
 */
export interface PluginMetadata {
  /** Unique plugin name (used as identifier) */
  name: string;
  /** Semantic version string (e.g., '1.0.0') */
  version: string;
  /** Human-readable description */
  description?: string;
  /** Plugin author or maintainer */
  author?: string;
  /** License identifier (e.g., 'MIT', 'Apache-2.0') */
  license?: string;
  /** Optional tags for categorization */
  tags?: string[];
}

/**
 * Context provided to plugins during initialization.
 * Contains environment information and configuration.
 */
export interface PluginContext {
  /** EvoDB version */
  version: string;
  /** Runtime environment (e.g., 'production', 'development', 'test') */
  environment: string;
  /** Plugin-specific configuration passed during registration */
  config?: Record<string, unknown>;
}

// =============================================================================
// Base Plugin Interface
// =============================================================================

/**
 * Base interface that all plugins extend.
 * Provides common metadata and optional lifecycle hooks.
 */
export interface BasePlugin {
  /** Plugin metadata */
  metadata: PluginMetadata;
  /**
   * Optional initialization hook called when plugin is registered.
   * Use for one-time setup like loading resources or validating config.
   */
  initialize?(context: PluginContext): void | Promise<void>;
  /**
   * Optional disposal hook called when plugin is unregistered.
   * Use for cleanup like releasing resources or closing connections.
   */
  dispose?(): void | Promise<void>;
}

// =============================================================================
// Encoding Plugin Interface
// =============================================================================

/**
 * Plugin for custom column encoding strategies.
 *
 * Encoding plugins allow you to implement custom compression or encoding
 * algorithms for specific data types. The plugin system automatically
 * selects the best encoding based on the shouldUse() method.
 *
 * Type IDs:
 * - 0-99: Reserved for built-in encodings (Plain=0, RLE=1, Dict=2, Delta=3)
 * - 100+: Available for custom plugins
 *
 * @example
 * ```typescript
 * const bitPackedEncoding: EncodingPlugin = {
 *   metadata: { name: 'bit-packed', version: '1.0.0' },
 *   typeId: 100,
 *   supportedTypes: [Type.Int32],
 *
 *   encode(values, stats) {
 *     // Pack integers using minimal bits
 *     return packBits(values, stats.max - stats.min);
 *   },
 *
 *   decode(data, count, stats) {
 *     return unpackBits(data, count, stats.max - stats.min);
 *   },
 *
 *   estimateSize(values) {
 *     return Math.ceil(values.length * bitsNeeded / 8);
 *   },
 *
 *   shouldUse(values, stats) {
 *     // Use when values have small range
 *     return (stats.max - stats.min) < 256;
 *   },
 * };
 * ```
 */
export interface EncodingPlugin extends BasePlugin {
  /**
   * Unique type ID for this encoding (must be >= 100 for custom encodings).
   * This ID is stored in encoded blocks to identify the encoding used.
   */
  typeId: number;

  /**
   * Column types that this encoding supports.
   * The encoding will only be considered for columns matching these types.
   */
  supportedTypes: Type[];

  /**
   * Encode column values to binary format.
   *
   * @param values - Array of column values (non-null values only)
   * @param stats - Column statistics for optimization
   * @returns Encoded binary data
   */
  encode(values: unknown[], stats: ColumnStats): Uint8Array;

  /**
   * Decode binary data back to column values.
   *
   * @param data - Encoded binary data
   * @param count - Number of values to decode
   * @param stats - Column statistics (may be needed for some encodings)
   * @returns Decoded values array
   */
  decode(data: Uint8Array, count: number, stats: ColumnStats): unknown[];

  /**
   * Estimate the encoded size in bytes.
   * Used for encoding selection decisions.
   *
   * @param values - Values to estimate size for
   * @returns Estimated size in bytes
   */
  estimateSize(values: unknown[]): number;

  /**
   * Determine if this encoding should be used for the given data.
   * The registry calls this for each registered encoding and selects
   * the one that returns true with the smallest estimated size.
   *
   * @param values - Values to check
   * @param stats - Column statistics
   * @returns true if this encoding is suitable
   */
  shouldUse(values: unknown[], stats: ColumnStats): boolean;

  /**
   * Optional priority for encoding selection (higher = prefer).
   * When multiple encodings return true from shouldUse(), the one
   * with the highest priority is selected. Default is 0.
   */
  priority?: number;
}

// =============================================================================
// Index Plugin Interface
// =============================================================================

/**
 * Search result from an index query.
 */
export interface IndexSearchResult {
  /** Row or document identifier */
  id: string;
  /** Similarity or relevance score (higher = more relevant) */
  score: number;
  /** Optional additional data returned by the index */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration options for building an index.
 */
export interface IndexBuildConfig {
  /** Number of dimensions for vector indexes */
  dimensions?: number;
  /** Distance metric (e.g., 'euclidean', 'cosine', 'dot') */
  metric?: string;
  /** Number of partitions/centroids for IVF indexes */
  nPartitions?: number;
  /** Number of neighbors for graph-based indexes */
  efConstruction?: number;
  /** Additional index-specific configuration */
  [key: string]: unknown;
}

/**
 * Plugin for custom index types.
 *
 * Index plugins allow you to implement custom indexing algorithms
 * for different search patterns (vector similarity, full-text, geo-spatial, etc.).
 *
 * @example
 * ```typescript
 * const hnswIndex: IndexPlugin = {
 *   metadata: { name: 'hnsw-vector', version: '1.0.0' },
 *   indexType: 'hnsw',
 *
 *   async build(data, config) {
 *     const vectors = parseVectors(data);
 *     return createHNSWGraph(vectors, config.efConstruction ?? 100);
 *   },
 *
 *   async search(index, query, k) {
 *     const vector = query as Float32Array;
 *     return searchHNSW(index, vector, k);
 *   },
 *
 *   serialize(index) {
 *     return serializeHNSWGraph(index);
 *   },
 *
 *   deserialize(data) {
 *     return deserializeHNSWGraph(data);
 *   },
 * };
 * ```
 */
export interface IndexPlugin extends BasePlugin {
  /**
   * Unique index type identifier (e.g., 'hnsw', 'ivf-pq', 'full-text').
   * Used to look up the appropriate plugin when loading an index.
   */
  indexType: string;

  /**
   * Build an index from raw data.
   *
   * @param data - Raw data to index (format depends on index type)
   * @param config - Index configuration options
   * @returns Built index (opaque structure)
   */
  build(data: ArrayBuffer, config: IndexBuildConfig): Promise<unknown>;

  /**
   * Search the index for similar/matching items.
   *
   * @param index - The built index
   * @param query - Query to search for (type depends on index)
   * @param k - Number of results to return
   * @returns Array of search results sorted by relevance
   */
  search(index: unknown, query: unknown, k: number): Promise<IndexSearchResult[]>;

  /**
   * Serialize the index to binary format for storage.
   *
   * @param index - The index to serialize
   * @returns Binary representation of the index
   */
  serialize(index: unknown): Uint8Array;

  /**
   * Deserialize a binary index back to its in-memory representation.
   *
   * @param data - Binary index data
   * @returns Deserialized index
   */
  deserialize(data: Uint8Array): unknown;

  /**
   * Optional: Get statistics about the index.
   *
   * @param index - The index to get stats for
   * @returns Index statistics
   */
  getStats?(index: unknown): {
    size: number;
    itemCount: number;
    buildTime?: number;
    [key: string]: unknown;
  };

  /**
   * Optional: Update the index incrementally.
   *
   * @param index - The index to update
   * @param additions - Items to add
   * @param deletions - IDs to remove
   * @returns Updated index
   */
  update?(index: unknown, additions: ArrayBuffer, deletions: string[]): Promise<unknown>;
}

// =============================================================================
// Storage Adapter Plugin Interface
// =============================================================================

/**
 * Storage adapter created by a plugin.
 * Implements the StorageProvider interface for compatibility.
 */
export type PluginStorageAdapter = StorageProvider;

/**
 * Configuration options for creating a storage adapter.
 */
export interface StorageAdapterConfig {
  /** Connection string or URL */
  connectionString?: string;
  /** Authentication credentials */
  credentials?: {
    accessKey?: string;
    secretKey?: string;
    token?: string;
  };
  /** Region for cloud storage */
  region?: string;
  /** Bucket or container name */
  bucket?: string;
  /** Key prefix for namespacing */
  keyPrefix?: string;
  /** Additional adapter-specific configuration */
  [key: string]: unknown;
}

/**
 * Plugin for custom storage adapters.
 *
 * Storage adapter plugins allow you to implement custom storage backends
 * (e.g., different cloud providers, databases, custom file systems).
 *
 * @example
 * ```typescript
 * const s3StoragePlugin: StorageAdapterPlugin = {
 *   metadata: { name: 's3-storage', version: '1.0.0' },
 *   adapterType: 's3',
 *
 *   createAdapter(config) {
 *     const client = new S3Client({
 *       region: config.region,
 *       credentials: config.credentials,
 *     });
 *     return new S3StorageAdapter(client, config.bucket);
 *   },
 *
 *   async validateConfig(config) {
 *     if (!config.bucket) {
 *       return { valid: false, errors: ['bucket is required'] };
 *     }
 *     return { valid: true, errors: [] };
 *   },
 * };
 * ```
 */
export interface StorageAdapterPlugin extends BasePlugin {
  /**
   * Unique adapter type identifier (e.g., 's3', 'gcs', 'azure-blob').
   * Used to look up the appropriate plugin when creating an adapter.
   */
  adapterType: string;

  /**
   * Create a storage adapter instance.
   *
   * @param config - Adapter configuration
   * @returns Storage adapter implementing StorageProvider
   */
  createAdapter(config: StorageAdapterConfig): PluginStorageAdapter;

  /**
   * Optional: Validate configuration before creating adapter.
   *
   * @param config - Configuration to validate
   * @returns Validation result with any errors
   */
  validateConfig?(config: StorageAdapterConfig): Promise<{
    valid: boolean;
    errors: string[];
    warnings?: string[];
  }>;

  /**
   * Optional: Get health status of an adapter.
   *
   * @param adapter - The adapter to check
   * @returns Health status information
   */
  healthCheck?(adapter: PluginStorageAdapter): Promise<{
    healthy: boolean;
    latency?: number;
    details?: Record<string, unknown>;
  }>;
}

// =============================================================================
// Plugin Union Type
// =============================================================================

/**
 * Union type of all plugin types.
 * Useful for generic plugin handling.
 */
export type Plugin = EncodingPlugin | IndexPlugin | StorageAdapterPlugin;

/**
 * Plugin type discriminator.
 */
export type PluginType = 'encoding' | 'index' | 'storage-adapter';
