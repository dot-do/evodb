/**
 * @evodb/graphql - Type Definitions
 *
 * TypeScript types for the EvoDB GraphQL adapter.
 * Provides type-safe GraphQL schema generation and resolver interfaces.
 *
 * @packageDocumentation
 * @module @evodb/graphql
 */

import type {
  TableSchemaColumn,
  TableColumnType,
} from '@evodb/core';

// Import QueryExecutor from query submodule to avoid duplicate export conflict
import type { QueryExecutor } from '@evodb/core/query';

// =============================================================================
// GraphQL Schema Types
// =============================================================================

/**
 * GraphQL scalar types supported by EvoDB.
 *
 * Maps EvoDB column types to GraphQL scalar types:
 * - ID: Unique identifiers (uuid, string primary keys)
 * - String: Text values
 * - Int: 32-bit integers
 * - Float: Floating-point numbers
 * - Boolean: True/false values
 * - DateTime: ISO 8601 date-time strings
 * - Date: ISO 8601 date strings
 * - JSON: Arbitrary JSON objects
 */
export type GraphQLScalarType =
  | 'ID'
  | 'String'
  | 'Int'
  | 'Float'
  | 'Boolean'
  | 'DateTime'
  | 'Date'
  | 'JSON';

/**
 * GraphQL field definition derived from an EvoDB column.
 */
export interface GraphQLFieldDefinition {
  /** Field name (converted to camelCase from snake_case if needed) */
  name: string;

  /** Original column name from EvoDB schema */
  columnName: string;

  /** GraphQL type (scalar or reference) */
  type: GraphQLScalarType | string;

  /** Whether the field is nullable */
  nullable: boolean;

  /** Whether this field is a list type */
  isList: boolean;

  /** Description for GraphQL documentation */
  description?: string;

  /** Default value if any */
  defaultValue?: unknown;
}

/**
 * GraphQL type definition generated from an EvoDB table.
 */
export interface GraphQLTypeDefinition {
  /** Type name (PascalCase) */
  name: string;

  /** Original table name */
  tableName: string;

  /** Field definitions */
  fields: GraphQLFieldDefinition[];

  /** Description for GraphQL documentation */
  description?: string;
}

/**
 * Input type definition for mutations.
 */
export interface GraphQLInputTypeDefinition {
  /** Input type name (e.g., UserInput, CreateUserInput) */
  name: string;

  /** Associated object type name */
  typeName: string;

  /** Fields for the input type */
  fields: GraphQLFieldDefinition[];

  /** Whether this is for create, update, or filter operations */
  purpose: 'create' | 'update' | 'filter';
}

/**
 * Filter input type for query operations.
 */
export interface GraphQLFilterDefinition {
  /** Filter type name (e.g., UserFilterInput) */
  name: string;

  /** Associated object type name */
  typeName: string;

  /** Filter fields with comparison operators */
  fields: GraphQLFilterField[];
}

/**
 * Filter field with comparison operators.
 */
export interface GraphQLFilterField {
  /** Field name */
  name: string;

  /** GraphQL type of the field value */
  type: GraphQLScalarType | string;

  /** Supported operators for this field */
  operators: FilterOperator[];
}

/**
 * Supported filter operators for GraphQL queries.
 */
export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'notIn'
  | 'like'
  | 'isNull';

/**
 * Order by direction for sorting.
 */
export type OrderDirection = 'ASC' | 'DESC';

/**
 * Order by input for GraphQL queries.
 */
export interface GraphQLOrderByInput {
  /** Field to sort by */
  field: string;

  /** Sort direction */
  direction: OrderDirection;

  /** Null handling */
  nulls?: 'FIRST' | 'LAST';
}

// =============================================================================
// Schema Configuration
// =============================================================================

/**
 * Configuration for GraphQL schema generation.
 */
export interface SchemaConfig {
  /**
   * Tables to include in the schema.
   * If not specified, all tables are included.
   */
  tables?: string[];

  /**
   * Tables to exclude from the schema.
   */
  excludeTables?: string[];

  /**
   * Custom type mappings from EvoDB types to GraphQL types.
   */
  typeMapping?: Record<string, GraphQLScalarType>;

  /**
   * Whether to generate input types for mutations.
   * Default: true
   */
  generateInputTypes?: boolean;

  /**
   * Whether to generate filter input types.
   * Default: true
   */
  generateFilterTypes?: boolean;

  /**
   * Whether to generate order by enum types.
   * Default: true
   */
  generateOrderByTypes?: boolean;

  /**
   * Whether to add descriptions to schema from column metadata.
   * Default: true
   */
  includeDescriptions?: boolean;

  /**
   * Prefix for generated type names.
   */
  typeNamePrefix?: string;

  /**
   * Suffix for generated type names.
   */
  typeNameSuffix?: string;

  /**
   * Custom field naming function.
   * Converts column names to GraphQL field names.
   */
  fieldNaming?: (columnName: string) => string;

  /**
   * Custom type naming function.
   * Converts table names to GraphQL type names.
   */
  typeNaming?: (tableName: string) => string;
}

/**
 * Table schema definition for schema generation.
 */
export interface TableDefinition {
  /** Table name */
  name: string;

  /** Column definitions */
  columns: TableSchemaColumn[];

  /** Optional description */
  description?: string;

  /** Primary key column(s) */
  primaryKey?: string | string[];
}

// =============================================================================
// Resolver Types
// =============================================================================

/**
 * Context passed to GraphQL resolvers.
 */
export interface ResolverContext {
  /** Query executor for database operations */
  executor: QueryExecutor;

  /** Current user or authentication info */
  user?: ResolverUser;

  /** Request ID for tracing */
  requestId?: string;

  /** Additional context data */
  [key: string]: unknown;
}

/**
 * User information in resolver context.
 */
export interface ResolverUser {
  /** User ID */
  id: string;

  /** User roles for authorization */
  roles?: string[];

  /** Additional user attributes */
  [key: string]: unknown;
}

/**
 * Query resolver function signature.
 */
export type QueryResolver<TArgs = Record<string, unknown>, TResult = unknown> = (
  parent: unknown,
  args: TArgs,
  context: ResolverContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

/**
 * Mutation resolver function signature.
 */
export type MutationResolver<TArgs = Record<string, unknown>, TResult = unknown> = (
  parent: unknown,
  args: TArgs,
  context: ResolverContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

/**
 * Subscription resolver function signature.
 */
export type SubscriptionResolver<TArgs = Record<string, unknown>, TResult = unknown> = {
  subscribe: (
    parent: unknown,
    args: TArgs,
    context: ResolverContext,
    info: GraphQLResolveInfo
  ) => AsyncIterator<TResult>;
  resolve?: (payload: TResult) => TResult;
};

/**
 * Minimal GraphQL resolve info interface.
 * Full interface would be from graphql-js.
 */
export interface GraphQLResolveInfo {
  /** Field name being resolved */
  fieldName: string;

  /** Field nodes from the query AST */
  fieldNodes: readonly unknown[];

  /** Return type of the field */
  returnType: unknown;

  /** Parent type containing this field */
  parentType: unknown;

  /** Path to this field in the query */
  path: unknown;

  /** Schema being executed */
  schema: unknown;

  /** Root value passed to execution */
  rootValue: unknown;

  /** Operation being executed */
  operation: unknown;

  /** Variable values */
  variableValues: Record<string, unknown>;
}

// =============================================================================
// Query Arguments
// =============================================================================

/**
 * Arguments for list queries (e.g., users, orders).
 */
export interface ListQueryArgs<TFilter = Record<string, unknown>> {
  /** Filter criteria */
  filter?: TFilter;

  /** Fields to order by */
  orderBy?: GraphQLOrderByInput[];

  /** Maximum results to return */
  limit?: number;

  /** Number of results to skip */
  offset?: number;

  /** Pagination cursor */
  after?: string;

  /** Pagination cursor */
  before?: string;

  /** Results per page */
  first?: number;

  /** Results from end */
  last?: number;
}

/**
 * Arguments for single item queries (e.g., user(id: ID!)).
 */
export interface SingleQueryArgs {
  /** Item ID */
  id: string;
}

/**
 * Arguments for create mutations.
 */
export interface CreateMutationArgs<TInput = Record<string, unknown>> {
  /** Input data for creation */
  input: TInput;
}

/**
 * Arguments for update mutations.
 */
export interface UpdateMutationArgs<TInput = Record<string, unknown>> {
  /** Item ID to update */
  id: string;

  /** Input data for update */
  input: TInput;
}

/**
 * Arguments for delete mutations.
 */
export interface DeleteMutationArgs {
  /** Item ID to delete */
  id: string;
}

/**
 * Arguments for batch delete mutations.
 */
export interface BatchDeleteMutationArgs<TFilter = Record<string, unknown>> {
  /** Filter criteria for items to delete */
  filter: TFilter;
}

// =============================================================================
// Mutation Results
// =============================================================================

/**
 * Result of a create mutation.
 */
export interface CreateMutationResult<T = Record<string, unknown>> {
  /** Whether the operation succeeded */
  success: boolean;

  /** Created item */
  data?: T;

  /** Error message if failed */
  error?: string;
}

/**
 * Result of an update mutation.
 */
export interface UpdateMutationResult<T = Record<string, unknown>> {
  /** Whether the operation succeeded */
  success: boolean;

  /** Updated item */
  data?: T;

  /** Error message if failed */
  error?: string;
}

/**
 * Result of a delete mutation.
 */
export interface DeleteMutationResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** ID of deleted item */
  deletedId?: string;

  /** Error message if failed */
  error?: string;
}

/**
 * Result of a batch delete mutation.
 */
export interface BatchDeleteMutationResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Number of items deleted */
  deletedCount: number;

  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Subscription Types
// =============================================================================

/**
 * Subscription event payload.
 */
export interface SubscriptionPayload<T = Record<string, unknown>> {
  /** Type of change */
  type: 'CREATED' | 'UPDATED' | 'DELETED';

  /** Affected item */
  data: T;

  /** Previous data (for updates) */
  previousData?: T;

  /** Timestamp of the change */
  timestamp: number;
}

/**
 * Arguments for table subscriptions.
 */
export interface TableSubscriptionArgs<TFilter = Record<string, unknown>> {
  /** Optional filter for subscription */
  filter?: TFilter;
}

/**
 * Arguments for item subscriptions.
 */
export interface ItemSubscriptionArgs {
  /** Item ID to watch */
  id: string;
}

// =============================================================================
// Connection Types (Relay-style pagination)
// =============================================================================

/**
 * Page info for Relay-style pagination.
 */
export interface PageInfo {
  /** Whether there are more items after */
  hasNextPage: boolean;

  /** Whether there are more items before */
  hasPreviousPage: boolean;

  /** Cursor of first item */
  startCursor?: string;

  /** Cursor of last item */
  endCursor?: string;
}

/**
 * Edge in a connection.
 */
export interface Edge<T = Record<string, unknown>> {
  /** The item */
  node: T;

  /** Cursor for this item */
  cursor: string;
}

/**
 * Connection type for Relay-style pagination.
 */
export interface Connection<T = Record<string, unknown>> {
  /** Edges in this page */
  edges: Edge<T>[];

  /** Page information */
  pageInfo: PageInfo;

  /** Total count (if requested) */
  totalCount?: number;
}

// =============================================================================
// Adapter Configuration
// =============================================================================

/**
 * Configuration for the GraphQL adapter.
 */
export interface GraphQLAdapterConfig {
  /** Query executor for database operations */
  executor: QueryExecutor;

  /** Schema configuration */
  schema?: SchemaConfig;

  /** Whether to enable subscriptions */
  enableSubscriptions?: boolean;

  /** Maximum query depth to prevent abuse */
  maxDepth?: number;

  /** Maximum query complexity */
  maxComplexity?: number;

  /** Whether to enable query cost analysis */
  enableCostAnalysis?: boolean;

  /** Default page size for list queries */
  defaultPageSize?: number;

  /** Maximum page size for list queries */
  maxPageSize?: number;

  /** Whether to enable Relay-style connections */
  enableConnections?: boolean;

  /** Custom scalar type implementations */
  customScalars?: Record<string, unknown>;

  /** Custom directives */
  customDirectives?: Record<string, unknown>;
}

/**
 * Generated GraphQL schema output.
 */
export interface GeneratedSchema {
  /** GraphQL SDL string */
  typeDefs: string;

  /** Object type definitions */
  types: GraphQLTypeDefinition[];

  /** Input type definitions */
  inputTypes: GraphQLInputTypeDefinition[];

  /** Filter type definitions */
  filterTypes: GraphQLFilterDefinition[];

  /** Query field definitions */
  queries: QueryFieldDefinition[];

  /** Mutation field definitions */
  mutations: MutationFieldDefinition[];

  /** Subscription field definitions */
  subscriptions: SubscriptionFieldDefinition[];
}

/**
 * Query field definition in the schema.
 */
export interface QueryFieldDefinition {
  /** Field name */
  name: string;

  /** Return type */
  returnType: string;

  /** Arguments */
  args: ArgumentDefinition[];

  /** Description */
  description?: string;

  /** Associated table */
  tableName: string;

  /** Whether this is a list query */
  isList: boolean;
}

/**
 * Mutation field definition in the schema.
 */
export interface MutationFieldDefinition {
  /** Field name */
  name: string;

  /** Return type */
  returnType: string;

  /** Arguments */
  args: ArgumentDefinition[];

  /** Description */
  description?: string;

  /** Associated table */
  tableName: string;

  /** Mutation type */
  mutationType: 'create' | 'update' | 'delete' | 'batchDelete';
}

/**
 * Subscription field definition in the schema.
 */
export interface SubscriptionFieldDefinition {
  /** Field name */
  name: string;

  /** Return type */
  returnType: string;

  /** Arguments */
  args: ArgumentDefinition[];

  /** Description */
  description?: string;

  /** Associated table */
  tableName: string;
}

/**
 * Argument definition for fields.
 */
export interface ArgumentDefinition {
  /** Argument name */
  name: string;

  /** Argument type */
  type: string;

  /** Whether the argument is required */
  required: boolean;

  /** Default value */
  defaultValue?: unknown;

  /** Description */
  description?: string;
}

// =============================================================================
// Type Mapping Utilities
// =============================================================================

/**
 * Map EvoDB column type to GraphQL scalar type.
 */
export function mapColumnTypeToGraphQL(
  columnType: TableColumnType,
  customMapping?: Record<string, GraphQLScalarType>
): GraphQLScalarType {
  // Handle complex types
  if (typeof columnType === 'object') {
    if (columnType.type === 'array') {
      return 'JSON'; // Arrays are represented as JSON
    }
    if (columnType.type === 'map') {
      return 'JSON'; // Maps are represented as JSON
    }
    if (columnType.type === 'struct') {
      return 'JSON'; // Structs are represented as JSON (or could be a custom type)
    }
    return 'JSON';
  }

  // Check custom mapping first
  if (customMapping && customMapping[columnType]) {
    return customMapping[columnType];
  }

  // Default mappings
  switch (columnType) {
    case 'null':
      return 'String'; // Nullable field
    case 'boolean':
      return 'Boolean';
    case 'int32':
      return 'Int';
    case 'int64':
      return 'Int'; // Note: GraphQL Int is 32-bit, may need BigInt scalar
    case 'float64':
      return 'Float';
    case 'string':
      return 'String';
    case 'binary':
      return 'String'; // Base64 encoded
    case 'timestamp':
      return 'DateTime';
    case 'date':
      return 'Date';
    case 'uuid':
      return 'ID';
    case 'json':
      return 'JSON';
    default:
      return 'String';
  }
}

/**
 * Convert snake_case to camelCase.
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert snake_case to PascalCase.
 */
export function snakeToPascal(str: string): string {
  const camel = snakeToCamel(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Convert table name to GraphQL type name.
 */
export function tableNameToTypeName(tableName: string): string {
  // Handle path-like table names (com/example/users -> User)
  const parts = tableName.split('/');
  const baseName = parts[parts.length - 1];

  // Remove trailing 's' for plural names and convert to PascalCase
  let typeName = snakeToPascal(baseName);
  if (typeName.endsWith('s') && !typeName.endsWith('ss')) {
    typeName = typeName.slice(0, -1);
  }

  return typeName;
}

/**
 * Generate a cursor from an ID and offset.
 */
export function encodeCursor(id: string, offset: number): string {
  return Buffer.from(`${offset}:${id}`).toString('base64');
}

/**
 * Decode a cursor to get ID and offset.
 */
export function decodeCursor(cursor: string): { id: string; offset: number } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const [offsetStr, ...idParts] = decoded.split(':');
    const offset = parseInt(offsetStr, 10);
    const id = idParts.join(':');
    if (isNaN(offset)) return null;
    return { id, offset };
  } catch {
    return null;
  }
}
