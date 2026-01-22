/**
 * @evodb/graphql - Schema Generator
 *
 * Auto-generates GraphQL schema from EvoDB table definitions.
 * Supports:
 * - Object types from table schemas
 * - Input types for mutations
 * - Filter types for queries
 * - Connection types for pagination
 * - Query, Mutation, and Subscription root types
 *
 * @example
 * ```typescript
 * import { generateSchema, createSchemaGenerator } from '@evodb/graphql';
 *
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
 * const schema = generateSchema(tables, {
 *   generateInputTypes: true,
 *   generateFilterTypes: true,
 *   enableConnections: true,
 * });
 *
 * console.log(schema.typeDefs);
 * ```
 *
 * @packageDocumentation
 * @module @evodb/graphql
 */

import type { TableSchemaColumn, TableColumnType } from '@evodb/core';

import type {
  SchemaConfig,
  TableDefinition,
  GraphQLTypeDefinition,
  GraphQLFieldDefinition,
  GraphQLInputTypeDefinition,
  GraphQLFilterDefinition,
  GraphQLFilterField,
  GraphQLScalarType,
  GeneratedSchema,
  QueryFieldDefinition,
  MutationFieldDefinition,
  SubscriptionFieldDefinition,
  ArgumentDefinition,
  FilterOperator,
} from './types.js';

import {
  mapColumnTypeToGraphQL,
  snakeToCamel,
  tableNameToTypeName,
} from './types.js';

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<SchemaConfig> = {
  tables: [],
  excludeTables: [],
  typeMapping: {},
  generateInputTypes: true,
  generateFilterTypes: true,
  generateOrderByTypes: true,
  includeDescriptions: true,
  typeNamePrefix: '',
  typeNameSuffix: '',
  fieldNaming: snakeToCamel,
  typeNaming: tableNameToTypeName,
};

// =============================================================================
// Schema Generator Class
// =============================================================================

/**
 * GraphQL schema generator from EvoDB table definitions.
 */
export class SchemaGenerator {
  private config: Required<SchemaConfig>;
  private types: GraphQLTypeDefinition[] = [];
  private inputTypes: GraphQLInputTypeDefinition[] = [];
  private filterTypes: GraphQLFilterDefinition[] = [];
  private queries: QueryFieldDefinition[] = [];
  private mutations: MutationFieldDefinition[] = [];
  private subscriptions: SubscriptionFieldDefinition[] = [];

  constructor(config: SchemaConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate GraphQL schema from table definitions.
   */
  generate(tables: TableDefinition[]): GeneratedSchema {
    // Reset state
    this.types = [];
    this.inputTypes = [];
    this.filterTypes = [];
    this.queries = [];
    this.mutations = [];
    this.subscriptions = [];

    // Filter tables based on configuration
    const filteredTables = this.filterTables(tables);

    // Generate types for each table
    for (const table of filteredTables) {
      this.generateTableTypes(table);
    }

    // Generate SDL
    const typeDefs = this.generateTypeDefs();

    return {
      typeDefs,
      types: this.types,
      inputTypes: this.inputTypes,
      filterTypes: this.filterTypes,
      queries: this.queries,
      mutations: this.mutations,
      subscriptions: this.subscriptions,
    };
  }

  /**
   * Filter tables based on configuration.
   */
  private filterTables(tables: TableDefinition[]): TableDefinition[] {
    return tables.filter((table) => {
      // Check include list
      if (this.config.tables.length > 0 && !this.config.tables.includes(table.name)) {
        return false;
      }

      // Check exclude list
      if (this.config.excludeTables.includes(table.name)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Generate all types for a single table.
   */
  private generateTableTypes(table: TableDefinition): void {
    const typeName = this.getTypeName(table.name);
    const pluralName = this.getPluralName(typeName);

    // Generate object type
    const objectType = this.generateObjectType(table, typeName);
    this.types.push(objectType);

    // Generate input types for mutations
    if (this.config.generateInputTypes) {
      this.generateInputTypes(table, typeName);
    }

    // Generate filter type for queries
    if (this.config.generateFilterTypes) {
      this.generateFilterType(table, typeName);
    }

    // Generate query fields
    this.generateQueryFields(table, typeName, pluralName);

    // Generate mutation fields
    this.generateMutationFields(table, typeName);

    // Generate subscription fields
    this.generateSubscriptionFields(table, typeName);
  }

  /**
   * Generate GraphQL object type from table definition.
   */
  private generateObjectType(
    table: TableDefinition,
    typeName: string
  ): GraphQLTypeDefinition {
    const fields: GraphQLFieldDefinition[] = table.columns.map((column) =>
      this.columnToField(column)
    );

    return {
      name: typeName,
      tableName: table.name,
      fields,
      description: table.description,
    };
  }

  /**
   * Convert a table column to a GraphQL field definition.
   */
  private columnToField(column: TableSchemaColumn): GraphQLFieldDefinition {
    const graphqlType = mapColumnTypeToGraphQL(column.type, this.config.typeMapping);
    const isList = this.isArrayType(column.type);

    return {
      name: this.config.fieldNaming(column.name),
      columnName: column.name,
      type: graphqlType,
      nullable: column.nullable,
      isList,
      description: column.doc,
      defaultValue: column.defaultValue,
    };
  }

  /**
   * Check if a column type is an array type.
   */
  private isArrayType(type: TableColumnType): boolean {
    return typeof type === 'object' && type.type === 'array';
  }

  /**
   * Generate input types for create and update mutations.
   */
  private generateInputTypes(table: TableDefinition, typeName: string): void {
    // Create input type (all fields except auto-generated ones)
    const createFields = table.columns
      .filter((col) => !this.isAutoGeneratedColumn(col.name))
      .map((col) => this.columnToField(col));

    this.inputTypes.push({
      name: `Create${typeName}Input`,
      typeName,
      fields: createFields,
      purpose: 'create',
    });

    // Update input type (all fields optional)
    const updateFields = table.columns
      .filter((col) => !this.isAutoGeneratedColumn(col.name) && !this.isPrimaryKey(col.name, table))
      .map((col) => ({
        ...this.columnToField(col),
        nullable: true, // All fields optional for updates
      }));

    this.inputTypes.push({
      name: `Update${typeName}Input`,
      typeName,
      fields: updateFields,
      purpose: 'update',
    });
  }

  /**
   * Generate filter type for query operations.
   */
  private generateFilterType(table: TableDefinition, typeName: string): void {
    const fields: GraphQLFilterField[] = table.columns.map((col) => {
      const graphqlType = mapColumnTypeToGraphQL(col.type, this.config.typeMapping);
      const operators = this.getOperatorsForType(graphqlType);

      return {
        name: this.config.fieldNaming(col.name),
        type: graphqlType,
        operators,
      };
    });

    this.filterTypes.push({
      name: `${typeName}FilterInput`,
      typeName,
      fields,
    });
  }

  /**
   * Get supported filter operators for a GraphQL type.
   */
  private getOperatorsForType(type: GraphQLScalarType | string): FilterOperator[] {
    const baseOps: FilterOperator[] = ['eq', 'ne', 'isNull'];

    switch (type) {
      case 'Int':
      case 'Float':
      case 'DateTime':
      case 'Date':
        return [...baseOps, 'gt', 'gte', 'lt', 'lte', 'in', 'notIn'];
      case 'String':
        return [...baseOps, 'in', 'notIn', 'like'];
      case 'Boolean':
        return ['eq', 'ne', 'isNull'];
      case 'ID':
        return [...baseOps, 'in', 'notIn'];
      default:
        return baseOps;
    }
  }

  /**
   * Generate query fields for a table.
   */
  private generateQueryFields(
    table: TableDefinition,
    typeName: string,
    pluralName: string
  ): void {
    // Single item query (e.g., user(id: ID!): User)
    const primaryKeyField = this.getPrimaryKeyField(table);
    if (primaryKeyField) {
      this.queries.push({
        name: this.config.fieldNaming(typeName.toLowerCase()),
        returnType: typeName,
        args: [
          {
            name: 'id',
            type: 'ID!',
            required: true,
            description: `ID of the ${typeName} to retrieve`,
          },
        ],
        description: `Get a single ${typeName} by ID`,
        tableName: table.name,
        isList: false,
      });
    }

    // List query (e.g., users(filter: UserFilterInput, ...): [User!]!)
    const listArgs: ArgumentDefinition[] = [];

    if (this.config.generateFilterTypes) {
      listArgs.push({
        name: 'filter',
        type: `${typeName}FilterInput`,
        required: false,
        description: 'Filter criteria',
      });
    }

    if (this.config.generateOrderByTypes) {
      listArgs.push({
        name: 'orderBy',
        type: `[${typeName}OrderByInput!]`,
        required: false,
        description: 'Sort order',
      });
    }

    listArgs.push(
      {
        name: 'limit',
        type: 'Int',
        required: false,
        defaultValue: 100,
        description: 'Maximum number of results',
      },
      {
        name: 'offset',
        type: 'Int',
        required: false,
        defaultValue: 0,
        description: 'Number of results to skip',
      }
    );

    this.queries.push({
      name: this.config.fieldNaming(pluralName.toLowerCase()),
      returnType: `[${typeName}!]!`,
      args: listArgs,
      description: `List ${pluralName}`,
      tableName: table.name,
      isList: true,
    });

    // Connection query for Relay-style pagination
    const connectionArgs: ArgumentDefinition[] = [...listArgs];
    connectionArgs.push(
      {
        name: 'first',
        type: 'Int',
        required: false,
        description: 'Number of items to return from start',
      },
      {
        name: 'after',
        type: 'String',
        required: false,
        description: 'Cursor to start after',
      },
      {
        name: 'last',
        type: 'Int',
        required: false,
        description: 'Number of items to return from end',
      },
      {
        name: 'before',
        type: 'String',
        required: false,
        description: 'Cursor to start before',
      }
    );

    this.queries.push({
      name: `${this.config.fieldNaming(pluralName.toLowerCase())}Connection`,
      returnType: `${typeName}Connection!`,
      args: connectionArgs,
      description: `Paginated list of ${pluralName}`,
      tableName: table.name,
      isList: true,
    });
  }

  /**
   * Generate mutation fields for a table.
   */
  private generateMutationFields(table: TableDefinition, typeName: string): void {
    // Create mutation
    this.mutations.push({
      name: `create${typeName}`,
      returnType: `${typeName}MutationResult!`,
      args: [
        {
          name: 'input',
          type: `Create${typeName}Input!`,
          required: true,
          description: 'Data for the new item',
        },
      ],
      description: `Create a new ${typeName}`,
      tableName: table.name,
      mutationType: 'create',
    });

    // Update mutation
    this.mutations.push({
      name: `update${typeName}`,
      returnType: `${typeName}MutationResult!`,
      args: [
        {
          name: 'id',
          type: 'ID!',
          required: true,
          description: 'ID of the item to update',
        },
        {
          name: 'input',
          type: `Update${typeName}Input!`,
          required: true,
          description: 'Data to update',
        },
      ],
      description: `Update an existing ${typeName}`,
      tableName: table.name,
      mutationType: 'update',
    });

    // Delete mutation
    this.mutations.push({
      name: `delete${typeName}`,
      returnType: 'DeleteMutationResult!',
      args: [
        {
          name: 'id',
          type: 'ID!',
          required: true,
          description: 'ID of the item to delete',
        },
      ],
      description: `Delete a ${typeName}`,
      tableName: table.name,
      mutationType: 'delete',
    });

    // Batch delete mutation
    if (this.config.generateFilterTypes) {
      this.mutations.push({
        name: `delete${this.getPluralName(typeName)}`,
        returnType: 'BatchDeleteMutationResult!',
        args: [
          {
            name: 'filter',
            type: `${typeName}FilterInput!`,
            required: true,
            description: 'Filter for items to delete',
          },
        ],
        description: `Delete multiple ${this.getPluralName(typeName)}`,
        tableName: table.name,
        mutationType: 'batchDelete',
      });
    }
  }

  /**
   * Generate subscription fields for a table.
   */
  private generateSubscriptionFields(table: TableDefinition, typeName: string): void {
    const pluralName = this.getPluralName(typeName);
    const args: ArgumentDefinition[] = [];

    if (this.config.generateFilterTypes) {
      args.push({
        name: 'filter',
        type: `${typeName}FilterInput`,
        required: false,
        description: 'Filter for subscription events',
      });
    }

    // Table change subscription
    this.subscriptions.push({
      name: `${this.config.fieldNaming(pluralName.toLowerCase())}Changed`,
      returnType: `${typeName}SubscriptionPayload!`,
      args,
      description: `Subscribe to changes on ${pluralName}`,
      tableName: table.name,
    });

    // Single item subscription
    this.subscriptions.push({
      name: `${this.config.fieldNaming(typeName.toLowerCase())}Changed`,
      returnType: `${typeName}SubscriptionPayload!`,
      args: [
        {
          name: 'id',
          type: 'ID!',
          required: true,
          description: 'ID of the item to watch',
        },
      ],
      description: `Subscribe to changes on a specific ${typeName}`,
      tableName: table.name,
    });
  }

  /**
   * Generate GraphQL SDL from collected definitions.
   */
  private generateTypeDefs(): string {
    const lines: string[] = [];

    // Custom scalars
    lines.push('# Custom Scalars');
    lines.push('scalar DateTime');
    lines.push('scalar Date');
    lines.push('scalar JSON');
    lines.push('');

    // Enum for mutation change type
    lines.push('# Change Type Enum');
    lines.push('enum ChangeType {');
    lines.push('  CREATED');
    lines.push('  UPDATED');
    lines.push('  DELETED');
    lines.push('}');
    lines.push('');

    // Common types
    lines.push('# Common Types');
    lines.push('type PageInfo {');
    lines.push('  hasNextPage: Boolean!');
    lines.push('  hasPreviousPage: Boolean!');
    lines.push('  startCursor: String');
    lines.push('  endCursor: String');
    lines.push('}');
    lines.push('');

    lines.push('type DeleteMutationResult {');
    lines.push('  success: Boolean!');
    lines.push('  deletedId: ID');
    lines.push('  error: String');
    lines.push('}');
    lines.push('');

    lines.push('type BatchDeleteMutationResult {');
    lines.push('  success: Boolean!');
    lines.push('  deletedCount: Int!');
    lines.push('  error: String');
    lines.push('}');
    lines.push('');

    // Object types
    lines.push('# Object Types');
    for (const type of this.types) {
      lines.push(...this.generateObjectTypeSDL(type));
      lines.push('');
    }

    // Connection types
    lines.push('# Connection Types');
    for (const type of this.types) {
      lines.push(...this.generateConnectionTypeSDL(type.name));
      lines.push('');
    }

    // Mutation result types
    lines.push('# Mutation Result Types');
    for (const type of this.types) {
      lines.push(...this.generateMutationResultTypeSDL(type.name));
      lines.push('');
    }

    // Subscription payload types
    lines.push('# Subscription Payload Types');
    for (const type of this.types) {
      lines.push(...this.generateSubscriptionPayloadTypeSDL(type.name));
      lines.push('');
    }

    // Input types
    if (this.config.generateInputTypes) {
      lines.push('# Input Types');
      for (const inputType of this.inputTypes) {
        lines.push(...this.generateInputTypeSDL(inputType));
        lines.push('');
      }
    }

    // Filter types
    if (this.config.generateFilterTypes) {
      lines.push('# Filter Types');
      for (const filterType of this.filterTypes) {
        lines.push(...this.generateFilterTypeSDL(filterType));
        lines.push('');
      }
    }

    // Order by types
    if (this.config.generateOrderByTypes) {
      lines.push('# Order By Types');
      lines.push('enum OrderDirection {');
      lines.push('  ASC');
      lines.push('  DESC');
      lines.push('}');
      lines.push('');

      lines.push('enum NullsOrdering {');
      lines.push('  FIRST');
      lines.push('  LAST');
      lines.push('}');
      lines.push('');

      for (const type of this.types) {
        lines.push(...this.generateOrderByTypeSDL(type));
        lines.push('');
      }
    }

    // Query type
    lines.push('# Query Root Type');
    lines.push('type Query {');
    for (const query of this.queries) {
      const desc = query.description ? `  """${query.description}"""\n` : '';
      const args = query.args.length > 0 ? `(${this.formatArgs(query.args)})` : '';
      lines.push(`${desc}  ${query.name}${args}: ${query.returnType}`);
    }
    lines.push('}');
    lines.push('');

    // Mutation type
    if (this.mutations.length > 0) {
      lines.push('# Mutation Root Type');
      lines.push('type Mutation {');
      for (const mutation of this.mutations) {
        const desc = mutation.description ? `  """${mutation.description}"""\n` : '';
        const args = mutation.args.length > 0 ? `(${this.formatArgs(mutation.args)})` : '';
        lines.push(`${desc}  ${mutation.name}${args}: ${mutation.returnType}`);
      }
      lines.push('}');
      lines.push('');
    }

    // Subscription type
    if (this.subscriptions.length > 0) {
      lines.push('# Subscription Root Type');
      lines.push('type Subscription {');
      for (const subscription of this.subscriptions) {
        const desc = subscription.description ? `  """${subscription.description}"""\n` : '';
        const args = subscription.args.length > 0 ? `(${this.formatArgs(subscription.args)})` : '';
        lines.push(`${desc}  ${subscription.name}${args}: ${subscription.returnType}`);
      }
      lines.push('}');
    }

    return lines.join('\n');
  }

  /**
   * Generate SDL for an object type.
   */
  private generateObjectTypeSDL(type: GraphQLTypeDefinition): string[] {
    const lines: string[] = [];

    if (type.description && this.config.includeDescriptions) {
      lines.push(`"""${type.description}"""`);
    }

    lines.push(`type ${type.name} {`);

    for (const field of type.fields) {
      const desc =
        field.description && this.config.includeDescriptions
          ? `  """${field.description}"""\n`
          : '';
      const typeStr = this.formatFieldType(field);
      lines.push(`${desc}  ${field.name}: ${typeStr}`);
    }

    lines.push('}');
    return lines;
  }

  /**
   * Generate SDL for a connection type.
   */
  private generateConnectionTypeSDL(typeName: string): string[] {
    return [
      `type ${typeName}Edge {`,
      `  node: ${typeName}!`,
      '  cursor: String!',
      '}',
      '',
      `type ${typeName}Connection {`,
      `  edges: [${typeName}Edge!]!`,
      '  pageInfo: PageInfo!',
      '  totalCount: Int',
      '}',
    ];
  }

  /**
   * Generate SDL for a mutation result type.
   */
  private generateMutationResultTypeSDL(typeName: string): string[] {
    return [
      `type ${typeName}MutationResult {`,
      '  success: Boolean!',
      `  data: ${typeName}`,
      '  error: String',
      '}',
    ];
  }

  /**
   * Generate SDL for a subscription payload type.
   */
  private generateSubscriptionPayloadTypeSDL(typeName: string): string[] {
    return [
      `type ${typeName}SubscriptionPayload {`,
      '  type: ChangeType!',
      `  data: ${typeName}!`,
      `  previousData: ${typeName}`,
      '  timestamp: DateTime!',
      '}',
    ];
  }

  /**
   * Generate SDL for an input type.
   */
  private generateInputTypeSDL(inputType: GraphQLInputTypeDefinition): string[] {
    const lines: string[] = [];

    lines.push(`input ${inputType.name} {`);

    for (const field of inputType.fields) {
      const typeStr = this.formatFieldType(field);
      lines.push(`  ${field.name}: ${typeStr}`);
    }

    lines.push('}');
    return lines;
  }

  /**
   * Generate SDL for a filter type.
   */
  private generateFilterTypeSDL(filterType: GraphQLFilterDefinition): string[] {
    const lines: string[] = [];

    lines.push(`input ${filterType.name} {`);

    for (const field of filterType.fields) {
      // Generate comparison operator fields
      for (const op of field.operators) {
        const opSuffix = this.getOperatorSuffix(op);
        const fieldName = opSuffix ? `${field.name}_${opSuffix}` : field.name;
        const typeStr = this.getOperatorType(op, field.type);
        lines.push(`  ${fieldName}: ${typeStr}`);
      }
    }

    // Add logical operators
    lines.push(`  AND: [${filterType.name}!]`);
    lines.push(`  OR: [${filterType.name}!]`);
    lines.push(`  NOT: ${filterType.name}`);

    lines.push('}');
    return lines;
  }

  /**
   * Generate SDL for an order by type.
   */
  private generateOrderByTypeSDL(type: GraphQLTypeDefinition): string[] {
    const lines: string[] = [];

    // Field enum
    lines.push(`enum ${type.name}OrderField {`);
    for (const field of type.fields) {
      lines.push(`  ${field.name.toUpperCase()}`);
    }
    lines.push('}');
    lines.push('');

    // Order by input
    lines.push(`input ${type.name}OrderByInput {`);
    lines.push('  field: ' + type.name + 'OrderField!');
    lines.push('  direction: OrderDirection!');
    lines.push('  nulls: NullsOrdering');
    lines.push('}');

    return lines;
  }

  /**
   * Format field type with nullability.
   */
  private formatFieldType(field: GraphQLFieldDefinition): string {
    let type = field.type;

    if (field.isList) {
      type = `[${type}!]`;
    }

    if (!field.nullable) {
      type = `${type}!`;
    }

    return type;
  }

  /**
   * Format arguments for SDL.
   */
  private formatArgs(args: ArgumentDefinition[]): string {
    return args
      .map((arg) => {
        let type = arg.type;
        if (arg.required && !type.endsWith('!')) {
          type = `${type}!`;
        }
        const defaultVal =
          arg.defaultValue !== undefined ? ` = ${JSON.stringify(arg.defaultValue)}` : '';
        return `${arg.name}: ${type}${defaultVal}`;
      })
      .join(', ');
  }

  /**
   * Get suffix for filter operator.
   */
  private getOperatorSuffix(op: FilterOperator): string {
    switch (op) {
      case 'eq':
        return '';
      case 'ne':
        return 'not';
      case 'gt':
        return 'gt';
      case 'gte':
        return 'gte';
      case 'lt':
        return 'lt';
      case 'lte':
        return 'lte';
      case 'in':
        return 'in';
      case 'notIn':
        return 'notIn';
      case 'like':
        return 'like';
      case 'isNull':
        return 'isNull';
      default:
        return '';
    }
  }

  /**
   * Get GraphQL type for filter operator.
   */
  private getOperatorType(op: FilterOperator, baseType: string): string {
    switch (op) {
      case 'in':
      case 'notIn':
        return `[${baseType}!]`;
      case 'isNull':
        return 'Boolean';
      default:
        return baseType;
    }
  }

  /**
   * Get the GraphQL type name from table name.
   */
  private getTypeName(tableName: string): string {
    const baseName = this.config.typeNaming(tableName);
    return `${this.config.typeNamePrefix}${baseName}${this.config.typeNameSuffix}`;
  }

  /**
   * Get plural name for a type.
   */
  private getPluralName(typeName: string): string {
    // Simple pluralization
    if (typeName.endsWith('y')) {
      return typeName.slice(0, -1) + 'ies';
    }
    if (typeName.endsWith('s') || typeName.endsWith('x') || typeName.endsWith('ch')) {
      return typeName + 'es';
    }
    return typeName + 's';
  }

  /**
   * Check if a column is auto-generated.
   */
  private isAutoGeneratedColumn(columnName: string): boolean {
    const autoGenerated = ['id', 'created_at', 'updated_at', '_id', '_version', '_created_at'];
    return autoGenerated.includes(columnName.toLowerCase());
  }

  /**
   * Check if a column is a primary key.
   */
  private isPrimaryKey(columnName: string, table: TableDefinition): boolean {
    if (!table.primaryKey) {
      return columnName.toLowerCase() === 'id';
    }
    if (Array.isArray(table.primaryKey)) {
      return table.primaryKey.includes(columnName);
    }
    return table.primaryKey === columnName;
  }

  /**
   * Get the primary key field from a table.
   */
  private getPrimaryKeyField(table: TableDefinition): TableSchemaColumn | undefined {
    const pkName = table.primaryKey
      ? Array.isArray(table.primaryKey)
        ? table.primaryKey[0]
        : table.primaryKey
      : 'id';

    return table.columns.find((col) => col.name === pkName);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a schema generator instance.
 */
export function createSchemaGenerator(config?: SchemaConfig): SchemaGenerator {
  return new SchemaGenerator(config);
}

/**
 * Generate GraphQL schema from table definitions.
 */
export function generateSchema(
  tables: TableDefinition[],
  config?: SchemaConfig
): GeneratedSchema {
  const generator = new SchemaGenerator(config);
  return generator.generate(tables);
}
