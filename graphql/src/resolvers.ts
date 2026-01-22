/**
 * @evodb/graphql - Resolvers
 *
 * Query, mutation, and subscription resolvers for the GraphQL adapter.
 * Integrates with EvoDB's query engine and subscription system.
 *
 * @example
 * ```typescript
 * import { createResolvers, createSubscriptionPubSub } from '@evodb/graphql';
 *
 * const pubsub = createSubscriptionPubSub();
 * const resolvers = createResolvers({
 *   executor,
 *   tables,
 *   pubsub,
 * });
 *
 * // Use with your GraphQL server
 * const server = createServer({
 *   typeDefs: schema.typeDefs,
 *   resolvers,
 * });
 * ```
 *
 * @packageDocumentation
 * @module @evodb/graphql
 */

import type {
  ExecutorPredicate,
  ExecutorOrderBy,
  SubscriptionManager,
} from '@evodb/core';

import type { QueryExecutor, ExecutorQuery } from '@evodb/core/query';

import type {
  ResolverContext,
  TableDefinition,
  GraphQLOrderByInput,
  ListQueryArgs,
  SingleQueryArgs,
  CreateMutationArgs,
  UpdateMutationArgs,
  DeleteMutationArgs,
  BatchDeleteMutationArgs,
  SubscriptionPayload,
  Edge,
  PageInfo,
  FilterOperator,
  SchemaConfig,
} from './types.js';

import {
  snakeToCamel,
  tableNameToTypeName,
  encodeCursor,
  decodeCursor,
} from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for resolver generation.
 */
export interface ResolverConfig {
  /** Query executor for database operations */
  executor: QueryExecutor;

  /** Table definitions */
  tables: TableDefinition[];

  /** PubSub instance for subscriptions */
  pubsub?: SubscriptionPubSub;

  /** Schema configuration (for naming conventions) */
  schemaConfig?: SchemaConfig;

  /** Default page size */
  defaultPageSize?: number;

  /** Maximum page size */
  maxPageSize?: number;

  /** Custom authorization function */
  authorize?: AuthorizationFunction;

  /** Custom mutation hooks */
  hooks?: ResolverHooks;
}

/**
 * Authorization function to check permissions.
 */
export type AuthorizationFunction = (
  context: ResolverContext,
  operation: 'read' | 'create' | 'update' | 'delete',
  tableName: string,
  data?: Record<string, unknown>
) => Promise<boolean> | boolean;

/**
 * Hooks for mutation lifecycle.
 */
export interface ResolverHooks {
  /** Called before a create mutation */
  beforeCreate?: (
    context: ResolverContext,
    tableName: string,
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;

  /** Called after a create mutation */
  afterCreate?: (
    context: ResolverContext,
    tableName: string,
    result: Record<string, unknown>
  ) => Promise<void> | void;

  /** Called before an update mutation */
  beforeUpdate?: (
    context: ResolverContext,
    tableName: string,
    id: string,
    input: Record<string, unknown>
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;

  /** Called after an update mutation */
  afterUpdate?: (
    context: ResolverContext,
    tableName: string,
    result: Record<string, unknown>
  ) => Promise<void> | void;

  /** Called before a delete mutation */
  beforeDelete?: (
    context: ResolverContext,
    tableName: string,
    id: string
  ) => Promise<boolean> | boolean;

  /** Called after a delete mutation */
  afterDelete?: (
    context: ResolverContext,
    tableName: string,
    id: string
  ) => Promise<void> | void;
}

/**
 * PubSub interface for subscriptions.
 */
export interface SubscriptionPubSub {
  /** Publish an event */
  publish(channel: string, payload: unknown): Promise<void>;

  /** Subscribe to a channel */
  subscribe(channel: string): AsyncIterableIterator<unknown>;

  /** Unsubscribe from a channel */
  unsubscribe?(channel: string): void;
}

/** Query resolver function signature (generic). */
type QueryResolverFn = (
  parent: unknown,
  args: Record<string, unknown>,
  context: ResolverContext,
  info: unknown
) => Promise<unknown> | unknown;

/** Mutation resolver function signature (generic). */
type MutationResolverFn = (
  parent: unknown,
  args: Record<string, unknown>,
  context: ResolverContext,
  info: unknown
) => Promise<unknown> | unknown;

/** Subscription resolver signature (generic). */
interface SubscriptionResolverDef {
  subscribe: (
    parent: unknown,
    args: Record<string, unknown>,
    context: ResolverContext,
    info: unknown
  ) => AsyncIterableIterator<unknown>;
  resolve?: (payload: unknown) => unknown;
}

/**
 * Generated resolvers object.
 */
export interface GeneratedResolvers {
  Query: Record<string, QueryResolverFn>;
  Mutation: Record<string, MutationResolverFn>;
  Subscription: Record<string, SubscriptionResolverDef>;

  /** Type resolvers for custom scalar handling */
  [typeName: string]: unknown;
}

/**
 * Filter input from GraphQL.
 */
export type GraphQLFilterInput = Record<string, unknown>;

// =============================================================================
// Filter Conversion
// =============================================================================

/**
 * Convert GraphQL filter input to ExecutorPredicates.
 */
export function filterToPredicates(
  filter: GraphQLFilterInput,
  fieldNaming: (name: string) => string = snakeToCamel
): ExecutorPredicate[] {
  const predicates: ExecutorPredicate[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null) continue;

    // Handle logical operators
    if (key === 'AND' && Array.isArray(value)) {
      for (const subFilter of value) {
        predicates.push(...filterToPredicates(subFilter as GraphQLFilterInput, fieldNaming));
      }
      continue;
    }

    if (key === 'OR' && Array.isArray(value)) {
      // OR is handled differently - would need to be supported by executor
      // For now, skip OR (TODO: implement OR support)
      continue;
    }

    if (key === 'NOT' && typeof value === 'object') {
      const notPredicates = filterToPredicates(value as GraphQLFilterInput, fieldNaming);
      for (const pred of notPredicates) {
        pred.not = !pred.not;
      }
      predicates.push(...notPredicates);
      continue;
    }

    // Parse field and operator from key (e.g., "name_like" -> name, like)
    const { fieldName, operator } = parseFilterKey(key);

    // Convert camelCase back to snake_case for column names
    const columnName = camelToSnake(fieldName);

    const predicate = createPredicate(columnName, operator, value);
    if (predicate) {
      predicates.push(predicate);
    }
  }

  return predicates;
}

/**
 * Parse a filter key into field name and operator.
 */
function parseFilterKey(key: string): { fieldName: string; operator: FilterOperator } {
  const suffixes: { suffix: string; operator: FilterOperator }[] = [
    { suffix: '_notIn', operator: 'notIn' },
    { suffix: '_isNull', operator: 'isNull' },
    { suffix: '_like', operator: 'like' },
    { suffix: '_not', operator: 'ne' },
    { suffix: '_gte', operator: 'gte' },
    { suffix: '_lte', operator: 'lte' },
    { suffix: '_gt', operator: 'gt' },
    { suffix: '_lt', operator: 'lt' },
    { suffix: '_in', operator: 'in' },
  ];

  for (const { suffix, operator } of suffixes) {
    if (key.endsWith(suffix)) {
      return { fieldName: key.slice(0, -suffix.length), operator };
    }
  }

  // No suffix means equality
  return { fieldName: key, operator: 'eq' };
}

/**
 * Create a predicate from field, operator, and value.
 */
function createPredicate(
  column: string,
  operator: FilterOperator,
  value: unknown
): ExecutorPredicate | null {
  switch (operator) {
    case 'eq':
      return { column, operator: 'eq', value };
    case 'ne':
      return { column, operator: 'ne', value };
    case 'gt':
      return { column, operator: 'gt', value };
    case 'gte':
      return { column, operator: 'gte', value };
    case 'lt':
      return { column, operator: 'lt', value };
    case 'lte':
      return { column, operator: 'lte', value };
    case 'in':
      return { column, operator: 'in', values: Array.isArray(value) ? value : [value] };
    case 'notIn':
      return { column, operator: 'notIn', values: Array.isArray(value) ? value : [value] };
    case 'like':
      return { column, operator: 'like', value };
    case 'isNull':
      return value ? { column, operator: 'isNull' } : { column, operator: 'isNotNull' };
    default:
      return null;
  }
}

/**
 * Convert camelCase to snake_case.
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Convert GraphQL orderBy to ExecutorOrderBy.
 */
function convertOrderBy(orderBy: GraphQLOrderByInput[]): ExecutorOrderBy[] {
  return orderBy.map((order) => ({
    column: camelToSnake(order.field.toLowerCase()),
    direction: order.direction.toLowerCase() as 'asc' | 'desc',
    nulls: order.nulls?.toLowerCase() as 'first' | 'last' | undefined,
  }));
}

// =============================================================================
// Resolver Generator
// =============================================================================

/**
 * Resolver generator class.
 */
export class ResolverGenerator {
  private config: Required<ResolverConfig>;
  private fieldNaming: (name: string) => string;
  private typeNaming: (name: string) => string;

  constructor(config: ResolverConfig) {
    this.config = {
      ...config,
      defaultPageSize: config.defaultPageSize ?? 100,
      maxPageSize: config.maxPageSize ?? 1000,
      authorize: config.authorize ?? (() => true),
      hooks: config.hooks ?? {},
      pubsub: config.pubsub ?? createInMemoryPubSub(),
      schemaConfig: config.schemaConfig ?? {},
    };

    this.fieldNaming = config.schemaConfig?.fieldNaming ?? snakeToCamel;
    this.typeNaming = config.schemaConfig?.typeNaming ?? tableNameToTypeName;
  }

  /**
   * Generate resolvers for all tables.
   */
  generate(): GeneratedResolvers {
    const Query: Record<string, QueryResolverFn> = {};
    const Mutation: Record<string, MutationResolverFn> = {};
    const Subscription: Record<string, SubscriptionResolverDef> = {};

    for (const table of this.config.tables) {
      const typeName = this.typeNaming(table.name);
      const pluralName = this.getPluralName(typeName);

      // Query resolvers
      Query[this.fieldNaming(typeName.toLowerCase())] = this.createSingleResolver(table);
      Query[this.fieldNaming(pluralName.toLowerCase())] = this.createListResolver(table);
      Query[`${this.fieldNaming(pluralName.toLowerCase())}Connection`] =
        this.createConnectionResolver(table);

      // Mutation resolvers
      Mutation[`create${typeName}`] = this.createCreateResolver(table);
      Mutation[`update${typeName}`] = this.createUpdateResolver(table);
      Mutation[`delete${typeName}`] = this.createDeleteResolver(table);
      Mutation[`delete${pluralName}`] = this.createBatchDeleteResolver(table);

      // Subscription resolvers
      Subscription[`${this.fieldNaming(pluralName.toLowerCase())}Changed`] =
        this.createTableSubscriptionResolver(table);
      Subscription[`${this.fieldNaming(typeName.toLowerCase())}Changed`] =
        this.createItemSubscriptionResolver(table);
    }

    // Add scalar resolvers
    const DateTime = {
      serialize: (value: unknown) => {
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'number') return new Date(value).toISOString();
        return value;
      },
      parseValue: (value: unknown) => {
        if (typeof value === 'string') return new Date(value);
        return value;
      },
    };

    const Date_ = {
      serialize: (value: unknown) => {
        if (value instanceof Date) return value.toISOString().split('T')[0];
        if (typeof value === 'string') return value.split('T')[0];
        return value;
      },
      parseValue: (value: unknown) => value,
    };

    const JSON_ = {
      serialize: (value: unknown) => value,
      parseValue: (value: unknown) => value,
    };

    return {
      Query,
      Mutation,
      Subscription,
      DateTime,
      Date: Date_,
      JSON: JSON_,
    };
  }

  /**
   * Create a single item query resolver.
   */
  private createSingleResolver(table: TableDefinition): QueryResolverFn {
    return async (_parent, args, context, _info) => {
      const { executor } = context;
      const typedArgs = args as unknown as SingleQueryArgs;
      const { id } = typedArgs;

      // Authorization check
      const authorized = await this.config.authorize(context, 'read', table.name);
      if (!authorized) {
        throw new Error('Not authorized');
      }

      const query: ExecutorQuery = {
        table: table.name,
        predicates: [{ column: 'id', operator: 'eq', value: id }],
        limit: 1,
      };

      const result = await executor.execute(query);

      if (result.rows.length === 0) {
        return null;
      }

      return this.transformRow(result.rows[0]);
    };
  }

  /**
   * Create a list query resolver.
   */
  private createListResolver(table: TableDefinition): QueryResolverFn {
    return async (_parent, args, context, _info) => {
      const { executor } = context;
      const typedArgs = args as unknown as ListQueryArgs<GraphQLFilterInput>;
      const { filter, orderBy, limit, offset } = typedArgs;

      // Authorization check
      const authorized = await this.config.authorize(context, 'read', table.name);
      if (!authorized) {
        throw new Error('Not authorized');
      }

      const query: ExecutorQuery = {
        table: table.name,
        predicates: filter ? filterToPredicates(filter, this.fieldNaming) : undefined,
        orderBy: orderBy ? convertOrderBy(orderBy) : undefined,
        limit: Math.min(limit ?? this.config.defaultPageSize, this.config.maxPageSize),
        offset: offset ?? 0,
      };

      const result = await executor.execute<Record<string, unknown>>(query);

      return result.rows.map((row: Record<string, unknown>) => this.transformRow(row));
    };
  }

  /**
   * Create a connection (Relay pagination) resolver.
   */
  private createConnectionResolver(table: TableDefinition): QueryResolverFn {
    return async (_parent, args, context, _info) => {
      const { executor } = context;
      const typedArgs = args as unknown as ListQueryArgs<GraphQLFilterInput>;
      const { filter, orderBy, first, after, last, before } = typedArgs;

      // Authorization check
      const authorized = await this.config.authorize(context, 'read', table.name);
      if (!authorized) {
        throw new Error('Not authorized');
      }

      // Calculate offset from cursor
      let offset = 0;
      if (after) {
        const decoded = decodeCursor(after);
        if (decoded) {
          offset = decoded.offset + 1;
        }
      }
      if (before) {
        const decoded = decodeCursor(before);
        if (decoded) {
          // For 'before', we need to adjust the offset
          offset = Math.max(0, decoded.offset - (last ?? this.config.defaultPageSize));
        }
      }

      const limit = first ?? last ?? this.config.defaultPageSize;
      const actualLimit = Math.min(limit + 1, this.config.maxPageSize + 1); // +1 to check hasNextPage

      const query: ExecutorQuery = {
        table: table.name,
        predicates: filter ? filterToPredicates(filter, this.fieldNaming) : undefined,
        orderBy: orderBy ? convertOrderBy(orderBy) : undefined,
        limit: actualLimit,
        offset,
      };

      const result = await executor.execute<Record<string, unknown>>(query);
      const hasNextPage = result.rows.length > limit;
      const rows = hasNextPage ? result.rows.slice(0, limit) : result.rows;

      // Build edges with cursors
      const edges: Edge[] = rows.map((row: Record<string, unknown>, index: number) => {
        const transformedRow = this.transformRow(row);
        return {
          node: transformedRow,
          cursor: encodeCursor(String(transformedRow.id ?? index), offset + index),
        };
      });

      const pageInfo: PageInfo = {
        hasNextPage,
        hasPreviousPage: offset > 0,
        startCursor: edges.length > 0 ? edges[0].cursor : undefined,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : undefined,
      };

      return {
        edges,
        pageInfo,
        totalCount: result.totalRowCount,
      };
    };
  }

  /**
   * Create a create mutation resolver.
   */
  private createCreateResolver(table: TableDefinition): MutationResolverFn {
    return async (_parent, args, context, _info) => {
      const typedArgs = args as unknown as CreateMutationArgs;
      let { input } = typedArgs;

      // Authorization check
      const authorized = await this.config.authorize(context, 'create', table.name, input);
      if (!authorized) {
        return { success: false, error: 'Not authorized' };
      }

      try {
        // Before hook
        if (this.config.hooks.beforeCreate) {
          input = await this.config.hooks.beforeCreate(context, table.name, input);
        }

        // Convert field names back to column names
        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(input)) {
          data[camelToSnake(key)] = value;
        }

        // Add auto-generated fields
        if (!data.id) {
          data.id = this.generateId();
        }
        data.created_at = new Date();
        data.updated_at = new Date();

        // Insert using executor
        // Note: EvoDB executor doesn't have direct insert, would need to use DO mutations
        // This is a placeholder for the actual insert logic
        const result = { ...data };

        // After hook
        if (this.config.hooks.afterCreate) {
          await this.config.hooks.afterCreate(context, table.name, result);
        }

        // Publish subscription event
        const typeName = this.typeNaming(table.name);
        const payload: SubscriptionPayload = {
          type: 'CREATED',
          data: this.transformRow(result),
          timestamp: Date.now(),
        };
        await this.config.pubsub.publish(`${typeName}Changed`, payload);

        return {
          success: true,
          data: this.transformRow(result),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };
  }

  /**
   * Create an update mutation resolver.
   */
  private createUpdateResolver(table: TableDefinition): MutationResolverFn {
    return async (_parent, args, context, _info) => {
      const typedArgs = args as unknown as UpdateMutationArgs;
      const { id, input: inputArg } = typedArgs;
      let input = inputArg;

      // Authorization check
      const authorized = await this.config.authorize(context, 'update', table.name, { id, ...input });
      if (!authorized) {
        return { success: false, error: 'Not authorized' };
      }

      try {
        // Before hook
        if (this.config.hooks.beforeUpdate) {
          input = await this.config.hooks.beforeUpdate(context, table.name, id, input);
        }

        // Convert field names back to column names
        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(input)) {
          data[camelToSnake(key)] = value;
        }
        data.updated_at = new Date();

        // Update using executor
        // Note: This is a placeholder for the actual update logic
        const result = { id, ...data };

        // After hook
        if (this.config.hooks.afterUpdate) {
          await this.config.hooks.afterUpdate(context, table.name, result);
        }

        // Publish subscription event
        const typeName = this.typeNaming(table.name);
        const payload: SubscriptionPayload = {
          type: 'UPDATED',
          data: this.transformRow(result),
          timestamp: Date.now(),
        };
        await this.config.pubsub.publish(`${typeName}Changed`, payload);

        return {
          success: true,
          data: this.transformRow(result),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };
  }

  /**
   * Create a delete mutation resolver.
   */
  private createDeleteResolver(table: TableDefinition): MutationResolverFn {
    return async (_parent, args, context, _info) => {
      const typedArgs = args as unknown as DeleteMutationArgs;
      const { id } = typedArgs;

      // Authorization check
      const authorized = await this.config.authorize(context, 'delete', table.name, { id });
      if (!authorized) {
        return { success: false, error: 'Not authorized' };
      }

      try {
        // Before hook
        if (this.config.hooks.beforeDelete) {
          const proceed = await this.config.hooks.beforeDelete(context, table.name, id);
          if (!proceed) {
            return { success: false, error: 'Delete prevented by hook' };
          }
        }

        // Delete using executor
        // Note: This is a placeholder for the actual delete logic

        // After hook
        if (this.config.hooks.afterDelete) {
          await this.config.hooks.afterDelete(context, table.name, id);
        }

        // Publish subscription event
        const typeName = this.typeNaming(table.name);
        const payload: SubscriptionPayload = {
          type: 'DELETED',
          data: { id },
          timestamp: Date.now(),
        };
        await this.config.pubsub.publish(`${typeName}Changed`, payload);

        return {
          success: true,
          deletedId: id,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };
  }

  /**
   * Create a batch delete mutation resolver.
   */
  private createBatchDeleteResolver(table: TableDefinition): MutationResolverFn {
    return async (_parent, args, context, _info) => {
      const typedArgs = args as unknown as BatchDeleteMutationArgs<GraphQLFilterInput>;
      const { filter } = typedArgs;

      // Authorization check
      const authorized = await this.config.authorize(context, 'delete', table.name);
      if (!authorized) {
        return { success: false, deletedCount: 0, error: 'Not authorized' };
      }

      try {
        // First, find all matching items
        const query: ExecutorQuery = {
          table: table.name,
          predicates: filterToPredicates(filter, this.fieldNaming),
          columns: ['id'],
        };

        const result = await context.executor.execute<{ id: unknown }>(query);
        const ids = result.rows.map((row: { id: unknown }) => row.id);

        // Delete each item
        // Note: This is a placeholder for the actual batch delete logic
        let deletedCount = 0;
        for (const id of ids) {
          // Before hook
          if (this.config.hooks.beforeDelete) {
            const proceed = await this.config.hooks.beforeDelete(context, table.name, String(id));
            if (!proceed) continue;
          }

          // Delete
          deletedCount++;

          // After hook
          if (this.config.hooks.afterDelete) {
            await this.config.hooks.afterDelete(context, table.name, String(id));
          }
        }

        // Publish subscription events
        const typeName = this.typeNaming(table.name);
        for (const id of ids) {
          const payload: SubscriptionPayload = {
            type: 'DELETED',
            data: { id },
            timestamp: Date.now(),
          };
          await this.config.pubsub.publish(`${typeName}Changed`, payload);
        }

        return {
          success: true,
          deletedCount,
        };
      } catch (error) {
        return {
          success: false,
          deletedCount: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };
  }

  /**
   * Create a table subscription resolver.
   */
  private createTableSubscriptionResolver(table: TableDefinition): SubscriptionResolverDef {
    const typeName = this.typeNaming(table.name);

    return {
      subscribe: (_parent, args, _context, _info) => {
        const { filter } = args as { filter?: GraphQLFilterInput };
        const channel = `${typeName}Changed`;

        // If filter is provided, we need to filter events
        if (filter) {
          const predicates = filterToPredicates(filter, this.fieldNaming);
          return this.createFilteredIterator(
            this.config.pubsub.subscribe(channel),
            predicates
          );
        }

        return this.config.pubsub.subscribe(channel) as AsyncIterableIterator<unknown>;
      },
    };
  }

  /**
   * Create an item subscription resolver.
   */
  private createItemSubscriptionResolver(table: TableDefinition): SubscriptionResolverDef {
    const typeName = this.typeNaming(table.name);

    return {
      subscribe: (_parent, args, _context, _info) => {
        const { id } = args as { id: string };
        const channel = `${typeName}Changed`;

        // Filter events to only include the specified item
        const predicates: ExecutorPredicate[] = [
          { column: 'id', operator: 'eq', value: id },
        ];

        return this.createFilteredIterator(
          this.config.pubsub.subscribe(channel),
          predicates
        );
      },
    };
  }

  /**
   * Create a filtered async iterator for subscriptions.
   */
  private async *createFilteredIterator(
    iterator: AsyncIterator<unknown>,
    predicates: ExecutorPredicate[]
  ): AsyncIterableIterator<unknown> {
    while (true) {
      const { value, done } = await iterator.next();
      if (done) break;

      const payload = value as SubscriptionPayload;
      if (this.matchesPredicates(payload.data, predicates)) {
        yield payload;
      }
    }
  }

  /**
   * Check if data matches predicates.
   */
  private matchesPredicates(
    data: Record<string, unknown>,
    predicates: ExecutorPredicate[]
  ): boolean {
    for (const predicate of predicates) {
      const value = data[predicate.column];

      let matches = false;
      switch (predicate.operator) {
        case 'eq':
          matches = value === predicate.value;
          break;
        case 'ne':
          matches = value !== predicate.value;
          break;
        case 'gt':
          matches = (value as number) > (predicate.value as number);
          break;
        case 'gte':
          matches = (value as number) >= (predicate.value as number);
          break;
        case 'lt':
          matches = (value as number) < (predicate.value as number);
          break;
        case 'lte':
          matches = (value as number) <= (predicate.value as number);
          break;
        case 'in':
          matches = (predicate.values ?? []).includes(value);
          break;
        case 'notIn':
          matches = !(predicate.values ?? []).includes(value);
          break;
        case 'like':
          if (typeof value === 'string' && typeof predicate.value === 'string') {
            const pattern = predicate.value.replace(/%/g, '.*').replace(/_/g, '.');
            matches = new RegExp(`^${pattern}$`, 'i').test(value);
          }
          break;
        case 'isNull':
          matches = value === null || value === undefined;
          break;
        case 'isNotNull':
          matches = value !== null && value !== undefined;
          break;
        default:
          matches = true;
      }

      if (predicate.not) {
        matches = !matches;
      }

      if (!matches) {
        return false;
      }
    }

    return true;
  }

  /**
   * Transform a row from snake_case to camelCase.
   */
  private transformRow(row: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      result[this.fieldNaming(key)] = value;
    }
    return result;
  }

  /**
   * Get plural name for a type.
   */
  private getPluralName(typeName: string): string {
    if (typeName.endsWith('y')) {
      return typeName.slice(0, -1) + 'ies';
    }
    if (typeName.endsWith('s') || typeName.endsWith('x') || typeName.endsWith('ch')) {
      return typeName + 'es';
    }
    return typeName + 's';
  }

  /**
   * Generate a unique ID (ULID-like).
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}${random}`;
  }
}

// =============================================================================
// In-Memory PubSub Implementation
// =============================================================================

/**
 * Simple in-memory PubSub for subscriptions.
 * For production, use Redis or another distributed PubSub.
 */
export function createInMemoryPubSub(): SubscriptionPubSub {
  const subscribers = new Map<string, Set<(payload: unknown) => void>>();

  return {
    async publish(channel: string, payload: unknown): Promise<void> {
      const subs = subscribers.get(channel);
      if (subs) {
        for (const callback of subs) {
          try {
            callback(payload);
          } catch {
            // Ignore errors in subscribers
          }
        }
      }
    },

    subscribe(channel: string): AsyncIterableIterator<unknown> {
      let resolver: ((value: IteratorResult<unknown>) => void) | null = null;
      const queue: unknown[] = [];

      const callback = (payload: unknown) => {
        if (resolver) {
          resolver({ value: payload, done: false });
          resolver = null;
        } else {
          queue.push(payload);
        }
      };

      if (!subscribers.has(channel)) {
        subscribers.set(channel, new Set());
      }
      subscribers.get(channel)!.add(callback);

      return {
        next(): Promise<IteratorResult<unknown>> {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          return new Promise((resolve) => {
            resolver = resolve;
          });
        },

        return(): Promise<IteratorResult<unknown>> {
          subscribers.get(channel)?.delete(callback);
          return Promise.resolve({ value: undefined, done: true });
        },

        throw(error: unknown): Promise<IteratorResult<unknown>> {
          subscribers.get(channel)?.delete(callback);
          return Promise.reject(error);
        },

        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },

    unsubscribe(channel: string): void {
      subscribers.delete(channel);
    },
  };
}

// =============================================================================
// EvoDB SubscriptionManager Integration
// =============================================================================

/**
 * Create a PubSub adapter from EvoDB's SubscriptionManager.
 * The manager parameter is for future integration with EvoDB's subscription system.
 */
export function createSubscriptionPubSub(_manager: SubscriptionManager): SubscriptionPubSub {
  const inMemoryPubSub = createInMemoryPubSub();

  // TODO: Integrate with EvoDB's SubscriptionManager for distributed subscriptions
  // For now, we use the in-memory pubsub which works for single-instance deployments

  return {
    async publish(channel: string, payload: unknown): Promise<void> {
      // Also emit to in-memory for GraphQL subscriptions
      await inMemoryPubSub.publish(channel, payload);
    },

    subscribe(channel: string): AsyncIterableIterator<unknown> {
      return inMemoryPubSub.subscribe(channel);
    },
  };
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a resolver generator instance.
 */
export function createResolverGenerator(config: ResolverConfig): ResolverGenerator {
  return new ResolverGenerator(config);
}

/**
 * Generate resolvers from configuration.
 */
export function createResolvers(config: ResolverConfig): GeneratedResolvers {
  const generator = new ResolverGenerator(config);
  return generator.generate();
}
