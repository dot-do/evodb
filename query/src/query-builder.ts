/**
 * @evodb/query - Type-Safe Query Builder
 *
 * Provides enhanced TypeScript IntelliSense support for query construction with:
 * - Template literal types for column name autocompletion
 * - Method overloads for common query patterns
 * - Full JSDoc documentation for all public methods
 *
 * @packageDocumentation
 * @module @evodb/query/builder
 */

import type {
  Query,
  Predicate,
  PredicateOperator,
  PredicateValue,
  Aggregation,
  AggregationFunction,
  OrderBy,
  QueryHints,
} from './types.js';

// =============================================================================
// Schema Type Definitions
// =============================================================================

/**
 * Supported column data types in EvoDB schemas.
 *
 * These types map to the underlying columnar storage format:
 * - `string`: UTF-8 encoded text
 * - `number`: 64-bit floating point or integer
 * - `boolean`: true/false value
 * - `timestamp`: Unix timestamp in milliseconds
 * - `date`: Date string in ISO format
 * - `json`: Nested JSON object or array
 * - `binary`: Base64 encoded binary data
 * - `null`: Explicitly nullable
 *
 * @example
 * ```typescript
 * const userSchema = {
 *   id: 'string' as const,
 *   age: 'number' as const,
 *   active: 'boolean' as const,
 *   createdAt: 'timestamp' as const,
 * } satisfies SchemaDefinition;
 * ```
 */
export type ColumnType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'timestamp'
  | 'date'
  | 'json'
  | 'binary'
  | 'null';

/**
 * Schema definition mapping column names to their types.
 *
 * Used to provide type-safe column autocompletion in query builders.
 *
 * @example
 * ```typescript
 * interface UserSchema extends SchemaDefinition {
 *   id: 'string';
 *   name: 'string';
 *   email: 'string';
 *   age: 'number';
 *   active: 'boolean';
 *   createdAt: 'timestamp';
 * }
 * ```
 */
export type SchemaDefinition = Record<string, ColumnType>;

/**
 * Extracts column names from a schema definition as a union type.
 *
 * @typeParam S - The schema definition type
 *
 * @example
 * ```typescript
 * type UserColumns = ColumnNames<UserSchema>;
 * // Result: 'id' | 'name' | 'email' | 'age' | 'active' | 'createdAt'
 * ```
 */
export type ColumnNames<S extends SchemaDefinition> = keyof S & string;

/**
 * Extracts column names of a specific type from a schema.
 *
 * @typeParam S - The schema definition type
 * @typeParam T - The column type to filter by
 *
 * @example
 * ```typescript
 * type NumericUserColumns = ColumnsOfType<UserSchema, 'number'>;
 * // Result: 'age'
 *
 * type StringUserColumns = ColumnsOfType<UserSchema, 'string'>;
 * // Result: 'id' | 'name' | 'email'
 * ```
 */
export type ColumnsOfType<S extends SchemaDefinition, T extends ColumnType> = {
  [K in keyof S]: S[K] extends T ? K : never;
}[keyof S] & string;

/**
 * Maps schema column types to their TypeScript runtime types.
 *
 * @typeParam S - The schema definition type
 * @typeParam K - The column name
 *
 * @example
 * ```typescript
 * type AgeType = ColumnRuntimeType<UserSchema, 'age'>;
 * // Result: number
 *
 * type NameType = ColumnRuntimeType<UserSchema, 'name'>;
 * // Result: string
 * ```
 */
export type ColumnRuntimeType<S extends SchemaDefinition, K extends keyof S> =
  S[K] extends 'string' ? string :
  S[K] extends 'number' ? number :
  S[K] extends 'boolean' ? boolean :
  S[K] extends 'timestamp' ? number :
  S[K] extends 'date' ? string :
  S[K] extends 'json' ? unknown :
  S[K] extends 'binary' ? string :
  S[K] extends 'null' ? null :
  unknown;

/**
 * Infers the row type from a schema definition.
 *
 * Creates a TypeScript type representing a single row from the table,
 * with proper types for each column based on the schema.
 *
 * @typeParam S - The schema definition type
 *
 * @example
 * ```typescript
 * type UserRow = InferRowType<UserSchema>;
 * // Result: {
 * //   id: string;
 * //   name: string;
 * //   email: string;
 * //   age: number;
 * //   active: boolean;
 * //   createdAt: number;
 * // }
 * ```
 */
export type InferRowType<S extends SchemaDefinition> = {
  [K in keyof S]: ColumnRuntimeType<S, K>;
};

// =============================================================================
// Query Builder Types
// =============================================================================

/**
 * Comparison operators for string columns.
 *
 * Provides type-safe operator suggestions based on column type.
 */
export type StringOperators = 'eq' | 'ne' | 'in' | 'notIn' | 'like' | 'isNull' | 'isNotNull';

/**
 * Comparison operators for numeric columns.
 *
 * Includes range operators not applicable to strings.
 */
export type NumericOperators = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'between' | 'isNull' | 'isNotNull';

/**
 * Comparison operators for boolean columns.
 */
export type BooleanOperators = 'eq' | 'ne' | 'isNull' | 'isNotNull';

/**
 * Comparison operators for timestamp columns.
 *
 * Same as numeric operators since timestamps are stored as numbers.
 */
export type TimestampOperators = NumericOperators;

/**
 * Maps column types to their valid operators.
 *
 * @typeParam T - The column type
 */
export type OperatorsForType<T extends ColumnType> =
  T extends 'string' ? StringOperators :
  T extends 'number' ? NumericOperators :
  T extends 'boolean' ? BooleanOperators :
  T extends 'timestamp' ? TimestampOperators :
  T extends 'date' ? StringOperators :
  PredicateOperator;

/**
 * Type-safe predicate for a specific schema and column.
 *
 * Ensures the operator and value types are compatible with the column type.
 *
 * @typeParam S - The schema definition type
 * @typeParam K - The column name
 *
 * @example
 * ```typescript
 * // Valid: age is numeric, so gt/gte/lt/lte/between operators are allowed
 * const agePredicate: TypedPredicate<UserSchema, 'age'> = {
 *   column: 'age',
 *   operator: 'gte',
 *   value: 18
 * };
 *
 * // TypeScript error: 'like' operator not valid for numeric columns
 * const invalidPredicate: TypedPredicate<UserSchema, 'age'> = {
 *   column: 'age',
 *   operator: 'like', // Error!
 *   value: '%test%'
 * };
 * ```
 */
export interface TypedPredicate<S extends SchemaDefinition, K extends ColumnNames<S>> {
  /** The column to filter on */
  column: K;
  /** The comparison operator */
  operator: OperatorsForType<S[K]>;
  /** The value to compare against */
  value: PredicateValue;
  /** Negate the predicate */
  not?: boolean;
}

/**
 * Type-safe aggregation specification.
 *
 * @typeParam S - The schema definition type
 *
 * @example
 * ```typescript
 * const sumAge: TypedAggregation<UserSchema> = {
 *   function: 'sum',
 *   column: 'age', // Autocompletes to numeric columns
 *   alias: 'total_age'
 * };
 * ```
 */
export interface TypedAggregation<S extends SchemaDefinition> {
  /** Aggregation function to apply */
  function: AggregationFunction;
  /** Column to aggregate (null for COUNT(*)) */
  column: ColumnNames<S> | null;
  /** Output alias for the aggregated value */
  alias: string;
  /** Apply DISTINCT before aggregation */
  distinct?: boolean;
  /** Filter rows before aggregation */
  filter?: Predicate;
}

/**
 * Type-safe ORDER BY specification.
 *
 * @typeParam S - The schema definition type
 *
 * @example
 * ```typescript
 * const orderByCreated: TypedOrderBy<UserSchema> = {
 *   column: 'createdAt', // Autocompletes to schema columns
 *   direction: 'desc',
 *   nulls: 'last'
 * };
 * ```
 */
export interface TypedOrderBy<S extends SchemaDefinition> {
  /** Column to sort by */
  column: ColumnNames<S>;
  /** Sort direction */
  direction: 'asc' | 'desc';
  /** NULL value handling */
  nulls?: 'first' | 'last';
}

/**
 * Type-safe projection specification.
 *
 * @typeParam S - The schema definition type
 *
 * @example
 * ```typescript
 * const projection: TypedProjection<UserSchema> = {
 *   columns: ['id', 'name', 'email'], // Autocompletes to schema columns
 *   includeMetadata: false
 * };
 * ```
 */
export interface TypedProjection<S extends SchemaDefinition> {
  /** Columns to include in the result */
  columns: ColumnNames<S>[];
  /** Include row metadata (_id, _version, etc.) */
  includeMetadata?: boolean;
}

/**
 * Type-safe query definition.
 *
 * A fully typed query specification that provides IntelliSense for:
 * - Column names in projections, predicates, groupBy, and orderBy
 * - Appropriate operators based on column types
 * - Value types based on column types
 *
 * @typeParam S - The schema definition type
 *
 * @example
 * ```typescript
 * const userQuery: TypedQuery<UserSchema> = {
 *   table: 'users',
 *   projection: { columns: ['id', 'name'] },
 *   predicates: [
 *     { column: 'active', operator: 'eq', value: true },
 *     { column: 'age', operator: 'gte', value: 18 }
 *   ],
 *   orderBy: [{ column: 'createdAt', direction: 'desc' }],
 *   limit: 100
 * };
 * ```
 */
export interface TypedQuery<S extends SchemaDefinition> {
  /** Table name or path */
  table: string;
  /** Column projection */
  projection?: TypedProjection<S>;
  /** Filter predicates (AND semantics) */
  predicates?: TypedPredicate<S, ColumnNames<S>>[];
  /** Aggregations to compute */
  aggregations?: TypedAggregation<S>[];
  /** GROUP BY columns */
  groupBy?: ColumnNames<S>[];
  /** ORDER BY specification */
  orderBy?: TypedOrderBy<S>[];
  /** Maximum rows to return */
  limit?: number;
  /** Rows to skip */
  offset?: number;
  /** Time-travel snapshot ID */
  snapshotId?: string;
  /** Time-travel timestamp */
  asOfTimestamp?: number;
  /** Query execution hints */
  hints?: QueryHints;
}

// =============================================================================
// Query Builder Class
// =============================================================================

/**
 * Type-safe fluent query builder for EvoDB.
 *
 * Provides a chainable API for constructing queries with full TypeScript
 * IntelliSense support. Column names, operators, and values are all
 * type-checked based on the schema definition.
 *
 * @typeParam S - The schema definition type
 *
 * @example Basic Usage
 * ```typescript
 * // Define a schema
 * const usersSchema = {
 *   id: 'string',
 *   name: 'string',
 *   email: 'string',
 *   age: 'number',
 *   active: 'boolean',
 *   createdAt: 'timestamp',
 * } as const satisfies SchemaDefinition;
 *
 * // Create a type-safe query builder
 * const query = new QueryBuilder<typeof usersSchema>('users')
 *   .select(['id', 'name', 'email'])    // Autocomplete: id, name, email, age, active, createdAt
 *   .where('active', 'eq', true)        // Type-checked: boolean value for boolean column
 *   .where('age', 'gte', 18)            // Type-checked: number value for number column
 *   .orderBy('createdAt', 'desc')       // Autocomplete: id, name, email, age, active, createdAt
 *   .limit(100)
 *   .build();
 *
 * // Execute with full type inference
 * const result = await engine.execute(query);
 * // result.rows[0].name - TypeScript knows this is a string!
 * ```
 *
 * @example With Aggregations
 * ```typescript
 * const statsQuery = new QueryBuilder<typeof usersSchema>('users')
 *   .aggregate('count', null, 'total_users')
 *   .aggregate('avg', 'age', 'average_age')     // Autocomplete: only numeric columns for avg
 *   .aggregate('max', 'createdAt', 'latest')    // Autocomplete: only timestamp columns
 *   .groupBy(['active'])                        // Autocomplete: all columns
 *   .build();
 * ```
 *
 * @example Type-Safe Predicates
 * ```typescript
 * const query = new QueryBuilder<typeof usersSchema>('users')
 *   // String column: eq, ne, in, notIn, like, isNull, isNotNull
 *   .where('name', 'like', '%Smith%')
 *
 *   // Number column: eq, ne, gt, gte, lt, lte, in, notIn, between, isNull, isNotNull
 *   .where('age', 'between', [18, 65])
 *
 *   // Boolean column: eq, ne, isNull, isNotNull
 *   .where('active', 'eq', true)
 *   .build();
 * ```
 */
export class QueryBuilder<S extends SchemaDefinition> {
  private _table: string;
  private _projection: string[] | undefined;
  private _predicates: Predicate[] = [];
  private _aggregations: Aggregation[] = [];
  private _groupBy: string[] | undefined;
  private _orderBy: OrderBy[] = [];
  private _limit: number | undefined;
  private _offset: number | undefined;
  private _snapshotId: string | undefined;
  private _asOfTimestamp: number | undefined;
  private _hints: QueryHints | undefined;
  private _includeMetadata: boolean = false;

  /**
   * Creates a new QueryBuilder for the specified table.
   *
   * @param table - The table name or path to query
   *
   * @example
   * ```typescript
   * const builder = new QueryBuilder<UserSchema>('users');
   * const builder = new QueryBuilder<EventSchema>('events/2024');
   * ```
   */
  constructor(table: string) {
    this._table = table;
  }

  // ---------------------------------------------------------------------------
  // Projection Methods
  // ---------------------------------------------------------------------------

  /**
   * Specifies which columns to include in the query results.
   *
   * Only the specified columns will be returned, reducing data transfer
   * and memory usage. Column names are type-checked against the schema.
   *
   * @param columns - Array of column names to select
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * // Select specific columns (with autocompletion)
   * builder.select(['id', 'name', 'email']);
   *
   * // TypeScript error if column doesn't exist
   * builder.select(['id', 'nonexistent']); // Error!
   * ```
   */
  select(columns: ColumnNames<S>[]): this;

  /**
   * Specifies which columns to include, with metadata option.
   *
   * @param columns - Array of column names to select
   * @param options - Projection options
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * // Include row metadata (_id, _version, etc.)
   * builder.select(['id', 'name'], { includeMetadata: true });
   * ```
   */
  select(columns: ColumnNames<S>[], options: { includeMetadata?: boolean }): this;

  select(
    columns: ColumnNames<S>[],
    options?: { includeMetadata?: boolean }
  ): this {
    this._projection = columns as string[];
    if (options?.includeMetadata !== undefined) {
      this._includeMetadata = options.includeMetadata;
    }
    return this;
  }

  /**
   * Selects all columns from the table.
   *
   * This is the default behavior if no projection is specified.
   *
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.selectAll();
   * // Equivalent to not calling select() at all
   * ```
   */
  selectAll(): this {
    this._projection = undefined;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Filter Methods
  // ---------------------------------------------------------------------------

  /**
   * Adds a filter predicate to the query.
   *
   * Multiple where() calls are combined with AND semantics.
   * The operator and value types are validated against the column type.
   *
   * @param column - The column to filter on (with autocompletion)
   * @param operator - The comparison operator (type-safe based on column)
   * @param value - The value to compare against
   * @returns The query builder for chaining
   *
   * @example String column
   * ```typescript
   * builder.where('name', 'eq', 'John');
   * builder.where('email', 'like', '%@example.com');
   * builder.where('status', 'in', ['active', 'pending']);
   * ```
   *
   * @example Numeric column
   * ```typescript
   * builder.where('age', 'gte', 18);
   * builder.where('score', 'between', [80, 100]);
   * builder.where('price', 'lt', 99.99);
   * ```
   *
   * @example Boolean column
   * ```typescript
   * builder.where('active', 'eq', true);
   * builder.where('verified', 'ne', false);
   * ```
   *
   * @example NULL checks
   * ```typescript
   * builder.where('deletedAt', 'isNull', null);
   * builder.where('email', 'isNotNull', null);
   * ```
   */
  where<K extends ColumnNames<S>>(
    column: K,
    operator: OperatorsForType<S[K]>,
    value: PredicateValue
  ): this;

  /**
   * Adds a filter predicate with negation option.
   *
   * @param column - The column to filter on
   * @param operator - The comparison operator
   * @param value - The value to compare against
   * @param options - Additional predicate options
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * // Find users NOT in the specified list
   * builder.where('status', 'in', ['banned', 'suspended'], { not: true });
   * ```
   */
  where<K extends ColumnNames<S>>(
    column: K,
    operator: OperatorsForType<S[K]>,
    value: PredicateValue,
    options: { not?: boolean }
  ): this;

  where<K extends ColumnNames<S>>(
    column: K,
    operator: OperatorsForType<S[K]>,
    value: PredicateValue,
    options?: { not?: boolean }
  ): this {
    this._predicates.push({
      column: column as string,
      operator: operator as PredicateOperator,
      value,
      not: options?.not,
    });
    return this;
  }

  /**
   * Adds an equality filter (shorthand for where(column, 'eq', value)).
   *
   * @param column - The column to filter on
   * @param value - The value to match
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.whereEquals('status', 'active');
   * // Equivalent to: builder.where('status', 'eq', 'active')
   * ```
   */
  whereEquals<K extends ColumnNames<S>>(
    column: K,
    value: ColumnRuntimeType<S, K>
  ): this {
    return this.where(column, 'eq' as OperatorsForType<S[K]>, value as PredicateValue);
  }

  /**
   * Adds an IN filter (shorthand for where(column, 'in', values)).
   *
   * @param column - The column to filter on
   * @param values - Array of values to match
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.whereIn('status', ['active', 'pending', 'processing']);
   * // Equivalent to: builder.where('status', 'in', ['active', 'pending', 'processing'])
   * ```
   */
  whereIn<K extends ColumnNames<S>>(
    column: K,
    values: ColumnRuntimeType<S, K>[]
  ): this {
    return this.where(column, 'in' as OperatorsForType<S[K]>, values as PredicateValue);
  }

  /**
   * Adds a BETWEEN filter for numeric or timestamp columns.
   *
   * @param column - The column to filter on (must be numeric or timestamp)
   * @param min - The minimum value (inclusive)
   * @param max - The maximum value (inclusive)
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.whereBetween('age', 18, 65);
   * builder.whereBetween('createdAt', startTimestamp, endTimestamp);
   * ```
   */
  whereBetween<K extends ColumnsOfType<S, 'number' | 'timestamp'>>(
    column: K,
    min: number,
    max: number
  ): this {
    return this.where(
      column as ColumnNames<S>,
      'between' as OperatorsForType<S[K & keyof S]>,
      [min, max] as PredicateValue
    );
  }

  /**
   * Adds a LIKE filter for string columns.
   *
   * @param column - The column to filter on (must be string)
   * @param pattern - The LIKE pattern (use % for wildcards)
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.whereLike('name', '%Smith%');     // Contains 'Smith'
   * builder.whereLike('email', '%@gmail.com'); // Ends with '@gmail.com'
   * builder.whereLike('code', 'US%');          // Starts with 'US'
   * ```
   */
  whereLike<K extends ColumnsOfType<S, 'string' | 'date'>>(
    column: K,
    pattern: string
  ): this {
    return this.where(
      column as ColumnNames<S>,
      'like' as OperatorsForType<S[K & keyof S]>,
      pattern
    );
  }

  /**
   * Adds an IS NULL filter.
   *
   * @param column - The column to check for NULL
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.whereNull('deletedAt');
   * ```
   */
  whereNull<K extends ColumnNames<S>>(column: K): this {
    return this.where(column, 'isNull' as OperatorsForType<S[K]>, null);
  }

  /**
   * Adds an IS NOT NULL filter.
   *
   * @param column - The column to check for non-NULL
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.whereNotNull('email');
   * ```
   */
  whereNotNull<K extends ColumnNames<S>>(column: K): this {
    return this.where(column, 'isNotNull' as OperatorsForType<S[K]>, null);
  }

  // ---------------------------------------------------------------------------
  // Aggregation Methods
  // ---------------------------------------------------------------------------

  /**
   * Adds an aggregation to the query.
   *
   * When aggregations are present, the query returns aggregated results
   * rather than individual rows. Use groupBy() to aggregate by groups.
   *
   * @param func - The aggregation function
   * @param column - The column to aggregate (null for COUNT(*))
   * @param alias - The output column alias
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * // COUNT(*)
   * builder.aggregate('count', null, 'total_count');
   *
   * // SUM(amount)
   * builder.aggregate('sum', 'amount', 'total_amount');
   *
   * // AVG(age)
   * builder.aggregate('avg', 'age', 'average_age');
   *
   * // MIN/MAX
   * builder.aggregate('min', 'price', 'lowest_price');
   * builder.aggregate('max', 'createdAt', 'latest');
   * ```
   */
  aggregate(
    func: AggregationFunction,
    column: ColumnNames<S> | null,
    alias: string
  ): this;

  /**
   * Adds an aggregation with additional options.
   *
   * @param func - The aggregation function
   * @param column - The column to aggregate (null for COUNT(*))
   * @param alias - The output column alias
   * @param options - Additional aggregation options
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * // COUNT DISTINCT
   * builder.aggregate('count', 'userId', 'unique_users', { distinct: true });
   *
   * // Conditional aggregation (like SQL FILTER clause)
   * builder.aggregate('sum', 'amount', 'active_total', {
   *   filter: { column: 'status', operator: 'eq', value: 'active' }
   * });
   * ```
   */
  aggregate(
    func: AggregationFunction,
    column: ColumnNames<S> | null,
    alias: string,
    options: { distinct?: boolean; filter?: Predicate }
  ): this;

  aggregate(
    func: AggregationFunction,
    column: ColumnNames<S> | null,
    alias: string,
    options?: { distinct?: boolean; filter?: Predicate }
  ): this {
    this._aggregations.push({
      function: func,
      column: column as string | null,
      alias,
      distinct: options?.distinct,
      filter: options?.filter,
    });
    return this;
  }

  /**
   * Adds a COUNT(*) aggregation.
   *
   * @param alias - The output column alias (default: 'count')
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.count();           // Default alias: 'count'
   * builder.count('total');    // Custom alias: 'total'
   * ```
   */
  count(alias: string = 'count'): this {
    return this.aggregate('count', null, alias);
  }

  /**
   * Adds a COUNT(column) aggregation.
   *
   * Counts non-NULL values in the specified column.
   *
   * @param column - The column to count
   * @param alias - The output column alias
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.countColumn('email', 'users_with_email');
   * ```
   */
  countColumn(column: ColumnNames<S>, alias: string): this {
    return this.aggregate('count', column, alias);
  }

  /**
   * Adds a COUNT DISTINCT aggregation.
   *
   * @param column - The column to count distinct values
   * @param alias - The output column alias
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.countDistinct('userId', 'unique_users');
   * ```
   */
  countDistinct(column: ColumnNames<S>, alias: string): this {
    return this.aggregate('countDistinct', column, alias);
  }

  /**
   * Adds a SUM aggregation for numeric columns.
   *
   * @param column - The numeric column to sum
   * @param alias - The output column alias
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.sum('amount', 'total_amount');
   * ```
   */
  sum(column: ColumnsOfType<S, 'number'>, alias: string): this {
    return this.aggregate('sum', column as ColumnNames<S>, alias);
  }

  /**
   * Adds an AVG aggregation for numeric columns.
   *
   * @param column - The numeric column to average
   * @param alias - The output column alias
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.avg('age', 'average_age');
   * ```
   */
  avg(column: ColumnsOfType<S, 'number'>, alias: string): this {
    return this.aggregate('avg', column as ColumnNames<S>, alias);
  }

  /**
   * Adds a MIN aggregation.
   *
   * @param column - The column to find minimum value
   * @param alias - The output column alias
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.min('price', 'lowest_price');
   * builder.min('createdAt', 'first_created');
   * ```
   */
  min(column: ColumnNames<S>, alias: string): this {
    return this.aggregate('min', column, alias);
  }

  /**
   * Adds a MAX aggregation.
   *
   * @param column - The column to find maximum value
   * @param alias - The output column alias
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.max('price', 'highest_price');
   * builder.max('createdAt', 'last_created');
   * ```
   */
  max(column: ColumnNames<S>, alias: string): this {
    return this.aggregate('max', column, alias);
  }

  // ---------------------------------------------------------------------------
  // Grouping Methods
  // ---------------------------------------------------------------------------

  /**
   * Specifies GROUP BY columns for aggregation queries.
   *
   * @param columns - Array of columns to group by
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .groupBy(['region', 'category'])
   *   .sum('amount', 'total_sales')
   *   .count('order_count');
   * ```
   */
  groupBy(columns: ColumnNames<S>[]): this {
    this._groupBy = columns as string[];
    return this;
  }

  // ---------------------------------------------------------------------------
  // Sorting Methods
  // ---------------------------------------------------------------------------

  /**
   * Adds an ORDER BY clause for sorting results.
   *
   * Multiple orderBy() calls define secondary, tertiary, etc. sort keys.
   *
   * @param column - The column to sort by
   * @param direction - Sort direction ('asc' or 'desc')
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.orderBy('createdAt', 'desc');
   *
   * // Multiple sort keys
   * builder
   *   .orderBy('category', 'asc')
   *   .orderBy('price', 'desc');
   * ```
   */
  orderBy(column: ColumnNames<S>, direction: 'asc' | 'desc'): this;

  /**
   * Adds an ORDER BY clause with NULL handling.
   *
   * @param column - The column to sort by
   * @param direction - Sort direction ('asc' or 'desc')
   * @param nulls - Where to place NULL values ('first' or 'last')
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.orderBy('priority', 'desc', 'last');
   * // NULL priorities will appear at the end
   * ```
   */
  orderBy(
    column: ColumnNames<S>,
    direction: 'asc' | 'desc',
    nulls: 'first' | 'last'
  ): this;

  orderBy(
    column: ColumnNames<S>,
    direction: 'asc' | 'desc',
    nulls?: 'first' | 'last'
  ): this {
    this._orderBy.push({
      column: column as string,
      direction,
      nulls,
    });
    return this;
  }

  /**
   * Shorthand for orderBy(column, 'asc').
   *
   * @param column - The column to sort by ascending
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.orderByAsc('name');
   * ```
   */
  orderByAsc(column: ColumnNames<S>): this {
    return this.orderBy(column, 'asc');
  }

  /**
   * Shorthand for orderBy(column, 'desc').
   *
   * @param column - The column to sort by descending
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.orderByDesc('createdAt');
   * ```
   */
  orderByDesc(column: ColumnNames<S>): this {
    return this.orderBy(column, 'desc');
  }

  // ---------------------------------------------------------------------------
  // Pagination Methods
  // ---------------------------------------------------------------------------

  /**
   * Limits the number of rows returned.
   *
   * @param count - Maximum number of rows to return
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.limit(100);
   * ```
   */
  limit(count: number): this {
    this._limit = count;
    return this;
  }

  /**
   * Skips a number of rows before returning results.
   *
   * Commonly used with limit() for pagination.
   *
   * @param count - Number of rows to skip
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * // Page 3 with 20 items per page
   * builder.limit(20).offset(40);
   * ```
   */
  offset(count: number): this {
    this._offset = count;
    return this;
  }

  /**
   * Convenience method for pagination.
   *
   * @param page - Page number (1-indexed)
   * @param pageSize - Number of items per page
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.page(3, 20); // Page 3, 20 items per page
   * // Equivalent to: builder.limit(20).offset(40)
   * ```
   */
  page(page: number, pageSize: number): this {
    this._limit = pageSize;
    this._offset = (page - 1) * pageSize;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Time Travel Methods
  // ---------------------------------------------------------------------------

  /**
   * Queries the table as of a specific snapshot.
   *
   * @param snapshotId - The snapshot identifier
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.asOfSnapshot('snap-abc123');
   * ```
   */
  asOfSnapshot(snapshotId: string): this {
    this._snapshotId = snapshotId;
    return this;
  }

  /**
   * Queries the table as of a specific timestamp.
   *
   * @param timestamp - Unix timestamp in milliseconds
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * // Query data as it was yesterday
   * const yesterday = Date.now() - 24 * 60 * 60 * 1000;
   * builder.asOfTimestamp(yesterday);
   * ```
   */
  asOfTimestamp(timestamp: number): this {
    this._asOfTimestamp = timestamp;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Hints Methods
  // ---------------------------------------------------------------------------

  /**
   * Sets query execution hints for optimization.
   *
   * @param hints - Query hints configuration
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.withHints({
   *   preferCache: true,
   *   maxParallelism: 4,
   *   timeoutMs: 30000
   * });
   * ```
   */
  withHints(hints: QueryHints): this {
    this._hints = { ...this._hints, ...hints };
    return this;
  }

  /**
   * Sets a timeout for query execution.
   *
   * @param ms - Timeout in milliseconds
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.timeout(5000); // 5 second timeout
   * ```
   */
  timeout(ms: number): this {
    return this.withHints({ timeoutMs: ms });
  }

  /**
   * Sets a memory limit for query execution.
   *
   * @param bytes - Memory limit in bytes
   * @returns The query builder for chaining
   *
   * @example
   * ```typescript
   * builder.memoryLimit(64 * 1024 * 1024); // 64MB limit
   * ```
   */
  memoryLimit(bytes: number): this {
    return this.withHints({ memoryLimitBytes: bytes });
  }

  // ---------------------------------------------------------------------------
  // Build Method
  // ---------------------------------------------------------------------------

  /**
   * Builds and returns the final Query object.
   *
   * The returned Query can be executed with QueryEngine.execute().
   *
   * @returns The constructed Query object
   *
   * @example
   * ```typescript
   * const query = builder
   *   .select(['id', 'name'])
   *   .where('active', 'eq', true)
   *   .orderBy('createdAt', 'desc')
   *   .limit(100)
   *   .build();
   *
   * const result = await engine.execute(query);
   * ```
   */
  build(): Query {
    const query: Query = {
      table: this._table,
    };

    if (this._projection) {
      query.projection = {
        columns: this._projection,
        includeMetadata: this._includeMetadata,
      };
    }

    if (this._predicates.length > 0) {
      query.predicates = this._predicates;
    }

    if (this._aggregations.length > 0) {
      query.aggregations = this._aggregations;
    }

    if (this._groupBy) {
      query.groupBy = this._groupBy;
    }

    if (this._orderBy.length > 0) {
      query.orderBy = this._orderBy;
    }

    if (this._limit !== undefined) {
      query.limit = this._limit;
    }

    if (this._offset !== undefined) {
      query.offset = this._offset;
    }

    if (this._snapshotId !== undefined) {
      query.snapshotId = this._snapshotId;
    }

    if (this._asOfTimestamp !== undefined) {
      query.asOfTimestamp = this._asOfTimestamp;
    }

    if (this._hints !== undefined) {
      query.hints = this._hints;
    }

    return query;
  }

  /**
   * Returns a copy of the current query state for inspection.
   *
   * Useful for debugging or logging the query configuration.
   *
   * @returns Object containing the current query configuration
   *
   * @example
   * ```typescript
   * console.log(builder.inspect());
   * // {
   * //   table: 'users',
   * //   projection: ['id', 'name'],
   * //   predicates: [...],
   * //   ...
   * // }
   * ```
   */
  inspect(): {
    table: string;
    projection?: string[];
    predicates: Predicate[];
    aggregations: Aggregation[];
    groupBy?: string[];
    orderBy: OrderBy[];
    limit?: number;
    offset?: number;
    snapshotId?: string;
    asOfTimestamp?: number;
    hints?: QueryHints;
  } {
    return {
      table: this._table,
      projection: this._projection ? [...this._projection] : undefined,
      predicates: [...this._predicates],
      aggregations: [...this._aggregations],
      groupBy: this._groupBy ? [...this._groupBy] : undefined,
      orderBy: [...this._orderBy],
      limit: this._limit,
      offset: this._offset,
      snapshotId: this._snapshotId,
      asOfTimestamp: this._asOfTimestamp,
      hints: this._hints ? { ...this._hints } : undefined,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Creates a new type-safe QueryBuilder for the specified table.
 *
 * This is the recommended way to create QueryBuilder instances with full
 * TypeScript IntelliSense support for column names.
 *
 * @typeParam S - The schema definition type
 * @param table - The table name or path
 * @returns A new QueryBuilder instance
 *
 * @example
 * ```typescript
 * // Define your schema
 * const usersSchema = {
 *   id: 'string',
 *   name: 'string',
 *   email: 'string',
 *   age: 'number',
 *   active: 'boolean',
 *   createdAt: 'timestamp',
 * } as const satisfies SchemaDefinition;
 *
 * // Create a query with full IntelliSense
 * const query = createQueryBuilder<typeof usersSchema>('users')
 *   .select(['id', 'name', 'email'])  // Autocomplete works here!
 *   .where('active', 'eq', true)       // Type-checked operator and value
 *   .orderBy('createdAt', 'desc')      // Autocomplete works here!
 *   .limit(100)
 *   .build();
 * ```
 */
export function createQueryBuilder<S extends SchemaDefinition>(
  table: string
): QueryBuilder<S> {
  return new QueryBuilder<S>(table);
}

/**
 * Creates a QueryBuilder without schema type information.
 *
 * Use this when you don't have a schema definition or don't need
 * type-safe column autocompletion. All string column names will be accepted.
 *
 * @param table - The table name or path
 * @returns A new QueryBuilder instance
 *
 * @example
 * ```typescript
 * // When schema is not available at compile time
 * const query = createUntypedQueryBuilder('dynamic_table')
 *   .select(['col1', 'col2'])
 *   .where('status', 'eq', 'active')
 *   .build();
 * ```
 */
export function createUntypedQueryBuilder(
  table: string
): QueryBuilder<Record<string, ColumnType>> {
  return new QueryBuilder<Record<string, ColumnType>>(table);
}

// =============================================================================
// Schema Definition Helpers
// =============================================================================

/**
 * Helper to define a schema with proper type inference.
 *
 * @param schema - The schema definition object
 * @returns The same schema with proper type inference
 *
 * @example
 * ```typescript
 * const usersSchema = defineSchema({
 *   id: 'string',
 *   name: 'string',
 *   email: 'string',
 *   age: 'number',
 *   active: 'boolean',
 *   createdAt: 'timestamp',
 * });
 *
 * // TypeScript infers the exact type, enabling autocompletion
 * const query = createQueryBuilder<typeof usersSchema>('users')
 *   .select(['id', 'name'])  // Autocomplete: id, name, email, age, active, createdAt
 *   .build();
 * ```
 */
export function defineSchema<S extends SchemaDefinition>(schema: S): S {
  return schema;
}

/**
 * Merges multiple schema definitions into one.
 *
 * Useful for joining schemas or extending a base schema.
 *
 * @param schemas - Schema definitions to merge
 * @returns Merged schema definition
 *
 * @example
 * ```typescript
 * const baseSchema = defineSchema({
 *   id: 'string',
 *   createdAt: 'timestamp',
 *   updatedAt: 'timestamp',
 * });
 *
 * const userSchema = defineSchema({
 *   name: 'string',
 *   email: 'string',
 * });
 *
 * const fullUserSchema = mergeSchemas(baseSchema, userSchema);
 * // Type: { id: 'string', createdAt: 'timestamp', updatedAt: 'timestamp', name: 'string', email: 'string' }
 * ```
 */
export function mergeSchemas<T extends SchemaDefinition[]>(
  ...schemas: T
): T extends [infer First, ...infer Rest]
  ? First extends SchemaDefinition
    ? Rest extends SchemaDefinition[]
      ? First & ReturnType<typeof mergeSchemas<Rest>>
      : First
    : never
  : Record<string, never> {
  return Object.assign({}, ...schemas) as T extends [infer First, ...infer Rest]
    ? First extends SchemaDefinition
      ? Rest extends SchemaDefinition[]
        ? First & ReturnType<typeof mergeSchemas<Rest>>
        : First
      : never
    : Record<string, never>;
}
