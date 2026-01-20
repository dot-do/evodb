/**
 * EvoDB - The Schema-Evolving Database for the Edge
 *
 * High-level facade class that provides a unified API for:
 * - Document insertion with automatic schema evolution
 * - Fluent query building
 * - Schema locking, relationships, and constraints
 *
 * @example
 * ```typescript
 * import { EvoDB } from '@evodb/core';
 *
 * const db = new EvoDB({
 *   mode: 'development',
 *   storage: env.R2_BUCKET
 * });
 *
 * // Write documents - schema evolves automatically
 * await db.insert('users', [
 *   { name: 'Alice', email: 'alice@example.com' },
 *   { name: 'Bob', email: 'bob@example.com', role: 'admin' }
 * ]);
 *
 * // Query with fluent API
 * const admins = await db.query('users')
 *   .where('role', '=', 'admin')
 *   .select(['name', 'email']);
 *
 * // Lock schema when ready for production
 * await db.schema.lock('users', {
 *   name: { type: 'string', required: true },
 *   email: { type: 'string', format: 'email', required: true }
 * });
 * ```
 */

import { shred } from './shred.js';
import { type Column, type SchemaColumn, Type } from './types.js';
import {
  evaluateFilters,
  sortRows,
  limitRows,
  computeAggregations,
  type FilterPredicate,
  type FilterOperator,
  type SortSpec,
  type AggregateSpec,
} from './query-ops.js';
import { ValidationError } from './errors.js';

// =============================================================================
// Types
// =============================================================================

/**
 * EvoDB configuration options
 */
export interface EvoDBConfig {
  /**
   * Operating mode:
   * - 'development': Schema evolves automatically as data is written
   * - 'production': Schema is locked, changes require explicit migrations
   */
  mode: 'development' | 'production';

  /**
   * Storage backend - R2 bucket or compatible object storage
   */
  storage?: EvoDBStorageBucket;

  /**
   * Schema evolution behavior
   */
  schemaEvolution?: 'automatic' | 'locked';

  /**
   * Whether to infer types from data
   */
  inferTypes?: boolean;

  /**
   * Validate data on write in production mode
   */
  validateOnWrite?: boolean;

  /**
   * Whether to reject fields not in schema
   */
  rejectUnknownFields?: boolean;
}

/**
 * EvoDB storage bucket interface (R2-compatible)
 */
export interface EvoDBStorageBucket {
  get(key: string): Promise<EvoDBStorageObject | null>;
  put(key: string, data: ArrayBuffer | Uint8Array | string, options?: EvoDBPutOptions): Promise<EvoDBStorageObject>;
  delete(key: string | string[]): Promise<void>;
  list(options?: EvoDBListOptions): Promise<EvoDBObjectList>;
}

export interface EvoDBStorageObject {
  key: string;
  size: number;
  etag: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface EvoDBPutOptions {
  customMetadata?: Record<string, string>;
}

export interface EvoDBListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
}

export interface EvoDBObjectList {
  objects: EvoDBStorageObject[];
  truncated: boolean;
  cursor?: string;
}

/**
 * Schema field definition for locking
 */
export interface FieldDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'binary';
  required?: boolean;
  format?: 'email' | 'url' | 'uuid' | 'iso-date' | 'iso-datetime';
  enum?: unknown[];
  maxLength?: number;
  minLength?: number;
  min?: number;
  max?: number;
  ref?: string;
  default?: unknown;
}

/**
 * Schema definition (can be nested)
 */
export type SchemaDefinition = {
  [field: string]: FieldDefinition | SchemaDefinition;
};

/**
 * Relationship options
 */
export interface RelationshipOptions {
  type?: 'one-to-one' | 'one-to-many' | 'many-to-many';
  foreignKey?: string;
  onDelete?: 'cascade' | 'set-null' | 'restrict';
  onUpdate?: 'cascade' | 'set-null' | 'restrict';
}

/**
 * Constraint enforcement options
 */
export interface EnforceOptions {
  strict?: boolean;
}

/**
 * Inferred schema result
 */
export interface InferredSchema {
  [field: string]: string; // e.g., 'string', 'number', 'string?' (optional)
}

/**
 * Query result
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  totalCount: number;
  hasMore: boolean;
}

/**
 * Update operation result
 */
export interface UpdateResult<T = Record<string, unknown>> {
  /** Number of documents that matched the filter */
  matchedCount: number;
  /** Number of documents that were modified */
  modifiedCount: number;
  /** Updated documents (only if returnDocuments option is true) */
  documents?: T[];
}

/**
 * Update operation options
 */
export interface UpdateOptions {
  /** Whether to return the updated documents */
  returnDocuments?: boolean;
}

/**
 * Delete operation result
 */
export interface DeleteResult<T = Record<string, unknown>> {
  /** Number of documents that were deleted */
  deletedCount: number;
  /** Deleted documents (only if returnDocuments option is true) */
  documents?: T[];
}

/**
 * Delete operation options
 */
export interface DeleteOptions {
  /** Whether to return the deleted documents */
  returnDocuments?: boolean;
}

/**
 * Filter object for update/delete operations
 * Matches documents where all specified field values match
 */
export type FilterObject = Record<string, unknown>;

// =============================================================================
// Query Builder
// =============================================================================

/**
 * User-friendly filter operators (SQL-like syntax)
 */
export type UserFilterOperator =
  | '='        // equals
  | '!='       // not equals
  | '<>'       // not equals (SQL alias)
  | '>'        // greater than
  | '>='       // greater than or equal
  | '<'        // less than
  | '<='       // less than or equal
  | 'in'       // in array
  | 'not in'   // not in array
  | 'between'  // between values
  | 'like'     // SQL LIKE pattern
  | 'is null'  // is null
  | 'is not null' // is not null
  // Also support the internal operators directly
  | FilterOperator;

/**
 * Map user-friendly operators to internal operators
 */
function mapOperator(op: UserFilterOperator): FilterOperator {
  switch (op) {
    case '=': return 'eq';
    case '!=':
    case '<>': return 'ne';
    case '>': return 'gt';
    case '>=': return 'gte';
    case '<': return 'lt';
    case '<=': return 'lte';
    case 'not in': return 'notIn';
    case 'is null': return 'isNull';
    case 'is not null': return 'isNotNull';
    default: return op as FilterOperator;
  }
}

/**
 * Fluent query builder for EvoDB
 *
 * @example
 * ```typescript
 * const results = await db.query('users')
 *   .where('status', '=', 'active')
 *   .where('age', '>=', 18)
 *   .select(['id', 'name', 'email'])
 *   .orderBy('name', 'asc')
 *   .limit(10)
 *   .offset(20);
 * ```
 */
export class QueryBuilder<T = Record<string, unknown>> {
  private readonly evodb: EvoDB;
  private readonly tableName: string;
  private predicates: FilterPredicate[] = [];
  private projection: string[] | null = null;
  private sortSpecs: SortSpec[] = [];
  private aggregateSpecs: AggregateSpec[] = [];
  private groupByColumns: string[] = [];
  private limitCount: number | null = null;
  private offsetCount: number = 0;

  constructor(evodb: EvoDB, tableName: string) {
    this.evodb = evodb;
    this.tableName = tableName;
  }

  /**
   * Add a filter condition
   *
   * @param column - Column name to filter on
   * @param operator - Comparison operator (supports SQL-like syntax: =, !=, >, >=, <, <=, in, like)
   * @param value - Value to compare against
   */
  where(column: string, operator: UserFilterOperator, value: unknown): QueryBuilder<T> {
    this.predicates.push({ column, operator: mapOperator(operator), value });
    return this;
  }

  /**
   * Select specific columns
   *
   * @param columns - Array of column names to select
   */
  select(columns: string[]): QueryBuilder<T> {
    this.projection = columns;
    return this;
  }

  /**
   * Add sorting
   *
   * @param column - Column to sort by
   * @param direction - Sort direction ('asc' or 'desc')
   */
  orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): QueryBuilder<T> {
    this.sortSpecs.push({ column, direction });
    return this;
  }

  /**
   * Limit the number of results
   *
   * @param count - Maximum number of rows to return
   */
  limit(count: number): QueryBuilder<T> {
    this.limitCount = count;
    return this;
  }

  /**
   * Skip a number of results
   *
   * @param count - Number of rows to skip
   */
  offset(count: number): QueryBuilder<T> {
    this.offsetCount = count;
    return this;
  }

  /**
   * Add aggregation
   *
   * @param fn - Aggregation function
   * @param column - Column to aggregate
   * @param alias - Output alias
   */
  aggregate(
    fn: 'count' | 'sum' | 'avg' | 'min' | 'max',
    column: string | null,
    alias: string
  ): QueryBuilder<T> {
    this.aggregateSpecs.push({ function: fn, column, alias });
    return this;
  }

  /**
   * Group results by columns
   *
   * @param columns - Columns to group by
   */
  groupBy(columns: string[]): QueryBuilder<T> {
    this.groupByColumns = columns;
    return this;
  }

  /**
   * Execute the query and return results
   */
  async execute(): Promise<T[]> {
    const result = await this.evodb.executeQuery<T>(
      this.tableName,
      this.predicates,
      this.projection,
      this.sortSpecs,
      this.aggregateSpecs,
      this.groupByColumns,
      this.limitCount,
      this.offsetCount
    );
    return result.rows;
  }

  /**
   * Execute and return full result with metadata
   */
  async executeWithMeta(): Promise<QueryResult<T>> {
    return this.evodb.executeQuery<T>(
      this.tableName,
      this.predicates,
      this.projection,
      this.sortSpecs,
      this.aggregateSpecs,
      this.groupByColumns,
      this.limitCount,
      this.offsetCount
    );
  }

  /**
   * Make QueryBuilder thenable for await support
   */
  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// =============================================================================
// Schema Manager
// =============================================================================

/**
 * Schema management for EvoDB
 *
 * Provides methods for:
 * - Locking schemas in production
 * - Defining relationships between tables
 * - Enforcing constraints
 * - Inferring schemas from data
 */
export class SchemaManager {
  private readonly evodb: EvoDB;
  private lockedSchemas: Map<string, SchemaDefinition> = new Map();
  private relationships: Map<string, Map<string, RelationshipOptions>> = new Map();
  private enforcements: Map<string, EnforceOptions> = new Map();

  constructor(evodb: EvoDB) {
    this.evodb = evodb;
  }

  /**
   * Lock a table's schema
   *
   * Once locked, the schema cannot evolve automatically.
   * All writes must conform to the locked schema.
   *
   * @param table - Table name
   * @param schema - Schema definition to lock
   */
  async lock(table: string, schema: SchemaDefinition): Promise<void> {
    this.lockedSchemas.set(table, schema);

    // In production mode, persist the schema
    if (this.evodb.getMode() === 'production') {
      await this.evodb.persistSchema(table, schema);
    }
  }

  /**
   * Define a relationship between tables
   *
   * @param from - Source table.field (e.g., 'posts.author')
   * @param to - Target table (e.g., 'users')
   * @param options - Relationship options
   */
  async relate(from: string, to: string, options: RelationshipOptions = {}): Promise<void> {
    if (!this.relationships.has(from)) {
      this.relationships.set(from, new Map());
    }
    const relationshipMap = this.relationships.get(from);
    if (!relationshipMap) {
      throw new Error(`Failed to create relationship map for '${from}'`);
    }
    relationshipMap.set(to, {
      type: options.type ?? 'one-to-many',
      foreignKey: options.foreignKey,
      onDelete: options.onDelete ?? 'restrict',
      onUpdate: options.onUpdate ?? 'cascade',
    });

    // In production mode, persist the relationship
    if (this.evodb.getMode() === 'production') {
      await this.evodb.persistRelationship(from, to, options);
    }
  }

  /**
   * Enforce constraints on a table
   *
   * @param table - Table name
   * @param constraints - Partial schema with constraints to enforce
   * @param options - Enforcement options
   */
  async enforce(table: string, constraints: SchemaDefinition, options: EnforceOptions = {}): Promise<void> {
    // Merge with existing schema if any
    const existing = this.lockedSchemas.get(table) ?? {};
    this.lockedSchemas.set(table, { ...existing, ...constraints });
    this.enforcements.set(table, options);

    // In production mode, persist the enforcement
    if (this.evodb.getMode() === 'production') {
      await this.evodb.persistEnforcement(table, constraints, options);
    }
  }

  /**
   * Infer the schema from existing data
   *
   * @param table - Table name
   * @returns Inferred schema as a simple type map
   */
  async infer(table: string): Promise<InferredSchema> {
    const columns = await this.evodb.getTableColumns(table);

    const result: InferredSchema = {};
    for (const col of columns) {
      const typeName = this.typeToString(col.type);
      result[col.path] = col.nullable ? `${typeName}?` : typeName;
    }
    return result;
  }

  /**
   * Check if a table's schema is locked
   */
  isLocked(table: string): boolean {
    return this.lockedSchemas.has(table);
  }

  /**
   * Get the locked schema for a table
   */
  getLockedSchema(table: string): SchemaDefinition | undefined {
    return this.lockedSchemas.get(table);
  }

  /**
   * Get relationships for a table
   */
  getRelationships(table: string): Map<string, RelationshipOptions> | undefined {
    return this.relationships.get(table);
  }

  /**
   * Get enforcement options for a table
   */
  getEnforcement(table: string): EnforceOptions | undefined {
    return this.enforcements.get(table);
  }

  /**
   * Convert internal Type enum to string
   */
  private typeToString(type: Type): string {
    switch (type) {
      case Type.Null: return 'null';
      case Type.Bool: return 'boolean';
      case Type.Int32:
      case Type.Int64:
      case Type.Float64: return 'number';
      case Type.String: return 'string';
      case Type.Binary: return 'binary';
      case Type.Array: return 'array';
      case Type.Object: return 'object';
      case Type.Timestamp:
      case Type.Date: return 'date';
      default: return 'unknown';
    }
  }
}

// =============================================================================
// EvoDB Main Class
// =============================================================================

/**
 * EvoDB - The Schema-Evolving Database for the Edge
 *
 * Main entry point for all database operations.
 */
export class EvoDB {
  private readonly config: Required<EvoDBConfig>;
  private readonly schemaManager: SchemaManager;
  private readonly tables: Map<string, Column[]> = new Map();
  private readonly tableRows: Map<string, Record<string, unknown>[]> = new Map();

  /**
   * Schema management operations
   */
  public readonly schema: SchemaManager;

  constructor(config: EvoDBConfig) {
    this.config = {
      mode: config.mode,
      storage: config.storage as EvoDBStorageBucket,
      schemaEvolution: config.schemaEvolution ?? (config.mode === 'development' ? 'automatic' : 'locked'),
      inferTypes: config.inferTypes ?? true,
      validateOnWrite: config.validateOnWrite ?? (config.mode === 'production'),
      rejectUnknownFields: config.rejectUnknownFields ?? false,
    };

    this.schemaManager = new SchemaManager(this);
    this.schema = this.schemaManager;
  }

  /**
   * Insert documents into a table
   *
   * In development mode, schema evolves automatically.
   * In production mode with locked schema, data is validated.
   *
   * @param table - Table name
   * @param data - Single document or array of documents
   * @returns The inserted documents with generated IDs
   */
  async insert<T extends Record<string, unknown>>(
    table: string,
    data: T | T[]
  ): Promise<T[]> {
    const documents = Array.isArray(data) ? data : [data];

    // Validate against locked schema in production mode
    if (this.config.mode === 'production' && this.schema.isLocked(table)) {
      const lockedSchema = this.schema.getLockedSchema(table)!;
      for (const doc of documents) {
        this.validateDocument(doc, lockedSchema);
      }
    }

    // Add generated IDs if missing
    const docsWithIds = documents.map(doc => {
      if (!('_id' in doc)) {
        return { _id: this.generateId(), ...doc } as T;
      }
      return doc;
    });

    // Store documents
    const existingRows = this.tableRows.get(table) ?? [];
    this.tableRows.set(table, [...existingRows, ...docsWithIds]);

    // Shred into columnar format for efficient querying
    const newColumns = shred(docsWithIds);

    // Merge with existing columns
    const existingColumns = this.tables.get(table) ?? [];
    const mergedColumns = this.mergeColumns(existingColumns, newColumns);
    this.tables.set(table, mergedColumns);

    // Persist to storage if available
    if (this.config.storage) {
      await this.persistTable(table);
    }

    return docsWithIds;
  }

  /**
   * Update documents in a table
   *
   * Updates all documents that match the filter with the provided changes.
   * In production mode with locked schema, updates are validated.
   *
   * @param table - Table name
   * @param filter - Filter object to match documents (empty object matches all)
   * @param changes - Object with field values to update
   * @param options - Update options
   * @returns Update result with matched and modified counts
   *
   * @example
   * ```typescript
   * // Update a single document by ID
   * await db.update('users', { _id: 'user-1' }, { name: 'New Name' });
   *
   * // Update multiple documents matching a filter
   * await db.update('users', { role: 'user' }, { role: 'member' });
   *
   * // Get the updated documents
   * const result = await db.update('users', { _id: 'user-1' }, { name: 'New Name' }, { returnDocuments: true });
   * console.log(result.documents);
   * ```
   */
  async update<T extends Record<string, unknown>>(
    table: string,
    filter: FilterObject,
    changes: Partial<T>,
    options: UpdateOptions = {}
  ): Promise<UpdateResult<T>> {
    const existingRows = this.tableRows.get(table) ?? [];

    // Find matching documents
    const matchingIndices: number[] = [];
    for (let i = 0; i < existingRows.length; i++) {
      if (this.matchesFilter(existingRows[i], filter)) {
        matchingIndices.push(i);
      }
    }

    if (matchingIndices.length === 0) {
      return { matchedCount: 0, modifiedCount: 0 };
    }

    // Validate changes against locked schema in production mode
    if (this.config.mode === 'production' && this.schema.isLocked(table)) {
      const lockedSchema = this.schema.getLockedSchema(table)!;
      // Validate the changes object (partial document)
      this.validatePartialDocument(changes as Record<string, unknown>, lockedSchema);
    }

    // Apply updates
    const updatedDocuments: T[] = [];
    for (const index of matchingIndices) {
      const original = existingRows[index];
      const updated = { ...original, ...changes };
      existingRows[index] = updated;
      updatedDocuments.push(updated as T);
    }

    // Re-shred the entire table to update columnar format
    const newColumns = shred(existingRows);
    this.tables.set(table, newColumns);

    // Persist to storage if available
    if (this.config.storage) {
      await this.persistTable(table);
    }

    const result: UpdateResult<T> = {
      matchedCount: matchingIndices.length,
      modifiedCount: matchingIndices.length,
    };

    if (options.returnDocuments) {
      result.documents = updatedDocuments;
    }

    return result;
  }

  /**
   * Delete documents from a table
   *
   * Deletes all documents that match the filter.
   *
   * @param table - Table name
   * @param filter - Filter object to match documents (empty object matches all)
   * @param options - Delete options
   * @returns Delete result with deleted count
   *
   * @example
   * ```typescript
   * // Delete a single document by ID
   * await db.delete('users', { _id: 'user-1' });
   *
   * // Delete multiple documents matching a filter
   * await db.delete('users', { role: 'inactive' });
   *
   * // Delete all documents
   * await db.delete('users', {});
   *
   * // Get the deleted documents
   * const result = await db.delete('users', { _id: 'user-1' }, { returnDocuments: true });
   * console.log(result.documents);
   * ```
   */
  async delete<T extends Record<string, unknown>>(
    table: string,
    filter: FilterObject,
    options: DeleteOptions = {}
  ): Promise<DeleteResult<T>> {
    const existingRows = this.tableRows.get(table) ?? [];

    // Find matching documents
    const deletedDocuments: T[] = [];
    const remainingRows: Record<string, unknown>[] = [];

    for (const row of existingRows) {
      if (this.matchesFilter(row, filter)) {
        deletedDocuments.push(row as T);
      } else {
        remainingRows.push(row);
      }
    }

    if (deletedDocuments.length === 0) {
      return { deletedCount: 0 };
    }

    // Update in-memory storage
    this.tableRows.set(table, remainingRows);

    // Re-shred the remaining rows to update columnar format
    if (remainingRows.length > 0) {
      const newColumns = shred(remainingRows);
      this.tables.set(table, newColumns);
    } else {
      // Clear columns if no rows remain
      this.tables.set(table, []);
    }

    // Persist to storage if available
    if (this.config.storage) {
      await this.persistTable(table);
    }

    const result: DeleteResult<T> = {
      deletedCount: deletedDocuments.length,
    };

    if (options.returnDocuments) {
      result.documents = deletedDocuments;
    }

    return result;
  }

  /**
   * Create a query builder for a table
   *
   * @param table - Table name to query
   * @returns A QueryBuilder instance for fluent query construction
   */
  query<T = Record<string, unknown>>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(this, table);
  }

  /**
   * Get the current operating mode
   */
  getMode(): 'development' | 'production' {
    return this.config.mode;
  }

  /**
   * Get columns for a table (used by SchemaManager)
   * @internal
   */
  async getTableColumns(table: string): Promise<SchemaColumn[]> {
    const columns = this.tables.get(table) ?? [];
    return columns.map(col => ({
      path: col.path,
      type: col.type,
      nullable: col.nullable,
    }));
  }

  /**
   * Execute a query (called by QueryBuilder)
   * @internal
   */
  async executeQuery<T>(
    table: string,
    predicates: FilterPredicate[],
    projection: string[] | null,
    sortSpecs: SortSpec[],
    aggregateSpecs: AggregateSpec[],
    groupByColumns: string[],
    limit: number | null,
    offset: number
  ): Promise<QueryResult<T>> {
    // Get raw documents for this table
    let rows = this.tableRows.get(table) ?? [];

    // Apply filters
    if (predicates.length > 0) {
      rows = rows.filter(row => evaluateFilters(row, predicates));
    }

    // Handle aggregations
    if (aggregateSpecs.length > 0) {
      const aggregated = computeAggregations(rows, aggregateSpecs, groupByColumns);
      // Convert columnar result to row objects
      const resultRows: Record<string, unknown>[] = [];
      for (const rowData of aggregated.rows) {
        const rowObj: Record<string, unknown> = {};
        for (let i = 0; i < aggregated.columns.length; i++) {
          rowObj[aggregated.columns[i]] = rowData[i];
        }
        resultRows.push(rowObj);
      }
      return {
        rows: resultRows as T[],
        totalCount: resultRows.length,
        hasMore: false,
      };
    }

    // Apply projection
    if (projection && projection.length > 0) {
      rows = rows.map(row => {
        const projected: Record<string, unknown> = {};
        for (const col of projection) {
          if (col in row) {
            projected[col] = row[col];
          }
        }
        return projected;
      });
    }

    // Apply sorting
    if (sortSpecs.length > 0) {
      rows = sortRows(rows, sortSpecs);
    }

    const totalCount = rows.length;

    // Apply offset and limit
    if (limit !== null || offset > 0) {
      rows = limitRows(rows, limit ?? rows.length, offset);
    }

    return {
      rows: rows as T[],
      totalCount,
      hasMore: limit !== null && totalCount > offset + limit,
    };
  }

  /**
   * Persist schema to storage
   * @internal
   */
  async persistSchema(table: string, schema: SchemaDefinition): Promise<void> {
    if (!this.config.storage) return;

    const key = `_meta/schemas/${table}.json`;
    await this.config.storage.put(key, JSON.stringify(schema), {
      customMetadata: { type: 'schema', table },
    });
  }

  /**
   * Persist relationship to storage
   * @internal
   */
  async persistRelationship(from: string, to: string, options: RelationshipOptions): Promise<void> {
    if (!this.config.storage) return;

    const key = `_meta/relationships/${from}__${to}.json`;
    await this.config.storage.put(key, JSON.stringify({ from, to, ...options }), {
      customMetadata: { type: 'relationship' },
    });
  }

  /**
   * Persist enforcement to storage
   * @internal
   */
  async persistEnforcement(table: string, constraints: SchemaDefinition, options: EnforceOptions): Promise<void> {
    if (!this.config.storage) return;

    const key = `_meta/enforcements/${table}.json`;
    await this.config.storage.put(key, JSON.stringify({ constraints, options }), {
      customMetadata: { type: 'enforcement', table },
    });
  }

  /**
   * Persist table data to storage
   */
  private async persistTable(table: string): Promise<void> {
    if (!this.config.storage) return;

    const rows = this.tableRows.get(table) ?? [];
    const key = `data/${table}/data.json`;
    await this.config.storage.put(key, JSON.stringify(rows), {
      customMetadata: { type: 'data', table, rowCount: String(rows.length) },
    });
  }

  /**
   * Validate a document against a schema definition
   */
  private validateDocument(doc: Record<string, unknown>, schema: SchemaDefinition): void {
    for (const [field, def] of Object.entries(schema)) {
      const value = doc[field];
      const fieldDef = def as FieldDefinition;

      // Check if it's a nested schema definition (no 'type' property)
      if (!('type' in fieldDef)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          this.validateDocument(value as Record<string, unknown>, def as SchemaDefinition);
        }
        continue;
      }

      // Check required fields
      if (fieldDef.required && (value === undefined || value === null)) {
        throw new ValidationError(`Required field '${field}' is missing`);
      }

      // Skip validation for undefined/null optional fields
      if (value === undefined || value === null) continue;

      // Type validation
      if (!this.validateType(value, fieldDef.type)) {
        throw new ValidationError(
          `Field '${field}' expected type '${fieldDef.type}' but got '${typeof value}'`
        );
      }

      // Enum validation
      if (fieldDef.enum && !fieldDef.enum.includes(value)) {
        throw new ValidationError(
          `Field '${field}' value '${value}' not in allowed values: ${fieldDef.enum.join(', ')}`
        );
      }

      // String constraints
      if (fieldDef.type === 'string' && typeof value === 'string') {
        if (fieldDef.minLength !== undefined && value.length < fieldDef.minLength) {
          throw new ValidationError(
            `Field '${field}' must be at least ${fieldDef.minLength} characters`
          );
        }
        if (fieldDef.maxLength !== undefined && value.length > fieldDef.maxLength) {
          throw new ValidationError(
            `Field '${field}' must be at most ${fieldDef.maxLength} characters`
          );
        }
        if (fieldDef.format) {
          this.validateFormat(value, fieldDef.format, field);
        }
      }

      // Number constraints
      if (fieldDef.type === 'number' && typeof value === 'number') {
        if (fieldDef.min !== undefined && value < fieldDef.min) {
          throw new ValidationError(`Field '${field}' must be at least ${fieldDef.min}`);
        }
        if (fieldDef.max !== undefined && value > fieldDef.max) {
          throw new ValidationError(`Field '${field}' must be at most ${fieldDef.max}`);
        }
      }
    }

    // Check for unknown fields if strict mode
    if (this.config.rejectUnknownFields) {
      for (const field of Object.keys(doc)) {
        if (field === '_id') continue; // Allow generated ID
        if (!(field in schema)) {
          throw new ValidationError(`Unknown field '${field}' not allowed in strict mode`);
        }
      }
    }
  }

  /**
   * Validate value type
   */
  private validateType(value: unknown, type: FieldDefinition['type']): boolean {
    switch (type) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number';
      case 'boolean': return typeof value === 'boolean';
      case 'array': return Array.isArray(value);
      case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'date': return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
      case 'binary': return value instanceof Uint8Array || value instanceof ArrayBuffer;
      default: return true;
    }
  }

  /**
   * Validate string format
   */
  private validateFormat(value: string, format: NonNullable<FieldDefinition['format']>, field: string): void {
    switch (format) {
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          throw new ValidationError(`Field '${field}' is not a valid email address`);
        }
        break;
      case 'url':
        try {
          new URL(value);
        } catch {
          throw new ValidationError(`Field '${field}' is not a valid URL`);
        }
        break;
      case 'uuid':
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
          throw new ValidationError(`Field '${field}' is not a valid UUID`);
        }
        break;
      case 'iso-date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          throw new ValidationError(`Field '${field}' is not a valid ISO date (YYYY-MM-DD)`);
        }
        break;
      case 'iso-datetime':
        if (isNaN(Date.parse(value))) {
          throw new ValidationError(`Field '${field}' is not a valid ISO datetime`);
        }
        break;
    }
  }

  /**
   * Merge columns from new data with existing columns
   */
  private mergeColumns(existing: Column[], newCols: Column[]): Column[] {
    const colMap = new Map(existing.map(c => [c.path, c]));

    for (const newCol of newCols) {
      const existingCol = colMap.get(newCol.path);
      if (existingCol) {
        // Merge values
        existingCol.values.push(...newCol.values);
        existingCol.nulls.push(...newCol.nulls);
      } else {
        // Add new column (pad with nulls for existing rows)
        const rowCount = existing.length > 0 ? existing[0].values.length : 0;
        const paddedCol: Column = {
          ...newCol,
          values: [...new Array(rowCount).fill(null), ...newCol.values],
          nulls: [...new Array(rowCount).fill(true), ...newCol.nulls],
        };
        colMap.set(newCol.path, paddedCol);
      }
    }

    return Array.from(colMap.values());
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `${timestamp}-${random}`;
  }

  /**
   * Check if a document matches a filter object
   * Empty filter matches all documents
   */
  private matchesFilter(doc: Record<string, unknown>, filter: FilterObject): boolean {
    // Empty filter matches all
    if (Object.keys(filter).length === 0) {
      return true;
    }

    // All filter properties must match
    for (const [key, value] of Object.entries(filter)) {
      if (doc[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Validate a partial document (for updates) against a schema definition
   * Similar to validateDocument but doesn't check required fields
   */
  private validatePartialDocument(doc: Record<string, unknown>, schema: SchemaDefinition): void {
    for (const [field, value] of Object.entries(doc)) {
      // Skip _id field
      if (field === '_id') continue;

      const def = schema[field];
      if (!def) {
        // Unknown field - check strict mode
        if (this.config.rejectUnknownFields) {
          throw new ValidationError(`Unknown field '${field}' not allowed in strict mode`);
        }
        continue;
      }

      const fieldDef = def as FieldDefinition;

      // Check if it's a nested schema definition (no 'type' property)
      if (!('type' in fieldDef)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          this.validatePartialDocument(value as Record<string, unknown>, def as SchemaDefinition);
        }
        continue;
      }

      // Skip validation for undefined/null values (partial updates may set to null)
      if (value === undefined || value === null) continue;

      // Type validation
      if (!this.validateType(value, fieldDef.type)) {
        throw new ValidationError(
          `Field '${field}' expected type '${fieldDef.type}' but got '${typeof value}'`
        );
      }

      // Enum validation
      if (fieldDef.enum && !fieldDef.enum.includes(value)) {
        throw new ValidationError(
          `Field '${field}' value '${value}' not in allowed values: ${fieldDef.enum.join(', ')}`
        );
      }

      // String constraints
      if (fieldDef.type === 'string' && typeof value === 'string') {
        if (fieldDef.minLength !== undefined && value.length < fieldDef.minLength) {
          throw new ValidationError(
            `Field '${field}' must be at least ${fieldDef.minLength} characters`
          );
        }
        if (fieldDef.maxLength !== undefined && value.length > fieldDef.maxLength) {
          throw new ValidationError(
            `Field '${field}' must be at most ${fieldDef.maxLength} characters`
          );
        }
        if (fieldDef.format) {
          this.validateFormat(value, fieldDef.format, field);
        }
      }

      // Number constraints
      if (fieldDef.type === 'number' && typeof value === 'number') {
        if (fieldDef.min !== undefined && value < fieldDef.min) {
          throw new ValidationError(`Field '${field}' must be at least ${fieldDef.min}`);
        }
        if (fieldDef.max !== undefined && value > fieldDef.max) {
          throw new ValidationError(`Field '${field}' must be at most ${fieldDef.max}`);
        }
      }
    }
  }
}
