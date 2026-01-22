/**
 * Secondary Index Support for EvoDB
 *
 * TDD Issue: evodb-40of
 *
 * This module provides:
 * - Index interface and types for secondary indexes
 * - IndexManager interface for managing indexes
 * - Support for B-tree and Hash index types
 * - Index maintenance hooks for insert/update/delete
 * - Query plan optimization using available indexes
 *
 * @example
 * ```typescript
 * import { createIndexManager, IndexOptions } from '@evodb/core';
 *
 * const indexManager = createIndexManager();
 * await indexManager.createIndex('users', ['email'], { unique: true });
 *
 * // Check if query can use an index
 * const plan = indexManager.getQueryPlan('users', { email: 'test@example.com' });
 * console.log(plan.usesIndex); // true
 * ```
 */

import { EvoDBError } from './errors.js';
import { captureStackTrace } from './stack-trace.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Supported index types
 */
export type IndexType = 'btree' | 'hash';

/**
 * Basic index definition
 */
export interface Index {
  /** Index name */
  name: string;
  /** Columns included in the index (in order for composite indexes) */
  columns: string[];
  /** Index type (btree for range queries, hash for equality) */
  type: IndexType;
}

/**
 * Extended index metadata including creation time and uniqueness
 */
export interface IndexMetadata extends Index {
  /** Whether the index enforces uniqueness */
  unique: boolean;
  /** Unix timestamp when the index was created */
  createdAt: number;
}

/**
 * Options for creating an index
 */
export interface IndexOptions {
  /** Custom index name (auto-generated if not provided) */
  name?: string;
  /** Index type: 'btree' (default) or 'hash' */
  type?: IndexType;
  /** Whether to enforce uniqueness constraint */
  unique?: boolean;
}

/**
 * Options for dropping an index
 */
export interface DropIndexOptions {
  /** If true, don't throw error if index doesn't exist */
  ifExists?: boolean;
}

/**
 * Entry in an index pointing to a row
 */
export interface IndexEntry {
  /** The indexed value(s) - single value or array for composite indexes */
  key: unknown;
  /** The row identifier */
  rowId: string;
}

/**
 * Query plan information returned by getQueryPlan
 */
export interface QueryPlan {
  /** Whether an index will be used for this query */
  usesIndex: boolean;
  /** Name of the index to be used (if any) */
  indexName?: string;
  /** Type of scan: 'index' or 'full' */
  scanType: 'index' | 'full';
  /** Estimated cost (relative metric) */
  estimatedCost?: number;
}

/**
 * Statistics about an index
 */
export interface IndexStats {
  /** Total number of entries in the index */
  entryCount: number;
  /** Number of unique values in the index */
  uniqueValueCount: number;
  /** Estimated size in bytes */
  estimatedSizeBytes: number;
}

/**
 * Interface for managing secondary indexes
 */
export interface IndexManager {
  /**
   * Create a new index on a table
   * @param table - Table name
   * @param columns - Columns to index (order matters for composite indexes)
   * @param options - Index creation options
   */
  createIndex(table: string, columns: string[], options?: IndexOptions): Promise<void>;

  /**
   * Drop an existing index
   * @param table - Table name
   * @param indexName - Name of the index to drop
   * @param options - Drop options (e.g., ifExists)
   */
  dropIndex(table: string, indexName: string, options?: DropIndexOptions): Promise<void>;

  /**
   * List all indexes for a table
   * @param table - Table name
   * @returns Array of index metadata
   */
  listIndexes(table: string): Promise<IndexMetadata[]>;

  /**
   * Get query execution plan showing if/how indexes will be used
   * @param table - Table name
   * @param filter - Query filter conditions
   * @returns Query plan with index usage information
   */
  getQueryPlan(table: string, filter: Record<string, unknown>): QueryPlan;

  /**
   * Hook called when a row is inserted
   * @param table - Table name
   * @param row - The inserted row data including id
   */
  onInsert(table: string, row: Record<string, unknown>): void;

  /**
   * Hook called when multiple rows are inserted
   * @param table - Table name
   * @param rows - Array of inserted rows
   */
  onBulkInsert(table: string, rows: Record<string, unknown>[]): void;

  /**
   * Hook called when a row is updated
   * @param table - Table name
   * @param rowId - ID of the updated row
   * @param oldValues - Previous values of changed columns
   * @param newValues - New values of changed columns
   */
  onUpdate(
    table: string,
    rowId: string,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>
  ): void;

  /**
   * Hook called when a row is deleted
   * @param table - Table name
   * @param rowId - ID of the deleted row
   * @param row - The deleted row data
   */
  onDelete(table: string, rowId: string, row: Record<string, unknown>): void;

  /**
   * Get all entries in an index (for testing/debugging)
   * @param table - Table name
   * @param indexName - Index name
   * @returns Array of index entries
   */
  getIndexEntries(table: string, indexName: string): IndexEntry[];

  /**
   * Get statistics for an index
   * @param table - Table name
   * @param indexName - Index name
   * @returns Index statistics
   */
  getIndexStats(table: string, indexName: string): IndexStats;
}

// =============================================================================
// IndexError
// =============================================================================

/**
 * Error thrown when an index operation fails
 */
export class IndexError extends EvoDBError {
  constructor(message: string, code: string = 'INDEX_ERROR', details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = 'IndexError';
    captureStackTrace(this, IndexError);
  }
}

// =============================================================================
// Internal Index Storage Types
// =============================================================================

/**
 * Internal representation of a stored index
 */
interface StoredIndex extends IndexMetadata {
  /** Table this index belongs to */
  table: string;
  /** Index entries */
  entries: Map<string, IndexEntry[]>;
}

// =============================================================================
// IndexManager Implementation
// =============================================================================

/**
 * In-memory implementation of IndexManager
 *
 * This is a basic implementation for TDD purposes.
 * Full implementation will include persistent storage and optimization.
 */
class InMemoryIndexManager implements IndexManager {
  /** Indexes stored by table name, then by index name */
  private indexes: Map<string, Map<string, StoredIndex>> = new Map();

  /**
   * Generate default index name from table and columns
   */
  private generateIndexName(table: string, columns: string[]): string {
    return `idx_${table}_${columns.join('_')}`;
  }

  /**
   * Get or create table's index map
   */
  private getTableIndexes(table: string): Map<string, StoredIndex> {
    let tableIndexes = this.indexes.get(table);
    if (!tableIndexes) {
      tableIndexes = new Map();
      this.indexes.set(table, tableIndexes);
    }
    return tableIndexes;
  }

  /**
   * Extract key from row based on index columns
   */
  private extractKey(row: Record<string, unknown>, columns: string[]): unknown {
    if (columns.length === 1) {
      return row[columns[0]];
    }
    return columns.map(col => row[col]);
  }

  /**
   * Serialize key to string for map storage
   */
  private serializeKey(key: unknown): string {
    return JSON.stringify(key);
  }

  async createIndex(table: string, columns: string[], options: IndexOptions = {}): Promise<void> {
    // Validate inputs
    if (!table || table.trim() === '') {
      throw new IndexError('Table name is required', 'INVALID_TABLE');
    }

    if (!columns || columns.length === 0) {
      throw new IndexError('At least one column is required', 'INVALID_COLUMNS');
    }

    const type = options.type ?? 'btree';
    if (type !== 'btree' && type !== 'hash') {
      throw new IndexError(`Unsupported index type: ${type}`, 'UNSUPPORTED_TYPE', { type });
    }

    const name = options.name ?? this.generateIndexName(table, columns);
    const tableIndexes = this.getTableIndexes(table);

    // Check for duplicate
    if (tableIndexes.has(name)) {
      throw new IndexError(`Index '${name}' already exists on table '${table}'`, 'DUPLICATE_INDEX', {
        table,
        indexName: name,
      });
    }

    // Also check if same columns are already indexed with the same type
    // (allowing different index types on same columns is valid for different query patterns)
    for (const existingIndex of tableIndexes.values()) {
      if (
        existingIndex.columns.length === columns.length &&
        existingIndex.columns.every((col, i) => col === columns[i]) &&
        existingIndex.type === type
      ) {
        throw new IndexError(
          `Index on columns [${columns.join(', ')}] with type '${type}' already exists as '${existingIndex.name}'`,
          'DUPLICATE_INDEX',
          { table, columns, existingIndex: existingIndex.name }
        );
      }
    }

    // Create the index
    const index: StoredIndex = {
      table,
      name,
      columns,
      type,
      unique: options.unique ?? false,
      createdAt: Date.now(),
      entries: new Map(),
    };

    tableIndexes.set(name, index);
  }

  async dropIndex(table: string, indexName: string, options: DropIndexOptions = {}): Promise<void> {
    const tableIndexes = this.getTableIndexes(table);

    if (!tableIndexes.has(indexName)) {
      if (options.ifExists) {
        return;
      }
      throw new IndexError(`Index '${indexName}' does not exist on table '${table}'`, 'INDEX_NOT_FOUND', {
        table,
        indexName,
      });
    }

    tableIndexes.delete(indexName);
  }

  async listIndexes(table: string): Promise<IndexMetadata[]> {
    const tableIndexes = this.getTableIndexes(table);
    const result: IndexMetadata[] = [];

    for (const index of tableIndexes.values()) {
      result.push({
        name: index.name,
        columns: index.columns,
        type: index.type,
        unique: index.unique,
        createdAt: index.createdAt,
      });
    }

    return result;
  }

  getQueryPlan(table: string, filter: Record<string, unknown>): QueryPlan {
    const tableIndexes = this.getTableIndexes(table);
    const filterColumns = Object.keys(filter);

    if (tableIndexes.size === 0 || filterColumns.length === 0) {
      return { usesIndex: false, scanType: 'full' };
    }

    // Check if any filter uses range operators
    const hasRangeQuery = filterColumns.some(col => {
      const value = filter[col];
      return (
        typeof value === 'object' &&
        value !== null &&
        ('$gt' in value || '$gte' in value || '$lt' in value || '$lte' in value)
      );
    });

    // Find the best matching index
    let bestIndex: StoredIndex | null = null;
    let bestMatchScore = 0;

    for (const index of tableIndexes.values()) {
      // Check if index columns match the filter (leftmost prefix matching)
      let matchedColumns = 0;
      for (let i = 0; i < index.columns.length; i++) {
        if (filterColumns.includes(index.columns[i])) {
          matchedColumns++;
        } else {
          // Leftmost prefix must be contiguous
          break;
        }
      }

      if (matchedColumns === 0) {
        continue;
      }

      // Calculate score based on matched columns and index type
      let score = matchedColumns;

      // Prefer hash index for equality queries, btree for range
      if (hasRangeQuery && index.type === 'btree') {
        score += 0.5;
      } else if (!hasRangeQuery && index.type === 'hash') {
        score += 0.5;
      }

      // Prefer indexes that cover more of the filter
      if (matchedColumns === filterColumns.length) {
        score += 1;
      }

      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex) {
      return {
        usesIndex: true,
        indexName: bestIndex.name,
        scanType: 'index',
        estimatedCost: 1,
      };
    }

    return { usesIndex: false, scanType: 'full' };
  }

  onInsert(table: string, row: Record<string, unknown>): void {
    const tableIndexes = this.getTableIndexes(table);
    const rowId = row['id'] as string;

    for (const index of tableIndexes.values()) {
      const key = this.extractKey(row, index.columns);
      const serializedKey = this.serializeKey(key);

      // Check unique constraint
      if (index.unique) {
        const existing = index.entries.get(serializedKey);
        if (existing && existing.length > 0) {
          throw new IndexError(
            `Duplicate key value violates unique constraint '${index.name}'`,
            'UNIQUE_VIOLATION',
            { table, indexName: index.name, key }
          );
        }
      }

      // Add entry
      const entries = index.entries.get(serializedKey) ?? [];
      entries.push({ key, rowId });
      index.entries.set(serializedKey, entries);
    }
  }

  onBulkInsert(table: string, rows: Record<string, unknown>[]): void {
    for (const row of rows) {
      this.onInsert(table, row);
    }
  }

  onUpdate(
    table: string,
    rowId: string,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>
  ): void {
    const tableIndexes = this.getTableIndexes(table);

    for (const index of tableIndexes.values()) {
      // Check if any indexed column changed
      const indexedColumnsChanged = index.columns.some(col => col in oldValues || col in newValues);

      if (!indexedColumnsChanged) {
        continue;
      }

      // Remove old entry if indexed columns were in oldValues
      if (index.columns.some(col => col in oldValues)) {
        const oldKey = this.extractKey(oldValues, index.columns);
        const serializedOldKey = this.serializeKey(oldKey);
        const oldEntries = index.entries.get(serializedOldKey);

        if (oldEntries) {
          const newEntries = oldEntries.filter(e => e.rowId !== rowId);
          if (newEntries.length > 0) {
            index.entries.set(serializedOldKey, newEntries);
          } else {
            index.entries.delete(serializedOldKey);
          }
        }
      }

      // Add new entry if indexed columns are in newValues
      if (index.columns.some(col => col in newValues)) {
        const newKey = this.extractKey(newValues, index.columns);
        const serializedNewKey = this.serializeKey(newKey);

        // Check unique constraint
        if (index.unique) {
          const existing = index.entries.get(serializedNewKey);
          if (existing && existing.some(e => e.rowId !== rowId)) {
            throw new IndexError(
              `Duplicate key value violates unique constraint '${index.name}'`,
              'UNIQUE_VIOLATION',
              { table, indexName: index.name, key: newKey }
            );
          }
        }

        const entries = index.entries.get(serializedNewKey) ?? [];
        entries.push({ key: newKey, rowId });
        index.entries.set(serializedNewKey, entries);
      }
    }
  }

  onDelete(table: string, rowId: string, row: Record<string, unknown>): void {
    const tableIndexes = this.getTableIndexes(table);

    for (const index of tableIndexes.values()) {
      const key = this.extractKey(row, index.columns);
      const serializedKey = this.serializeKey(key);
      const entries = index.entries.get(serializedKey);

      if (entries) {
        const newEntries = entries.filter(e => e.rowId !== rowId);
        if (newEntries.length > 0) {
          index.entries.set(serializedKey, newEntries);
        } else {
          index.entries.delete(serializedKey);
        }
      }
    }
  }

  getIndexEntries(table: string, indexName: string): IndexEntry[] {
    const tableIndexes = this.getTableIndexes(table);
    const index = tableIndexes.get(indexName);

    if (!index) {
      return [];
    }

    const result: IndexEntry[] = [];
    for (const entries of index.entries.values()) {
      result.push(...entries);
    }
    return result;
  }

  getIndexStats(table: string, indexName: string): IndexStats {
    const tableIndexes = this.getTableIndexes(table);
    const index = tableIndexes.get(indexName);

    if (!index) {
      return { entryCount: 0, uniqueValueCount: 0, estimatedSizeBytes: 0 };
    }

    let entryCount = 0;
    for (const entries of index.entries.values()) {
      entryCount += entries.length;
    }

    // Estimate size: ~64 bytes per entry (key + rowId + overhead)
    const estimatedSizeBytes = entryCount * 64;

    return {
      entryCount,
      uniqueValueCount: index.entries.size,
      estimatedSizeBytes,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new IndexManager instance
 * @returns A new IndexManager
 */
export function createIndexManager(): IndexManager {
  return new InMemoryIndexManager();
}

