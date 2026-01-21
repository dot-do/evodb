/**
 * @evodb/lakehouse - Schema Operations Tests
 *
 * Comprehensive tests for schema operations including:
 * - Schema inference from JSON data
 * - Complex type handling
 * - Schema serialization/deserialization
 * - Schema evolution edge cases
 * - Compatibility mode edge cases
 */

import { describe, it, expect } from 'vitest';

import {
  // Schema operations
  createSchema,
  createSchemaRef,
  evolveSchema,
  isCompatible,
  inferSchema,
  serializeSchema,
  deserializeSchema,
  SchemaError,

  // Types
  type Schema,
  type SchemaColumn,
  type ColumnType,
  type SchemaChange,
  type CompatibilityMode,
} from '../index.js';

// =============================================================================
// Schema Inference Tests
// =============================================================================

describe('inferSchema', () => {
  it('should infer basic types from samples', () => {
    const samples = [
      { id: 1, name: 'Alice', active: true },
      { id: 2, name: 'Bob', active: false },
    ];

    const schema = inferSchema(samples);

    // Implementation creates a __root__ column for the object itself, plus columns for each field
    expect(schema.columns).toHaveLength(4);

    const idCol = schema.columns.find(c => c.name === 'id');
    expect(idCol?.type).toBe('int64');
    expect(idCol?.nullable).toBe(true); // default nullable

    const nameCol = schema.columns.find(c => c.name === 'name');
    expect(nameCol?.type).toBe('string');

    const activeCol = schema.columns.find(c => c.name === 'active');
    expect(activeCol?.type).toBe('boolean');
  });

  it('should infer timestamp type from ISO strings', () => {
    const samples = [
      { created_at: '2026-01-15T10:30:00Z' },
      { created_at: '2026-01-16T11:45:30.123Z' },
    ];

    const schema = inferSchema(samples);
    const col = schema.columns.find(c => c.name === 'created_at');

    expect(col?.type).toBe('timestamp');
  });

  it('should infer date type from date-only strings', () => {
    const samples = [
      { birth_date: '1990-05-15' },
      { birth_date: '1985-12-25' },
    ];

    const schema = inferSchema(samples);
    const col = schema.columns.find(c => c.name === 'birth_date');

    expect(col?.type).toBe('date');
  });

  it('should infer uuid type from UUID strings', () => {
    const samples = [
      { id: '123e4567-e89b-12d3-a456-426614174000' },
      { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
    ];

    const schema = inferSchema(samples);
    const col = schema.columns.find(c => c.name === 'id');

    expect(col?.type).toBe('uuid');
  });

  it('should infer float64 for floating point numbers', () => {
    const samples = [
      { price: 19.99 },
      { price: 24.50 },
    ];

    const schema = inferSchema(samples);
    const col = schema.columns.find(c => c.name === 'price');

    expect(col?.type).toBe('float64');
  });

  it('should widen int64 to float64 when mixed', () => {
    const samples = [
      { value: 100 },
      { value: 100.5 },
    ];

    const schema = inferSchema(samples);
    const col = schema.columns.find(c => c.name === 'value');

    expect(col?.type).toBe('float64');
  });

  it('should infer array types', () => {
    const samples = [
      { tags: ['a', 'b', 'c'] },
      { tags: ['x', 'y'] },
    ];

    const schema = inferSchema(samples);
    const col = schema.columns.find(c => c.name === 'tags');

    expect(col?.type).toEqual({ type: 'array', elementType: 'string' });
  });

  it('should infer array type from empty array as json', () => {
    const samples = [
      { items: [] },
    ];

    const schema = inferSchema(samples);
    const col = schema.columns.find(c => c.name === 'items');

    expect(col?.type).toEqual({ type: 'array', elementType: 'json' });
  });

  it('should infer json type for nested objects', () => {
    const samples = [
      { metadata: { key: 'value' } },
      { metadata: { another: 123 } },
    ];

    const schema = inferSchema(samples);
    const col = schema.columns.find(c => c.name === 'metadata');

    expect(col?.type).toBe('json');
  });

  it('should handle null values and mark as nullable', () => {
    const samples = [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: null },
    ];

    const schema = inferSchema(samples);
    const emailCol = schema.columns.find(c => c.name === 'email');

    expect(emailCol?.nullable).toBe(true);
  });

  it('should handle undefined values', () => {
    const samples = [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob' }, // email is undefined
    ];

    const schema = inferSchema(samples);
    const emailCol = schema.columns.find(c => c.name === 'email');

    expect(emailCol?.nullable).toBe(true);
  });

  it('should respect nullable: false option', () => {
    const samples = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];

    const schema = inferSchema(samples, { nullable: false });

    for (const col of schema.columns) {
      expect(col.nullable).toBe(false);
    }
  });

  it('should limit samples with maxSamples option', () => {
    const samples = Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      // Later samples have different types
      value: i < 50 ? 'string' : 123,
    }));

    const schema = inferSchema(samples, { maxSamples: 50 });
    const valueCol = schema.columns.find(c => c.name === 'value');

    // Should only see string type from first 50 samples
    expect(valueCol?.type).toBe('string');
  });

  it('should sort columns alphabetically', () => {
    const samples = [
      { zebra: 1, apple: 2, mango: 3 },
    ];

    const schema = inferSchema(samples);

    // __root__ column is created for the object itself
    // Columns are sorted alphabetically: __root__, apple, mango, zebra
    expect(schema.columns[0].name).toBe('__root__');
    expect(schema.columns[1].name).toBe('apple');
    expect(schema.columns[2].name).toBe('mango');
    expect(schema.columns[3].name).toBe('zebra');
  });

  it('should handle mixed type arrays by using json', () => {
    const samples = [
      { items: [1, 'two', true] },
    ];

    const schema = inferSchema(samples);
    const col = schema.columns.find(c => c.name === 'items');

    // Mixed types in array should result in json element type
    expect(col?.type).toEqual({ type: 'array', elementType: 'json' });
  });

  it('should handle nested column paths', () => {
    const samples = [
      { user: { name: 'Alice', age: 30 } },
      { user: { name: 'Bob', age: 25 } },
    ];

    const schema = inferSchema(samples);

    // Should have both user (json) and nested paths
    const userCol = schema.columns.find(c => c.name === 'user');
    expect(userCol?.type).toBe('json');

    const nameCol = schema.columns.find(c => c.name === 'user.name');
    expect(nameCol?.type).toBe('string');

    const ageCol = schema.columns.find(c => c.name === 'user.age');
    expect(ageCol?.type).toBe('int64');
  });
});

// =============================================================================
// Schema Serialization Tests
// =============================================================================

describe('serializeSchema / deserializeSchema', () => {
  it('should round-trip simple schema', () => {
    const original = createSchema([
      { name: 'id', type: 'uuid', nullable: false },
      { name: 'name', type: 'string', nullable: true },
      { name: 'count', type: 'int64', nullable: false, defaultValue: 0 },
    ]);

    const json = serializeSchema(original);
    const restored = deserializeSchema(json);

    expect(restored.schemaId).toBe(original.schemaId);
    expect(restored.version).toBe(original.version);
    expect(restored.columns).toHaveLength(3);
    expect(restored.columns[2].defaultValue).toBe(0);
  });

  it('should preserve complex types', () => {
    const original = createSchema([
      {
        name: 'tags',
        type: { type: 'array', elementType: 'string' },
        nullable: true,
      },
      {
        name: 'metadata',
        type: { type: 'map', keyType: 'string', valueType: 'int64' },
        nullable: true,
      },
    ]);

    const json = serializeSchema(original);
    const restored = deserializeSchema(json);

    expect(restored.columns[0].type).toEqual({ type: 'array', elementType: 'string' });
    expect(restored.columns[1].type).toEqual({ type: 'map', keyType: 'string', valueType: 'int64' });
  });

  it('should preserve doc strings', () => {
    const original = createSchema([
      { name: 'email', type: 'string', nullable: true, doc: 'User email address' },
    ]);

    const json = serializeSchema(original);
    const restored = deserializeSchema(json);

    expect(restored.columns[0].doc).toBe('User email address');
  });

  it('should produce pretty-printed JSON', () => {
    const schema = createSchema([
      { name: 'id', type: 'int64', nullable: false },
    ]);

    const json = serializeSchema(schema);

    expect(json).toContain('\n');
    expect(json).toContain('  '); // Indentation
  });
});

// =============================================================================
// Schema Creation Tests
// =============================================================================

describe('createSchema', () => {
  it('should assign default schemaId and version', () => {
    const schema = createSchema([
      { name: 'id', type: 'int64', nullable: false },
    ]);

    expect(schema.schemaId).toBe(1);
    expect(schema.version).toBe(1);
    expect(schema.createdAt).toBeDefined();
  });

  it('should accept custom schemaId and version', () => {
    const schema = createSchema(
      [{ name: 'id', type: 'int64', nullable: false }],
      5,
      3
    );

    expect(schema.schemaId).toBe(5);
    expect(schema.version).toBe(3);
  });

  it('should normalize columns (remove extra fields)', () => {
    const schema = createSchema([
      {
        name: 'id',
        type: 'int64',
        nullable: false,
        defaultValue: undefined, // Should be stripped
        doc: undefined, // Should be stripped
      },
    ]);

    const col = schema.columns[0];
    expect(col.name).toBe('id');
    expect(col.type).toBe('int64');
    expect(col.nullable).toBe(false);
    expect('defaultValue' in col).toBe(false);
    expect('doc' in col).toBe(false);
  });

  it('should preserve defaultValue when defined', () => {
    const schema = createSchema([
      { name: 'status', type: 'string', nullable: false, defaultValue: 'pending' },
    ]);

    expect(schema.columns[0].defaultValue).toBe('pending');
  });
});

// =============================================================================
// Schema Reference Tests
// =============================================================================

describe('createSchemaRef', () => {
  it('should create schema reference with correct path', () => {
    const ref = createSchemaRef(3);

    expect(ref.schemaId).toBe(3);
    expect(ref.path).toBe('_schema/v3.json');
  });
});

// =============================================================================
// Schema Evolution Edge Cases
// =============================================================================

describe('evolveSchema Edge Cases', () => {
  it('should apply multiple changes in sequence', () => {
    const v1 = createSchema([
      { name: 'id', type: 'int32', nullable: false },
      { name: 'temp', type: 'string', nullable: true },
    ]);

    const v2 = evolveSchema(v1, [
      { type: 'add_column', column: { name: 'email', type: 'string', nullable: true } },
      { type: 'drop_column', columnName: 'temp' },
      { type: 'update_type', columnName: 'id', newType: 'int64' },
    ]);

    expect(v2.columns).toHaveLength(2);
    expect(v2.columns.map(c => c.name)).toContain('id');
    expect(v2.columns.map(c => c.name)).toContain('email');
    expect(v2.columns.map(c => c.name)).not.toContain('temp');

    const idCol = v2.columns.find(c => c.name === 'id');
    expect(idCol?.type).toBe('int64');
  });

  it('should update doc on column', () => {
    const v1 = createSchema([
      { name: 'status', type: 'string', nullable: false },
    ]);

    const v2 = evolveSchema(v1, [
      { type: 'update_doc', columnName: 'status', doc: 'Order status: pending, shipped, delivered' },
    ]);

    expect(v2.columns[0].doc).toBe('Order status: pending, shipped, delivered');
  });

  it('should make required column with default value', () => {
    const v1 = createSchema([
      { name: 'optional_field', type: 'string', nullable: true },
    ]);

    const v2 = evolveSchema(v1, [
      { type: 'make_required', columnName: 'optional_field', defaultValue: 'default' },
    ]);

    expect(v2.columns[0].nullable).toBe(false);
    expect(v2.columns[0].defaultValue).toBe('default');
  });

  it('should throw on rename to existing column', () => {
    const v1 = createSchema([
      { name: 'old_name', type: 'string', nullable: false },
      { name: 'new_name', type: 'string', nullable: true },
    ]);

    expect(() => evolveSchema(v1, [
      { type: 'rename_column', oldName: 'old_name', newName: 'new_name' },
    ])).toThrow(SchemaError);
  });

  it('should throw on update_type for non-existent column', () => {
    const v1 = createSchema([
      { name: 'id', type: 'int32', nullable: false },
    ]);

    expect(() => evolveSchema(v1, [
      { type: 'update_type', columnName: 'nonexistent', newType: 'int64' },
    ])).toThrow(SchemaError);
  });

  it('should throw on make_nullable for non-existent column', () => {
    const v1 = createSchema([
      { name: 'id', type: 'int32', nullable: false },
    ]);

    expect(() => evolveSchema(v1, [
      { type: 'make_nullable', columnName: 'nonexistent' },
    ])).toThrow(SchemaError);
  });

  it('should throw on make_required for non-existent column', () => {
    const v1 = createSchema([
      { name: 'id', type: 'int32', nullable: false },
    ]);

    expect(() => evolveSchema(v1, [
      { type: 'make_required', columnName: 'nonexistent', defaultValue: 0 },
    ])).toThrow(SchemaError);
  });

  it('should throw on update_doc for non-existent column', () => {
    const v1 = createSchema([
      { name: 'id', type: 'int32', nullable: false },
    ]);

    expect(() => evolveSchema(v1, [
      { type: 'update_doc', columnName: 'nonexistent', doc: 'Some doc' },
    ])).toThrow(SchemaError);
  });

  it('should increment schemaId and version on evolution', () => {
    const v1 = createSchema([
      { name: 'id', type: 'int32', nullable: false },
    ], 10, 5);

    const v2 = evolveSchema(v1, [
      { type: 'add_column', column: { name: 'name', type: 'string', nullable: true } },
    ]);

    expect(v2.schemaId).toBe(11);
    expect(v2.version).toBe(6);
  });
});

// =============================================================================
// Schema Compatibility Edge Cases
// =============================================================================

describe('isCompatible Edge Cases', () => {
  it('should allow any changes with mode=none', () => {
    const v1 = createSchema([
      { name: 'id', type: 'int32', nullable: false },
      { name: 'deleted', type: 'string', nullable: true },
    ]);

    const v2 = evolveSchema(v1, [
      { type: 'drop_column', columnName: 'deleted' },
      { type: 'add_column', column: { name: 'required', type: 'string', nullable: false } },
      { type: 'update_type', columnName: 'id', newType: 'string' },
    ]);

    const result = isCompatible(v1, v2, 'none');
    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should check full compatibility (both forward and backward)', () => {
    const v1 = createSchema([
      { name: 'id', type: 'int32', nullable: false },
    ]);

    const v2 = evolveSchema(v1, [
      { type: 'add_column', column: { name: 'email', type: 'string', nullable: true } },
    ]);

    // Adding nullable column is fully compatible
    const result1 = isCompatible(v1, v2, 'full');
    expect(result1.compatible).toBe(true);

    // But dropping a column is not forward compatible
    const v3 = evolveSchema(v2, [
      { type: 'drop_column', columnName: 'email' },
    ]);

    const result2 = isCompatible(v2, v3, 'full');
    expect(result2.compatible).toBe(false);
    expect(result2.errors.some(e => e.includes('forward'))).toBe(true);
  });

  it('should reject making nullable column required without default', () => {
    const v1 = createSchema([
      { name: 'email', type: 'string', nullable: true },
    ]);

    const v2 = evolveSchema(v1, [
      { type: 'make_required', columnName: 'email', defaultValue: '' },
    ]);

    // Remove the default to test
    v2.columns[0].defaultValue = undefined;

    const result = isCompatible(v1, v2, 'backward');
    expect(result.compatible).toBe(false);
    expect(result.errors.some(e => e.includes('required'))).toBe(true);
  });

  it('should allow int64 to float64 widening', () => {
    const v1 = createSchema([
      { name: 'value', type: 'int64', nullable: false },
    ]);

    const v2 = evolveSchema(v1, [
      { type: 'update_type', columnName: 'value', newType: 'float64' },
    ]);

    const result = isCompatible(v1, v2, 'backward');
    expect(result.compatible).toBe(true);
  });

  it('should reject float64 to int64 narrowing', () => {
    const v1 = createSchema([
      { name: 'value', type: 'float64', nullable: false },
    ]);

    const v2 = evolveSchema(v1, [
      { type: 'update_type', columnName: 'value', newType: 'int64' },
    ]);

    const result = isCompatible(v1, v2, 'backward');
    expect(result.compatible).toBe(false);
    expect(result.errors.some(e => e.includes('incompatible'))).toBe(true);
  });

  it('should reject incompatible type changes', () => {
    const v1 = createSchema([
      { name: 'id', type: 'int64', nullable: false },
    ]);

    const v2 = evolveSchema(v1, [
      { type: 'update_type', columnName: 'id', newType: 'boolean' },
    ]);

    const result = isCompatible(v1, v2, 'backward');
    expect(result.compatible).toBe(false);
  });

  it('should handle complex types being compared', () => {
    const v1 = createSchema([
      {
        name: 'tags',
        type: { type: 'array', elementType: 'string' },
        nullable: true,
      },
    ]);

    const v2 = createSchema([
      {
        name: 'tags',
        type: { type: 'array', elementType: 'string' },
        nullable: true,
      },
    ], 2, 2);

    const result = isCompatible(v1, v2, 'backward');
    expect(result.compatible).toBe(true);
  });

  it('should reject changing array element type', () => {
    const v1 = createSchema([
      {
        name: 'items',
        type: { type: 'array', elementType: 'string' },
        nullable: true,
      },
    ]);

    const v2 = createSchema([
      {
        name: 'items',
        type: { type: 'array', elementType: 'int64' },
        nullable: true,
      },
    ], 2, 2);

    const result = isCompatible(v1, v2, 'backward');
    expect(result.compatible).toBe(false);
  });
});

// =============================================================================
// Complex Type Tests
// =============================================================================

describe('Complex Types', () => {
  it('should support struct type', () => {
    const schema = createSchema([
      {
        name: 'address',
        type: {
          type: 'struct',
          fields: [
            { name: 'street', type: 'string' },
            { name: 'city', type: 'string' },
            { name: 'zip', type: 'int32' },
          ],
        },
        nullable: true,
      },
    ]);

    const json = serializeSchema(schema);
    const restored = deserializeSchema(json);

    const addrCol = restored.columns[0];
    const addrType = addrCol.type as { type: 'struct'; fields: { name: string; type: ColumnType }[] };

    expect(addrType.type).toBe('struct');
    expect(addrType.fields).toHaveLength(3);
    expect(addrType.fields[0].name).toBe('street');
  });

  it('should support map type', () => {
    const schema = createSchema([
      {
        name: 'scores',
        type: {
          type: 'map',
          keyType: 'string',
          valueType: 'float64',
        },
        nullable: true,
      },
    ]);

    const mapCol = schema.columns[0];
    const mapType = mapCol.type as { type: 'map'; keyType: ColumnType; valueType: ColumnType };

    expect(mapType.type).toBe('map');
    expect(mapType.keyType).toBe('string');
    expect(mapType.valueType).toBe('float64');
  });

  it('should support nested complex types', () => {
    const schema = createSchema([
      {
        name: 'orders',
        type: {
          type: 'array',
          elementType: {
            type: 'struct',
            fields: [
              { name: 'id', type: 'uuid' },
              {
                name: 'items',
                type: {
                  type: 'array',
                  elementType: {
                    type: 'struct',
                    fields: [
                      { name: 'product', type: 'string' },
                      { name: 'quantity', type: 'int32' },
                    ],
                  },
                },
              },
            ],
          },
        },
        nullable: true,
      },
    ]);

    const ordersType = schema.columns[0].type as {
      type: 'array';
      elementType: { type: 'struct'; fields: unknown[] };
    };

    expect(ordersType.type).toBe('array');
    expect(ordersType.elementType.type).toBe('struct');
    expect(ordersType.elementType.fields).toHaveLength(2);
  });
});

// =============================================================================
// SchemaError Tests
// =============================================================================

describe('SchemaError', () => {
  it('should have correct name property', () => {
    const error = new SchemaError('Test error');
    expect(error.name).toBe('SchemaError');
  });

  it('should preserve error message', () => {
    const error = new SchemaError('Column not found');
    expect(error.message).toBe('Column not found');
  });

  it('should be instanceof Error', () => {
    const error = new SchemaError('Test');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof SchemaError).toBe(true);
  });
});
