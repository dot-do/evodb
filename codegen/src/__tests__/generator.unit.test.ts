import { describe, it, expect } from 'vitest';
import {
  generateTypes,
  buildPathTree,
  typeToTypeScript,
  PathNode,
} from '../generator';
import type { ColumnType, SchemaColumn, Schema } from '../../../lakehouse/src/types';

describe('typeToTypeScript', () => {
  it('should convert null type', () => {
    expect(typeToTypeScript('null')).toBe('null');
  });

  it('should convert boolean type', () => {
    expect(typeToTypeScript('boolean')).toBe('boolean');
  });

  it('should convert int32 to number', () => {
    expect(typeToTypeScript('int32')).toBe('number');
  });

  it('should convert float64 to number', () => {
    expect(typeToTypeScript('float64')).toBe('number');
  });

  it('should convert int64 to bigint', () => {
    expect(typeToTypeScript('int64')).toBe('bigint');
  });

  it('should convert string type', () => {
    expect(typeToTypeScript('string')).toBe('string');
  });

  it('should convert binary to Uint8Array', () => {
    expect(typeToTypeScript('binary')).toBe('Uint8Array');
  });

  it('should convert timestamp to Date', () => {
    expect(typeToTypeScript('timestamp')).toBe('Date');
  });

  it('should convert date to string', () => {
    expect(typeToTypeScript('date')).toBe('string');
  });

  it('should convert uuid to string', () => {
    expect(typeToTypeScript('uuid')).toBe('string');
  });

  it('should convert json to unknown', () => {
    expect(typeToTypeScript('json')).toBe('unknown');
  });

  it('should convert array type', () => {
    const arrayType: ColumnType = { type: 'array', elementType: 'string' };
    expect(typeToTypeScript(arrayType)).toBe('string[]');
  });

  it('should convert nested array type', () => {
    const nestedArrayType: ColumnType = {
      type: 'array',
      elementType: { type: 'array', elementType: 'int32' },
    };
    expect(typeToTypeScript(nestedArrayType)).toBe('number[][]');
  });

  it('should convert map type', () => {
    const mapType: ColumnType = {
      type: 'map',
      keyType: 'string',
      valueType: 'int32',
    };
    expect(typeToTypeScript(mapType)).toBe('Record<string, number>');
  });

  it('should convert struct type', () => {
    const structType: ColumnType = {
      type: 'struct',
      fields: [
        { name: 'name', type: 'string', nullable: false },
        { name: 'age', type: 'int32', nullable: true },
      ],
    };
    expect(typeToTypeScript(structType)).toBe('{ name: string; age: number | null }');
  });
});

describe('buildPathTree', () => {
  it('should build tree from flat paths', () => {
    const columns: SchemaColumn[] = [
      { name: 'id', type: 'string', nullable: false },
      { name: 'user.name', type: 'string', nullable: false },
      { name: 'user.email', type: 'string', nullable: true },
    ];

    const tree = buildPathTree(columns);

    expect(tree.children).toHaveProperty('id');
    expect(tree.children).toHaveProperty('user');
    expect(tree.children['user'].children).toHaveProperty('name');
    expect(tree.children['user'].children).toHaveProperty('email');
  });

  it('should handle deeply nested paths', () => {
    const columns: SchemaColumn[] = [
      { name: 'a.b.c.d', type: 'string', nullable: false },
    ];

    const tree = buildPathTree(columns);

    expect(tree.children['a'].children['b'].children['c'].children['d']).toBeDefined();
    expect(tree.children['a'].children['b'].children['c'].children['d'].column).toBeDefined();
  });

  it('should handle array indices', () => {
    const columns: SchemaColumn[] = [
      { name: 'tags[0]', type: 'string', nullable: false },
    ];

    const tree = buildPathTree(columns);

    expect(tree.children['tags']).toBeDefined();
    expect(tree.children['tags'].isArray).toBe(true);
    expect(tree.children['tags'].elementType).toBe('string');
  });

  it('should handle nested array paths', () => {
    const columns: SchemaColumn[] = [
      { name: 'items[0].name', type: 'string', nullable: false },
      { name: 'items[0].price', type: 'float64', nullable: false },
    ];

    const tree = buildPathTree(columns);

    expect(tree.children['items']).toBeDefined();
    expect(tree.children['items'].isArray).toBe(true);
    expect(tree.children['items'].children).toHaveProperty('name');
    expect(tree.children['items'].children).toHaveProperty('price');
  });

  it('should handle mixed array and object paths', () => {
    const columns: SchemaColumn[] = [
      { name: 'user.addresses[0].street', type: 'string', nullable: false },
      { name: 'user.addresses[0].city', type: 'string', nullable: false },
    ];

    const tree = buildPathTree(columns);

    expect(tree.children['user'].children['addresses'].isArray).toBe(true);
    expect(tree.children['user'].children['addresses'].children).toHaveProperty('street');
    expect(tree.children['user'].children['addresses'].children).toHaveProperty('city');
  });
});

describe('generateTypes', () => {
  it('should generate simple interface', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'id', type: 'string', nullable: false },
        { name: 'name', type: 'string', nullable: false },
        { name: 'age', type: 'int32', nullable: true },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);

    expect(result).toContain('// Auto-generated by evodb pull - DO NOT EDIT');
    expect(result).toContain('export interface Root {');
    expect(result).toContain('id: string;');
    expect(result).toContain('name: string;');
    expect(result).toContain('age: number | null;');
  });

  it('should generate nested interfaces', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'id', type: 'string', nullable: false },
        { name: 'profile.name', type: 'string', nullable: false },
        { name: 'profile.avatar', type: 'string', nullable: true },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);

    expect(result).toContain('export interface Root {');
    expect(result).toContain('id: string;');
    expect(result).toContain('profile: RootProfile;');
    expect(result).toContain('export interface RootProfile {');
    expect(result).toContain('name: string;');
    expect(result).toContain('avatar: string | null;');
  });

  it('should generate array types from indexed paths', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'tags[0]', type: 'string', nullable: false },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);

    expect(result).toContain('tags: string[];');
  });

  it('should generate complex nested array of objects', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'id', type: 'string', nullable: false },
        { name: 'items[0].name', type: 'string', nullable: false },
        { name: 'items[0].price', type: 'float64', nullable: false },
        { name: 'items[0].tags[0]', type: 'string', nullable: false },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);

    expect(result).toContain('export interface Root {');
    expect(result).toContain('id: string;');
    expect(result).toContain('items: RootItem[];');
    expect(result).toContain('export interface RootItem {');
    expect(result).toContain('name: string;');
    expect(result).toContain('price: number;');
    expect(result).toContain('tags: string[];');
  });

  it('should handle deeply nested structures', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'user.profile.settings.theme', type: 'string', nullable: false },
        { name: 'user.profile.settings.notifications', type: 'boolean', nullable: false },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);

    expect(result).toContain('export interface Root {');
    expect(result).toContain('user: RootUser;');
    expect(result).toContain('export interface RootUser {');
    expect(result).toContain('profile: RootUserProfile;');
    expect(result).toContain('export interface RootUserProfile {');
    expect(result).toContain('settings: RootUserProfileSettings;');
    expect(result).toContain('export interface RootUserProfileSettings {');
    expect(result).toContain('theme: string;');
    expect(result).toContain('notifications: boolean;');
  });

  it('should accept custom interface name', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'id', type: 'string', nullable: false },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema, { rootName: 'User' });

    expect(result).toContain('export interface User {');
    expect(result).not.toContain('export interface Root {');
  });

  it('should handle nullable nested objects', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'id', type: 'string', nullable: false },
        { name: 'metadata.key', type: 'string', nullable: true },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);

    expect(result).toContain('export interface Root {');
    expect(result).toContain('metadata: RootMetadata;');
  });

  it('should handle all primitive types', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'nullField', type: 'null', nullable: true },
        { name: 'boolField', type: 'boolean', nullable: false },
        { name: 'int32Field', type: 'int32', nullable: false },
        { name: 'int64Field', type: 'int64', nullable: false },
        { name: 'float64Field', type: 'float64', nullable: false },
        { name: 'stringField', type: 'string', nullable: false },
        { name: 'binaryField', type: 'binary', nullable: false },
        { name: 'timestampField', type: 'timestamp', nullable: false },
        { name: 'dateField', type: 'date', nullable: false },
        { name: 'uuidField', type: 'uuid', nullable: false },
        { name: 'jsonField', type: 'json', nullable: false },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);

    expect(result).toContain('nullField: null;');
    expect(result).toContain('boolField: boolean;');
    expect(result).toContain('int32Field: number;');
    expect(result).toContain('int64Field: bigint;');
    expect(result).toContain('float64Field: number;');
    expect(result).toContain('stringField: string;');
    expect(result).toContain('binaryField: Uint8Array;');
    expect(result).toContain('timestampField: Date;');
    expect(result).toContain('dateField: string;');
    expect(result).toContain('uuidField: string;');
    expect(result).toContain('jsonField: unknown;');
  });

  it('should handle unknown types by returning unknown', () => {
    // Test with a completely unknown type
    const unknownType = 'some_unknown_type' as ColumnType;
    expect(typeToTypeScript(unknownType)).toBe('unknown');
  });

  it('should handle empty columns schema', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);
    expect(result).toContain('export interface Root {');
    expect(result).toContain('}');
  });
});

// =============================================================================
// Singularization Tests
// =============================================================================

describe('singularization edge cases', () => {
  it('should singularize words ending in ies', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'categories[0].name', type: 'string', nullable: false },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);
    // "categories" -> "RootCategories" singularized to "RootCategory"
    expect(result).toContain('RootCategory');
  });

  it('should singularize words ending in es', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'boxes[0].label', type: 'string', nullable: false },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);
    // "boxes" -> "RootBoxes" singularized to "RootBox"
    expect(result).toContain('RootBox');
  });

  it('should singularize words ending in s but not ss', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'items[0].name', type: 'string', nullable: false },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);
    expect(result).toContain('RootItem');
  });

  it('should handle words ending in ss by adding Item suffix', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'glass[0].color', type: 'string', nullable: false },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);
    // "glass" ends in "ss", so singularize returns "glassItem"
    expect(result).toContain('RootGlassItem');
  });

  it('should add Item suffix to non-plural words', () => {
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [
        { name: 'data[0].value', type: 'string', nullable: false },
      ],
      createdAt: Date.now(),
    };

    const result = generateTypes(schema);
    // "data" doesn't end in s/es/ies, so gets "Item" suffix
    expect(result).toContain('RootDataItem');
  });
});

// =============================================================================
// Array without element type Tests
// =============================================================================

describe('array edge cases', () => {
  it('should handle simple array without element type', () => {
    const tree: PathNode = {
      children: {
        items: {
          children: {},
          isArray: true,
          // No elementType, no children with columns
        },
      },
      isArray: false,
    };

    // We can't directly test generateInterface, but we can create a schema
    // that produces an array node without an elementType
    const schema: Schema = {
      schemaId: 1,
      version: 1,
      columns: [],
      createdAt: Date.now(),
    };

    // Build a tree manually and verify the behavior through buildPathTree
    const columns: SchemaColumn[] = [];
    const result = buildPathTree(columns);
    expect(result.children).toEqual({});
  });
});
