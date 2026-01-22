/**
 * @evodb/graphql - GraphQL Adapter for EvoDB
 *
 * Provides a complete GraphQL API layer for EvoDB, including:
 * - Auto-generated GraphQL schema from table definitions
 * - Query resolvers with filtering, pagination, and projections
 * - Mutation resolvers for insert, update, and delete operations
 * - Subscription support for real-time updates
 * - Integration with EvoDB's query engine
 *
 * @example Basic Usage
 * ```typescript
 * import { generateSchema, createResolvers, createGraphQLAdapter } from '@evodb/graphql';
 *
 * // Define your tables
 * const tables = [
 *   {
 *     name: 'users',
 *     columns: [
 *       { name: 'id', type: 'uuid', nullable: false },
 *       { name: 'email', type: 'string', nullable: false },
 *       { name: 'name', type: 'string', nullable: true },
 *       { name: 'created_at', type: 'timestamp', nullable: false },
 *     ],
 *     primaryKey: 'id',
 *   },
 * ];
 *
 * // Generate schema
 * const schema = generateSchema(tables);
 * console.log(schema.typeDefs);
 *
 * // Create resolvers with your query executor
 * const resolvers = createResolvers({
 *   executor: queryEngine,
 *   tables,
 * });
 *
 * // Use with your GraphQL server (e.g., Apollo, Yoga, etc.)
 * ```
 *
 * @example With Subscriptions
 * ```typescript
 * import {
 *   generateSchema,
 *   createResolvers,
 *   createSubscriptionPubSub,
 * } from '@evodb/graphql';
 * import { createSubscriptionManager } from '@evodb/core';
 *
 * // Create subscription manager
 * const subscriptionManager = createSubscriptionManager();
 * const pubsub = createSubscriptionPubSub(subscriptionManager);
 *
 * // Create resolvers with subscription support
 * const resolvers = createResolvers({
 *   executor: queryEngine,
 *   tables,
 *   pubsub,
 * });
 * ```
 *
 * @example Custom Schema Configuration
 * ```typescript
 * import { generateSchema } from '@evodb/graphql';
 *
 * const schema = generateSchema(tables, {
 *   // Include only specific tables
 *   tables: ['users', 'orders'],
 *
 *   // Exclude system tables
 *   excludeTables: ['_migrations', '_audit_log'],
 *
 *   // Custom type naming
 *   typeNaming: (tableName) => `My${tableName.toUpperCase()}`,
 *
 *   // Disable filter types
 *   generateFilterTypes: false,
 * });
 * ```
 *
 * @packageDocumentation
 * @module @evodb/graphql
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // GraphQL Schema Types
  GraphQLScalarType,
  GraphQLFieldDefinition,
  GraphQLTypeDefinition,
  GraphQLInputTypeDefinition,
  GraphQLFilterDefinition,
  GraphQLFilterField,
  FilterOperator,
  OrderDirection,
  GraphQLOrderByInput,

  // Schema Configuration
  SchemaConfig,
  TableDefinition,

  // Resolver Types
  ResolverContext,
  ResolverUser,
  QueryResolver,
  MutationResolver,
  SubscriptionResolver,
  GraphQLResolveInfo,

  // Query Arguments
  ListQueryArgs,
  SingleQueryArgs,
  CreateMutationArgs,
  UpdateMutationArgs,
  DeleteMutationArgs,
  BatchDeleteMutationArgs,

  // Mutation Results
  CreateMutationResult,
  UpdateMutationResult,
  DeleteMutationResult,
  BatchDeleteMutationResult,

  // Subscription Types
  SubscriptionPayload,
  TableSubscriptionArgs,
  ItemSubscriptionArgs,

  // Connection Types (Relay pagination)
  PageInfo,
  Edge,
  Connection,

  // Adapter Configuration
  GraphQLAdapterConfig,
  GeneratedSchema,
  QueryFieldDefinition,
  MutationFieldDefinition,
  SubscriptionFieldDefinition,
  ArgumentDefinition,
} from './types.js';

// =============================================================================
// Type Utility Exports
// =============================================================================

export {
  // Type mapping utilities
  mapColumnTypeToGraphQL,
  snakeToCamel,
  snakeToPascal,
  tableNameToTypeName,
  encodeCursor,
  decodeCursor,
} from './types.js';

// =============================================================================
// Schema Generator Exports
// =============================================================================

export {
  SchemaGenerator,
  createSchemaGenerator,
  generateSchema,
} from './schema.js';

// =============================================================================
// Resolver Exports
// =============================================================================

export type {
  ResolverConfig,
  AuthorizationFunction,
  ResolverHooks,
  SubscriptionPubSub,
  GeneratedResolvers,
  GraphQLFilterInput,
} from './resolvers.js';

export {
  ResolverGenerator,
  createResolverGenerator,
  createResolvers,
  filterToPredicates,
  createInMemoryPubSub,
  createSubscriptionPubSub,
} from './resolvers.js';

// =============================================================================
// Convenience Functions
// =============================================================================

import type { SubscriptionManager } from '@evodb/core';
import type { QueryExecutor } from '@evodb/core/query';
import type { TableDefinition, SchemaConfig, GeneratedSchema } from './types.js';
import type { ResolverConfig, GeneratedResolvers, SubscriptionPubSub } from './resolvers.js';
import { generateSchema } from './schema.js';
import { createResolvers, createSubscriptionPubSub, createInMemoryPubSub } from './resolvers.js';

/**
 * GraphQL adapter combining schema and resolvers.
 */
export interface GraphQLAdapter {
  /** Generated GraphQL SDL schema */
  typeDefs: string;

  /** Generated resolvers */
  resolvers: GeneratedResolvers;

  /** Generated schema with type definitions */
  schema: GeneratedSchema;

  /** PubSub instance for publishing events */
  pubsub: SubscriptionPubSub;
}

/**
 * Create a complete GraphQL adapter with schema and resolvers.
 *
 * This is the main entry point for setting up the GraphQL layer.
 *
 * @param config - Adapter configuration
 * @returns GraphQL adapter with schema and resolvers
 *
 * @example
 * ```typescript
 * import { createGraphQLAdapter } from '@evodb/graphql';
 * import { createYoga } from 'graphql-yoga';
 * import { createSchema } from 'graphql-yoga';
 *
 * const adapter = createGraphQLAdapter({
 *   executor: queryEngine,
 *   tables: [
 *     {
 *       name: 'users',
 *       columns: [
 *         { name: 'id', type: 'uuid', nullable: false },
 *         { name: 'email', type: 'string', nullable: false },
 *       ],
 *     },
 *   ],
 * });
 *
 * // Use with GraphQL Yoga
 * const yoga = createYoga({
 *   schema: createSchema({
 *     typeDefs: adapter.typeDefs,
 *     resolvers: adapter.resolvers,
 *   }),
 *   context: async (ctx) => ({
 *     executor: adapter.executor,
 *   }),
 * });
 * ```
 */
export function createGraphQLAdapter(config: {
  /** Query executor for database operations */
  executor: QueryExecutor;

  /** Table definitions */
  tables: TableDefinition[];

  /** Optional subscription manager for real-time updates */
  subscriptionManager?: SubscriptionManager;

  /** Schema configuration */
  schemaConfig?: SchemaConfig;

  /** Resolver configuration overrides */
  resolverConfig?: Partial<Omit<ResolverConfig, 'executor' | 'tables'>>;
}): GraphQLAdapter {
  const { executor, tables, subscriptionManager, schemaConfig, resolverConfig } = config;

  // Generate schema
  const schema = generateSchema(tables, schemaConfig);

  // Create PubSub
  const pubsub = subscriptionManager
    ? createSubscriptionPubSub(subscriptionManager)
    : createInMemoryPubSub();

  // Create resolvers
  const resolvers = createResolvers({
    executor,
    tables,
    pubsub,
    schemaConfig,
    ...resolverConfig,
  });

  return {
    typeDefs: schema.typeDefs,
    resolvers,
    schema,
    pubsub,
  };
}

/**
 * Create a minimal GraphQL adapter for read-only queries.
 *
 * This adapter only generates Query resolvers without mutations or subscriptions.
 * Useful for read-only APIs or when mutations are handled separately.
 *
 * @param config - Adapter configuration
 * @returns Read-only GraphQL adapter
 *
 * @example
 * ```typescript
 * import { createReadOnlyAdapter } from '@evodb/graphql';
 *
 * const adapter = createReadOnlyAdapter({
 *   executor: queryEngine,
 *   tables: [userTable, orderTable],
 * });
 * ```
 */
export function createReadOnlyAdapter(config: {
  executor: QueryExecutor;
  tables: TableDefinition[];
  schemaConfig?: SchemaConfig;
}): { typeDefs: string; resolvers: Pick<GeneratedResolvers, 'Query'> } {
  const { executor, tables, schemaConfig } = config;

  // Generate schema
  const schema = generateSchema(tables, {
    ...schemaConfig,
    generateInputTypes: false,
  });

  // Create resolvers (only queries will work)
  const fullResolvers = createResolvers({
    executor,
    tables,
    schemaConfig,
  });

  // Extract only Query resolvers
  const queryOnlyTypeDefs = schema.typeDefs
    .split('\n')
    .filter(
      (line) =>
        !line.includes('type Mutation') &&
        !line.includes('type Subscription') &&
        !line.includes('MutationResult') &&
        !line.includes('SubscriptionPayload')
    )
    .join('\n');

  return {
    typeDefs: queryOnlyTypeDefs,
    resolvers: {
      Query: fullResolvers.Query,
    },
  };
}

// =============================================================================
// Version and Metadata
// =============================================================================

/**
 * Package version.
 */
export const VERSION = '0.1.0-rc.1';

/**
 * Package name.
 */
export const PACKAGE_NAME = '@evodb/graphql';
