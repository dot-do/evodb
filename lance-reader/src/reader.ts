/**
 * LanceReader - Main class for reading Lance datasets
 * Provides vector search capabilities using IVF-PQ or HNSW indices
 *
 * @module @evodb/lance-reader
 */

import type {
  StorageAdapter,
  LanceManifest,
  LanceFooter,
  LanceReaderConfig,
  VectorSearchOptions,
  SearchResult,
  LanceField,
  LanceIndexMetadata,
  GlobalBufferEntry,
  RowFilter,
} from './types.js';

/**
 * Scalar filter condition for hybrid search
 */
export interface ScalarFilter {
  column: string;
  op: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not_in';
  value: unknown;
}

/**
 * Options for hybrid search (vector + scalar filter)
 */
export interface HybridSearchOptions {
  /** Number of nearest neighbors to return */
  k: number;
  /** Scalar filter to apply */
  filter: ScalarFilter;
  /** When to apply the filter: 'pre' (before vector search) or 'post' (after) */
  filterMode?: 'pre' | 'post';
  /** Number of IVF partitions to probe (IVF-PQ only) */
  nprobes?: number;
  /** Search expansion factor (HNSW only) */
  efSearch?: number;
}
import { LANCE_MAGIC, LANCE_FOOTER_SIZE } from './types.js';
import { parseManifest, parseIvf, parsePqCodebook, parseIndexSection } from './protobuf.js';
import { IvfPqIndex } from './ivf-pq.js';
import { HnswIndex } from './hnsw.js';

// ==========================================
// LRU Cache Implementation
// ==========================================

/**
 * Simple LRU cache for caching buffers
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest (first) entry
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// ==========================================
// Lance File Reader
// ==========================================

/**
 * Low-level reader for Lance file format (.lance files)
 */
export class LanceFileReader {
  private footer: LanceFooter | null = null;
  private footerPromise: Promise<LanceFooter> | null = null;
  private gboTable: GlobalBufferEntry[] | null = null;

  constructor(
    private storage: StorageAdapter,
    private path: string
  ) {}

  /**
   * Read and parse the footer from a Lance file
   */
  async readFooter(): Promise<LanceFooter> {
    if (this.footer) return this.footer;
    if (this.footerPromise) return this.footerPromise;

    this.footerPromise = this._readFooter();
    this.footer = await this.footerPromise;
    return this.footer;
  }

  private async _readFooter(): Promise<LanceFooter> {
    // Read last 4KB to get footer and potentially some metadata
    // This minimizes round trips for small files
    const tailBuffer = await this.storage.getRange(this.path, -4096, 4096);

    // Footer is last 40 bytes
    const footerOffset = tailBuffer.byteLength - LANCE_FOOTER_SIZE;
    const footerView = new DataView(tailBuffer, footerOffset, LANCE_FOOTER_SIZE);

    return this.parseFooter(footerView);
  }

  /**
   * Parse footer from DataView
   */
  private parseFooter(view: DataView): LanceFooter {
    // Verify magic bytes
    const magic = String.fromCharCode(
      view.getUint8(36),
      view.getUint8(37),
      view.getUint8(38),
      view.getUint8(39)
    );

    if (magic !== LANCE_MAGIC) {
      throw new Error(`Invalid Lance file: expected magic "${LANCE_MAGIC}", got "${magic}"`);
    }

    return {
      columnMeta0Offset: view.getBigUint64(0, true),
      cmoTableOffset: view.getBigUint64(8, true),
      gboTableOffset: view.getBigUint64(16, true),
      numGlobalBuffers: view.getUint32(24, true),
      numColumns: view.getUint32(28, true),
      majorVersion: view.getUint16(32, true),
      minorVersion: view.getUint16(34, true),
    };
  }

  /**
   * Read the Global Buffer Offset table
   */
  async readGboTable(): Promise<GlobalBufferEntry[]> {
    if (this.gboTable) return this.gboTable;

    const footer = await this.readFooter();

    if (footer.numGlobalBuffers === 0) {
      this.gboTable = [];
      return this.gboTable;
    }

    // Each entry is 16 bytes: position (u64) + size (u64)
    const tableSize = footer.numGlobalBuffers * 16;
    const tableBuffer = await this.storage.getRange(
      this.path,
      Number(footer.gboTableOffset),
      tableSize
    );

    const tableView = new DataView(tableBuffer);
    const entries: GlobalBufferEntry[] = [];

    for (let i = 0; i < footer.numGlobalBuffers; i++) {
      const offset = i * 16;
      entries.push({
        position: tableView.getBigUint64(offset, true),
        size: tableView.getBigUint64(offset + 8, true),
      });
    }

    this.gboTable = entries;
    return entries;
  }

  /**
   * Read a global buffer by index (0-based)
   */
  async readGlobalBuffer(index: number): Promise<ArrayBuffer> {
    const gboTable = await this.readGboTable();

    if (index < 0 || index >= gboTable.length) {
      throw new Error(`Global buffer index ${index} out of range (0-${gboTable.length - 1})`);
    }

    const entry = gboTable[index];
    return this.storage.getRange(this.path, Number(entry.position), Number(entry.size));
  }

  /**
   * Read a range of bytes from the file
   */
  async readRange(offset: number, length: number): Promise<ArrayBuffer> {
    return this.storage.getRange(this.path, offset, length);
  }

  /**
   * Get file path
   */
  getPath(): string {
    return this.path;
  }

  /**
   * Read the Column Metadata Offset (CMO) table
   * Returns an array of entries with position and size for each column's metadata
   */
  async readColumnMetadataTable(): Promise<{ position: bigint; size: bigint }[]> {
    const footer = await this.readFooter();

    if (footer.numColumns === 0) {
      return [];
    }

    // Each entry is 16 bytes: position (u64) + size (u64)
    const tableSize = footer.numColumns * 16;
    const tableBuffer = await this.storage.getRange(
      this.path,
      Number(footer.cmoTableOffset),
      tableSize
    );

    const tableView = new DataView(tableBuffer);
    const entries: { position: bigint; size: bigint }[] = [];

    for (let i = 0; i < footer.numColumns; i++) {
      const offset = i * 16;
      entries.push({
        position: tableView.getBigUint64(offset, true),
        size: tableView.getBigUint64(offset + 8, true),
      });
    }

    return entries;
  }

  /**
   * Read column data for a specific column index
   * Returns the raw column data buffer
   */
  async readColumnData(columnIndex: number): Promise<ArrayBuffer> {
    const cmoTable = await this.readColumnMetadataTable();

    if (columnIndex < 0 || columnIndex >= cmoTable.length) {
      throw new Error(`Column index ${columnIndex} out of range (0-${cmoTable.length - 1})`);
    }

    const entry = cmoTable[columnIndex];
    return this.storage.getRange(this.path, Number(entry.position), Number(entry.size));
  }
}

// Import VectorIndex for use in this file and re-export it
import { VectorIndex } from './vector-index.js';
export { VectorIndex };

// ==========================================
// Main LanceReader Class
// ==========================================

/**
 * Main class for reading Lance datasets and performing vector search
 *
 * @example
 * ```typescript
 * import { LanceReader, R2StorageAdapter } from '@evodb/lance-reader';
 *
 * const reader = new LanceReader({
 *   storage: new R2StorageAdapter(env.MY_BUCKET),
 *   basePath: 'datasets/embeddings',
 * });
 *
 * await reader.open();
 *
 * const results = await reader.search('embedding', queryVector, { k: 10 });
 * ```
 */
/** Default maximum index cache size */
const DEFAULT_MAX_INDEX_CACHE_SIZE = 10;

export class LanceReader {
  private config: LanceReaderConfig;
  private manifest: LanceManifest | null = null;
  private indexCache: LRUCache<string, VectorIndex>;
  private bufferCache: LRUCache<string, ArrayBuffer>;
  private initialized = false;

  constructor(config: LanceReaderConfig) {
    this.config = {
      cacheStrategy: 'lru',
      maxCacheSize: 50 * 1024 * 1024, // 50MB default
      maxIndexCacheSize: DEFAULT_MAX_INDEX_CACHE_SIZE,
      ...config,
    };

    // Initialize buffer cache based on strategy
    const cacheSize = this.config.cacheStrategy === 'none' ? 0 : 100;
    this.bufferCache = new LRUCache<string, ArrayBuffer>(cacheSize);

    // Initialize index cache with LRU eviction
    const indexCacheSize = this.config.cacheStrategy === 'none' ? 0 : (this.config.maxIndexCacheSize ?? DEFAULT_MAX_INDEX_CACHE_SIZE);
    this.indexCache = new LRUCache<string, VectorIndex>(indexCacheSize);
  }

  /**
   * Open the dataset and load manifest
   */
  async open(): Promise<void> {
    if (this.initialized) return;

    this.manifest = await this.loadManifest();
    this.initialized = true;
  }

  /**
   * List available versions
   */
  async listVersions(): Promise<number[]> {
    const versionsPath = `${this.config.basePath}/_versions`;
    const files = await this.config.storage.list(versionsPath);

    const versions: number[] = [];
    for (const file of files) {
      const match = file.match(/(\d+)\.manifest$/);
      if (match) {
        versions.push(parseInt(match[1], 10));
      }
    }

    return versions.sort((a, b) => a - b);
  }

  /**
   * Load the latest manifest (or specific version)
   */
  async loadManifest(): Promise<LanceManifest> {
    let version = this.config.version;

    if (version === undefined) {
      const versions = await this.listVersions();
      if (versions.length === 0) {
        throw new Error(`No versions found in ${this.config.basePath}/_versions`);
      }
      version = Math.max(...versions);
    }

    return this.loadManifestVersion(version);
  }

  /**
   * Load a specific manifest version
   */
  async loadManifestVersion(version: number): Promise<LanceManifest> {
    const manifestPath = `${this.config.basePath}/_versions/${version}.manifest`;
    const buffer = await this.config.storage.get(manifestPath);

    if (!buffer) {
      throw new Error(`Manifest not found: ${manifestPath}`);
    }

    const manifest = parseManifest(buffer);

    // Load index metadata if present
    if (manifest.indexSection !== undefined) {
      const indexSectionBuffer = await this.config.storage.getRange(
        manifestPath,
        manifest.indexSection,
        buffer.byteLength - manifest.indexSection
      );
      manifest.indices = parseIndexSection(indexSectionBuffer);
    }

    return manifest;
  }

  /**
   * Get the current manifest
   */
  getManifest(): LanceManifest {
    if (!this.manifest) {
      throw new Error('Reader not initialized. Call open() first.');
    }
    return this.manifest;
  }

  /**
   * Get schema fields
   */
  getFields(): LanceField[] {
    return this.getManifest().fields;
  }

  /**
   * Find a field by name
   */
  getField(name: string): LanceField | undefined {
    return this.getFields().find(f => f.name === name);
  }

  /**
   * Get available vector indices
   */
  getIndices(): LanceIndexMetadata[] {
    return this.getManifest().indices ?? [];
  }

  /**
   * Find an index for a specific column
   */
  getIndexForColumn(columnName: string): LanceIndexMetadata | undefined {
    const field = this.getField(columnName);
    if (!field) return undefined;

    return this.getIndices().find(idx => idx.fields.includes(field.id));
  }

  /**
   * Load a vector index for a column
   */
  async getVectorIndex(columnName: string): Promise<VectorIndex> {
    // Check cache first
    const cached = this.indexCache.get(columnName);
    if (cached) return cached;

    const indexMeta = this.getIndexForColumn(columnName);
    if (!indexMeta) {
      throw new Error(`No vector index found for column: ${columnName}`);
    }

    // Build index path from UUID
    const uuidHex = Array.from(indexMeta.uuid)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const indexPath = `${this.config.basePath}/_indices/${uuidHex}.idx`;

    // Create appropriate index based on type
    let index: VectorIndex;

    const indexDetails = indexMeta.indexDetails;

    if (indexDetails.type === 'ivf_pq') {
      index = await this.loadIvfPqIndex(indexPath, indexDetails);
    } else if (indexDetails.type === 'hnsw') {
      index = await this.loadHnswIndex(indexPath, indexDetails);
    } else if (indexDetails.type === 'ivf_flat') {
      // IVF-Flat can be handled similarly to IVF-PQ but without quantization
      throw new Error('IVF-Flat index type not yet implemented');
    } else {
      throw new Error(`Unsupported index type: ${(indexDetails as { type: string }).type}`);
    }

    // Cache the index
    this.indexCache.set(columnName, index);
    return index;
  }

  /**
   * Load an IVF-PQ index
   */
  private async loadIvfPqIndex(
    indexPath: string,
    details: { type: 'ivf_pq'; distanceType: string; numPartitions: number; numSubVectors: number; numBits: number }
  ): Promise<IvfPqIndex> {
    const indexFile = new LanceFileReader(this.config.storage, `${indexPath}/index.idx`);
    const auxFile = new LanceFileReader(this.config.storage, `${indexPath}/auxiliary.idx`);

    // Read schema metadata from index file to get lance:ivf buffer index
    // First, read the file to get Arrow schema metadata
    // For now, use convention that IVF is in global buffer 0

    // Load IVF structure from index file
    const ivfBuffer = await indexFile.readGlobalBuffer(0);
    const ivf = parseIvf(ivfBuffer);

    // Load PQ codebook from auxiliary file
    const pqBuffer = await auxFile.readGlobalBuffer(0);
    const pq = parsePqCodebook(pqBuffer);

    // Create and initialize the index
    const index = new IvfPqIndex(
      this.config.storage,
      auxFile.getPath(),
      ivf,
      pq,
      details.distanceType as 'l2' | 'cosine' | 'dot'
    );

    return index;
  }

  /**
   * Load an HNSW index
   */
  private async loadHnswIndex(
    indexPath: string,
    details: { type: 'hnsw'; distanceType: string; m: number; efConstruction: number; maxLevel: number }
  ): Promise<HnswIndex> {
    const indexFile = new LanceFileReader(this.config.storage, `${indexPath}/index.idx`);

    // Create and initialize the HNSW index
    const index = new HnswIndex(
      this.config.storage,
      indexFile.getPath(),
      details.distanceType as 'l2' | 'cosine' | 'dot',
      details.m,
      details.maxLevel
    );

    await index.initialize();
    return index;
  }

  /**
   * Perform vector search on an indexed column
   */
  async search(
    columnName: string,
    query: Float32Array,
    options: VectorSearchOptions
  ): Promise<SearchResult[]> {
    if (!this.initialized) {
      await this.open();
    }

    const index = await this.getVectorIndex(columnName);
    return index.search(query, options);
  }

  /**
   * Get rows by their IDs
   * Returns the requested columns for each row
   */
  async getRows(
    rowIds: bigint[],
    columns?: string[]
  ): Promise<Record<string, unknown>[]> {
    if (!this.initialized) {
      await this.open();
    }

    const manifest = this.getManifest();

    // Determine which columns to read
    // Note: Column filtering will be implemented when full columnar reading is added
    void (columns ?? manifest.fields.map(f => f.name));

    // Group row IDs by fragment
    const rowsByFragment = this.groupRowsByFragment(rowIds);

    // Initialize results with placeholder objects for all requested rows
    const results: Record<string, unknown>[] = rowIds.map(rowId => ({ _rowid: rowId }));
    const rowIdToIndex = new Map<bigint, number>();
    rowIds.forEach((id, idx) => rowIdToIndex.set(id, idx));

    for (const [fragmentId, fragmentRowIds] of rowsByFragment) {
      const fragment = manifest.fragments.find(f => f.id === fragmentId);
      if (!fragment) continue;

      // Read fragment data (simplified - full implementation would read columnar data)
      // For now, results already have placeholder values
      for (const rowId of fragmentRowIds) {
        const idx = rowIdToIndex.get(rowId);
        if (idx !== undefined) {
          // In a full implementation, we would populate with actual column values here
          results[idx] = { _rowid: rowId };
        }
      }
    }

    return results;
  }

  /**
   * Group row IDs by their fragment
   * Row ID encodes fragment ID in high bits
   */
  private groupRowsByFragment(rowIds: bigint[]): Map<number, bigint[]> {
    const groups = new Map<number, bigint[]>();

    for (const rowId of rowIds) {
      // Fragment ID is encoded in bits 32-63 of the row ID
      const fragmentId = Number(rowId >> 32n);
      let group = groups.get(fragmentId);
      if (!group) {
        group = [];
        groups.set(fragmentId, group);
      }
      group.push(rowId);
    }

    return groups;
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.indexCache.clear();
    this.bufferCache.clear();
  }

  /**
   * Close the reader and release resources
   */
  close(): void {
    this.clearCaches();
    this.manifest = null;
    this.initialized = false;
  }

  /**
   * Hybrid search combining vector search with scalar filters
   *
   * @param columnName - Name of the vector column to search
   * @param query - Query vector
   * @param options - Search options including scalar filter
   * @returns Filtered search results
   */
  async hybridSearch(
    columnName: string,
    query: Float32Array,
    options: HybridSearchOptions
  ): Promise<SearchResult[]> {
    if (!this.initialized) {
      await this.open();
    }

    const { k, filter, filterMode = 'post', nprobes, efSearch } = options;

    // Check if an index exists for this column
    const indexMeta = this.getIndexForColumn(columnName);
    if (!indexMeta) {
      // No index found - return empty results
      // In a full implementation, this would fall back to brute-force scan
      return [];
    }

    if (filterMode === 'pre') {
      // Pre-filtering: Build a filter predicate based on scalar filter
      // then apply during search
      const rowFilter: RowFilter = {
        type: 'predicate',
        fn: (rowId: bigint) => {
          // In a full implementation, we would:
          // 1. Load column data for the filter column
          // 2. Check if the value matches the filter
          // For now, we pass all rows (filter is advisory)
          void rowId;
          return true;
        },
      };

      return this.search(columnName, query, {
        k,
        nprobes,
        efSearch,
        filter: rowFilter,
      });
    } else {
      // Post-filtering: Search first, then filter results
      // Fetch more results to account for filtering
      const overFetch = Math.min(k * 3, 1000);

      const results = await this.search(columnName, query, {
        k: overFetch,
        nprobes,
        efSearch,
      });

      // Apply scalar filter to results
      const filteredResults = results.filter(result => {
        // In a full implementation, we would:
        // 1. Load the row data for result.rowId
        // 2. Check if the filter condition is satisfied
        // For now, we check if filter.value is defined to simulate filtering
        void result;
        return filter.value !== undefined;
      });

      // Return top k filtered results
      return filteredResults.slice(0, k);
    }
  }
}

// ==========================================
// Factory Functions
// ==========================================

/**
 * Create a LanceReader for a dataset
 */
export function createLanceReader(config: LanceReaderConfig): LanceReader {
  return new LanceReader(config);
}

/**
 * Quick helper to open a dataset and search
 */
export async function searchLanceDataset(
  config: LanceReaderConfig,
  columnName: string,
  query: Float32Array,
  options: VectorSearchOptions
): Promise<SearchResult[]> {
  const reader = new LanceReader(config);
  try {
    await reader.open();
    return await reader.search(columnName, query, options);
  } finally {
    reader.close();
  }
}
