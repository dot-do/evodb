/**
 * @evodb/graphql - Schema Generator Unit Tests
 *
 * Tests for GraphQL schema generation from EvoDB table definitions.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  SchemaGenerator,
  createSchemaGenerator,
  generateSchema,
} from '../schema.js';

import type { TableDefinition, GeneratedSchema } from '../types.js';

import { SAMPLE_TABLES } from './fixtures/mock-executor.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const basicTable: TableDefinition = {
  name: 'users',
  columns: [
    { name: 'id', type: 'uuid', nullable: false },
    { name: 'email', type: 'string', nullable: false },
    { name: 'name', type: 'string', nullable: true },
  ],
  primaryKey: 'id',
};

// =============================================================================
// Schema Generator Tests
// =============================================================================

describe('SchemaGenerator', () => {
  let generator: SchemaGenerator;

  beforeEach(() => {
    generator = createSchemaGenerator();
  });

  describe('Basic Schema Generation', () => {
    it('should generate schema for a single table', () => {
      const schema = generator.generate([basicTable]);

      expect(schema.typeDefs).toBeDefined();
      expect(schema.types).toHaveLength(1);
      expect(schema.types[0].name).toBe('User');
    });

    it('should generate object type with correct fields', () => {
      const schema = generator.generate([basicTable]);

      const userType = schema.types.find((t) => t.name === 'User');
      expect(userType).toBeDefined();
      expect(userType!.fields).toHaveLength(3);

      const idField = userType!.fields.find((f) => f.name === 'id');
      expect(idField).toBeDefined();
      expect(idField!.type).toBe('ID');
      expect(idField!.nullable).toBe(false);

      const nameField = userType!.fields.find((f) => f.name === 'name');
      expect(nameField).toBeDefined();
      expect(nameField!.nullable).toBe(true);
    });

    it('should convert snake_case column names to camelCase fields', () => {
      const tableWithSnakeCase: TableDefinition = {
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', nullable: false },
          { name: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updated_at', type: 'timestamp', nullable: true },
        ],
      };

      const schema = generator.generate([tableWithSnakeCase]);
      const userType = schema.types[0];

      expect(userType.fields.find((f) => f.name === 'createdAt')).toBeDefined();
      expect(userType.fields.find((f) => f.name === 'updatedAt')).toBeDefined();
    });
  });

  describe('Type Mapping', () => {
    it('should map EvoDB types to GraphQL types correctly', () => {
      const tableWithAllTypes: TableDefinition = {
        name: 'test',
        columns: [
          { name: 'id', type: 'uuid', nullable: false },
          { name: 'name', type: 'string', nullable: false },
          { name: 'age', type: 'int32', nullable: false },
          { name: 'balance', type: 'float64', nullable: false },
          { name: 'active', type: 'boolean', nullable: false },
          { name: 'created_at', type: 'timestamp', nullable: false },
          { name: 'birth_date', type: 'date', nullable: true },
          { name: 'metadata', type: 'json', nullable: true },
        ],
      };

      const schema = generator.generate([tableWithAllTypes]);
      const testType = schema.types[0];

      expect(testType.fields.find((f) => f.name === 'id')?.type).toBe('ID');
      expect(testType.fields.find((f) => f.name === 'name')?.type).toBe('String');
      expect(testType.fields.find((f) => f.name === 'age')?.type).toBe('Int');
      expect(testType.fields.find((f) => f.name === 'balance')?.type).toBe('Float');
      expect(testType.fields.find((f) => f.name === 'active')?.type).toBe('Boolean');
      expect(testType.fields.find((f) => f.name === 'createdAt')?.type).toBe('DateTime');
      expect(testType.fields.find((f) => f.name === 'birthDate')?.type).toBe('Date');
      expect(testType.fields.find((f) => f.name === 'metadata')?.type).toBe('JSON');
    });

    it('should handle custom type mappings', () => {
      const customGenerator = createSchemaGenerator({
        typeMapping: {
          string: 'String',
          uuid: 'String', // Override UUID to String
        },
      });

      const schema = customGenerator.generate([basicTable]);
      const userType = schema.types[0];

      expect(userType.fields.find((f) => f.name === 'id')?.type).toBe('String');
    });
  });

  describe('Input Type Generation', () => {
    it('should generate create input type', () => {
      const schema = generator.generate([basicTable]);

      const createInput = schema.inputTypes.find((t) => t.name === 'CreateUserInput');
      expect(createInput).toBeDefined();
      expect(createInput!.purpose).toBe('create');

      // Should not include auto-generated fields
      expect(createInput!.fields.find((f) => f.columnName === 'id')).toBeUndefined();
    });

    it('should generate update input type with all fields optional', () => {
      const schema = generator.generate([basicTable]);

      const updateInput = schema.inputTypes.find((t) => t.name === 'UpdateUserInput');
      expect(updateInput).toBeDefined();
      expect(updateInput!.purpose).toBe('update');

      // All fields should be nullable for updates
      for (const field of updateInput!.fields) {
        expect(field.nullable).toBe(true);
      }
    });

    it('should not generate input types when disabled', () => {
      const noInputGenerator = createSchemaGenerator({
        generateInputTypes: false,
      });

      const schema = noInputGenerator.generate([basicTable]);

      expect(schema.inputTypes).toHaveLength(0);
    });
  });

  describe('Filter Type Generation', () => {
    it('should generate filter input type', () => {
      const schema = generator.generate([basicTable]);

      const filterType = schema.filterTypes.find((t) => t.name === 'UserFilterInput');
      expect(filterType).toBeDefined();
      expect(filterType!.fields.length).toBeGreaterThan(0);
    });

    it('should include comparison operators for each field', () => {
      const schema = generator.generate([basicTable]);

      const filterType = schema.filterTypes.find((t) => t.name === 'UserFilterInput')!;
      const emailFilter = filterType.fields.find((f) => f.name === 'email');

      expect(emailFilter).toBeDefined();
      expect(emailFilter!.operators).toContain('eq');
      expect(emailFilter!.operators).toContain('ne');
      expect(emailFilter!.operators).toContain('like');
    });

    it('should include numeric operators for numeric fields', () => {
      const tableWithNumbers: TableDefinition = {
        name: 'products',
        columns: [
          { name: 'id', type: 'uuid', nullable: false },
          { name: 'price', type: 'float64', nullable: false },
        ],
      };

      const schema = generator.generate([tableWithNumbers]);
      const filterType = schema.filterTypes[0];
      const priceFilter = filterType.fields.find((f) => f.name === 'price');

      expect(priceFilter).toBeDefined();
      expect(priceFilter!.operators).toContain('gt');
      expect(priceFilter!.operators).toContain('gte');
      expect(priceFilter!.operators).toContain('lt');
      expect(priceFilter!.operators).toContain('lte');
    });
  });

  describe('Query Generation', () => {
    it('should generate single item query', () => {
      const schema = generator.generate([basicTable]);

      const singleQuery = schema.queries.find((q) => q.name === 'user');
      expect(singleQuery).toBeDefined();
      expect(singleQuery!.isList).toBe(false);
      expect(singleQuery!.returnType).toBe('User');
      expect(singleQuery!.args.find((a) => a.name === 'id')).toBeDefined();
    });

    it('should generate list query', () => {
      const schema = generator.generate([basicTable]);

      const listQuery = schema.queries.find((q) => q.name === 'users');
      expect(listQuery).toBeDefined();
      expect(listQuery!.isList).toBe(true);
      expect(listQuery!.returnType).toBe('[User!]!');
    });

    it('should generate connection query for pagination', () => {
      const schema = generator.generate([basicTable]);

      const connectionQuery = schema.queries.find((q) => q.name === 'usersConnection');
      expect(connectionQuery).toBeDefined();
      expect(connectionQuery!.returnType).toBe('UserConnection!');
      expect(connectionQuery!.args.find((a) => a.name === 'first')).toBeDefined();
      expect(connectionQuery!.args.find((a) => a.name === 'after')).toBeDefined();
    });
  });

  describe('Mutation Generation', () => {
    it('should generate create mutation', () => {
      const schema = generator.generate([basicTable]);

      const createMutation = schema.mutations.find((m) => m.name === 'createUser');
      expect(createMutation).toBeDefined();
      expect(createMutation!.mutationType).toBe('create');
      expect(createMutation!.args.find((a) => a.name === 'input')).toBeDefined();
    });

    it('should generate update mutation', () => {
      const schema = generator.generate([basicTable]);

      const updateMutation = schema.mutations.find((m) => m.name === 'updateUser');
      expect(updateMutation).toBeDefined();
      expect(updateMutation!.mutationType).toBe('update');
      expect(updateMutation!.args.find((a) => a.name === 'id')).toBeDefined();
      expect(updateMutation!.args.find((a) => a.name === 'input')).toBeDefined();
    });

    it('should generate delete mutation', () => {
      const schema = generator.generate([basicTable]);

      const deleteMutation = schema.mutations.find((m) => m.name === 'deleteUser');
      expect(deleteMutation).toBeDefined();
      expect(deleteMutation!.mutationType).toBe('delete');
    });

    it('should generate batch delete mutation', () => {
      const schema = generator.generate([basicTable]);

      const batchDeleteMutation = schema.mutations.find((m) => m.name === 'deleteUsers');
      expect(batchDeleteMutation).toBeDefined();
      expect(batchDeleteMutation!.mutationType).toBe('batchDelete');
    });
  });

  describe('Subscription Generation', () => {
    it('should generate table subscription', () => {
      const schema = generator.generate([basicTable]);

      const tableSub = schema.subscriptions.find((s) => s.name === 'usersChanged');
      expect(tableSub).toBeDefined();
      expect(tableSub!.returnType).toBe('UserSubscriptionPayload!');
    });

    it('should generate item subscription', () => {
      const schema = generator.generate([basicTable]);

      const itemSub = schema.subscriptions.find((s) => s.name === 'userChanged');
      expect(itemSub).toBeDefined();
      expect(itemSub!.args.find((a) => a.name === 'id')).toBeDefined();
    });
  });

  describe('SDL Generation', () => {
    it('should generate valid GraphQL SDL', () => {
      const schema = generator.generate([basicTable]);

      expect(schema.typeDefs).toContain('type User {');
      expect(schema.typeDefs).toContain('type Query {');
      expect(schema.typeDefs).toContain('type Mutation {');
      expect(schema.typeDefs).toContain('type Subscription {');
    });

    it('should include custom scalars', () => {
      const schema = generator.generate([basicTable]);

      expect(schema.typeDefs).toContain('scalar DateTime');
      expect(schema.typeDefs).toContain('scalar Date');
      expect(schema.typeDefs).toContain('scalar JSON');
    });

    it('should include connection types', () => {
      const schema = generator.generate([basicTable]);

      expect(schema.typeDefs).toContain('type UserEdge {');
      expect(schema.typeDefs).toContain('type UserConnection {');
      expect(schema.typeDefs).toContain('type PageInfo {');
    });

    it('should include mutation result types', () => {
      const schema = generator.generate([basicTable]);

      expect(schema.typeDefs).toContain('type UserMutationResult {');
      expect(schema.typeDefs).toContain('type DeleteMutationResult {');
    });

    it('should include subscription payload types', () => {
      const schema = generator.generate([basicTable]);

      expect(schema.typeDefs).toContain('type UserSubscriptionPayload {');
      expect(schema.typeDefs).toContain('enum ChangeType {');
    });
  });

  describe('Configuration Options', () => {
    it('should respect table inclusion list', () => {
      const generator = createSchemaGenerator({
        tables: ['users'],
      });

      const schema = generator.generate(SAMPLE_TABLES);

      expect(schema.types).toHaveLength(1);
      expect(schema.types[0].name).toBe('User');
    });

    it('should respect table exclusion list', () => {
      const generator = createSchemaGenerator({
        excludeTables: ['orders'],
      });

      const schema = generator.generate(SAMPLE_TABLES);

      expect(schema.types).toHaveLength(1);
      expect(schema.types[0].name).toBe('User');
    });

    it('should apply type name prefix', () => {
      const generator = createSchemaGenerator({
        typeNamePrefix: 'My',
      });

      const schema = generator.generate([basicTable]);

      expect(schema.types[0].name).toBe('MyUser');
    });

    it('should apply type name suffix', () => {
      const generator = createSchemaGenerator({
        typeNameSuffix: 'Model',
      });

      const schema = generator.generate([basicTable]);

      expect(schema.types[0].name).toBe('UserModel');
    });

    it('should use custom field naming function', () => {
      const generator = createSchemaGenerator({
        fieldNaming: (name) => name.toUpperCase(),
      });

      const schema = generator.generate([basicTable]);
      const userType = schema.types[0];

      expect(userType.fields.find((f) => f.name === 'ID')).toBeDefined();
      expect(userType.fields.find((f) => f.name === 'EMAIL')).toBeDefined();
    });

    it('should use custom type naming function', () => {
      const generator = createSchemaGenerator({
        typeNaming: (name) => `Custom${name.charAt(0).toUpperCase() + name.slice(1)}`,
      });

      const schema = generator.generate([basicTable]);

      expect(schema.types[0].name).toBe('CustomUsers');
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('generateSchema', () => {
  it('should generate schema using factory function', () => {
    const schema = generateSchema(SAMPLE_TABLES);

    expect(schema.typeDefs).toBeDefined();
    expect(schema.types).toHaveLength(2);
  });

  it('should accept configuration options', () => {
    const schema = generateSchema(SAMPLE_TABLES, {
      tables: ['users'],
    });

    expect(schema.types).toHaveLength(1);
  });
});
